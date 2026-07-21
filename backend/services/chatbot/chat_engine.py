"""
Chat Engine — MCP-driven tool routing for the F1 Strategy chat.

Replaces the legacy regex/keyword extractor + JSON-in-prompt classifier
with a single LLM round-trip that uses OpenAI-style ``tools=`` function
calling.  Tool schemas are pulled live from the FastMCP server so the
chat and the public ``/mcp`` endpoint share one source of truth.

Flow (streaming variant):
    1. Pull tool list from FastMCP via the in-process MCP client.
    2. Send the user message + history + system prompt to the LLM with
       ``tools=`` populated.  The model decides whether to call a tool or
       reply in plain text.
    3. If the model returned a tool_call, dispatch it through MCP and
       emit a ``tool_result`` SSE event (rich rendering on the frontend).
    4. Make a second LLM call (no ``tools=``) feeding back the tool's
       output as a ``role=tool`` message.  Emit the summary as a single
       ``token`` SSE event.
    5. If the first call already produced text (no tool_call), emit it
       directly — covers casual chat, meta questions, RAG fallback.

The whole module is async because the FastMCP client is async; the LLM
provider calls remain blocking ``requests`` calls but run inside the
event loop without harm at the chat's traffic levels.

Note on streaming: by default the summary text still arrives as a single
``token`` event — we do NOT chunk it artificially just to fake a typing
animation.  Callers may opt into live deltas by passing
``stream_tokens=True`` to ``stream_response``; that switches the
tool-summary call onto the provider's native ``stream=True`` path and
emits one ``token`` event per delta instead.  The first call (the model
deciding whether to call a tool) always stays non-streaming — its
casual-chat replies are short enough that one event is fine.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Callable, Generator

from backend.core.config import clamp_max_tokens
from backend.models.tool_schemas import DisplayType, TOOL_DISPLAY_MAP, ToolName, is_tool_allowed
from backend.services.chatbot.llm_service import build_messages, send_message, stream_message
from backend.services.chatbot.mcp_bridge import (
    call_mcp_tool,
    coerce_tool_arguments,
    list_openai_tools,
)
from backend.services.chatbot.stage_tracker import set_stage

logger = logging.getLogger(__name__)


# Cost cap A3 (#224): exactly one tool is dispatched per turn. This bounds the
# per-message tool reach so injected text cannot chain N expensive tools from a
# single message. ``_first_tool_call`` enforces it by construction — do not widen
# it to return a list without re-checking this invariant.
_MAX_TOOLS_PER_TURN = 1

# Sentinel returned by ``next(iterator, default)`` in ``_bridge_sync_stream``
# once the wrapped generator is exhausted — distinct from any real chunk value
# (including an empty string), so it can never be mistaken for streamed text.
_SYNC_STREAM_DONE = object()


# Pirelli-style brevity for the chat: short, expert, bilingual.  The model
# does not need extraction rules anymore — the tools= schema tells it
# what is callable; this prompt only sets tone and meta-question handling.
_SYSTEM_PROMPT = (
    "You are the F1 Strategy Assistant — a bilingual (English / Spanish) "
    "expert embedded in a real-time race telemetry and simulation system.\n\n"
    "TOOL CALLING\n"
    "- The tools= parameter lists every F1 strategy and telemetry tool "
    "you can call.  Use them when the user asks for predictions, "
    "telemetry data, race comparisons, regulations lookups, or strategy "
    "recommendations.\n"
    "- Only call ONE tool per turn.  Pick the best match.\n"
    "- For casual greetings, general F1 questions (rules, history, "
    "concepts, terminology), and meta questions ('what tools do you "
    "have?', 'who are you?') — answer in plain text WITHOUT calling a "
    "tool.\n\n"
    "INTENT → TOOL CHEAT SHEET\n"
    "- 'compare / vs / contra' + two drivers + telemetry / speed / "
    "fastest lap / vuelta rápida / qualifying lap → call **compare_drivers** "
    "(returns fastest-lap telemetry overlay).  Do NOT use predict_pace "
    "for this, predict_pace forecasts a future race lap, not historical "
    "qualifying.\n"
    "- speed / throttle / brake trace for ONE driver on ONE lap → "
    "**get_telemetry**.\n"
    "- list of lap times across a stint → **get_lap_times**.\n"
    "- full race overview, positions, lap-by-lap → **get_race_data**.\n"
    "- 'predict pace / ritmo' for a SINGLE driver on a SPECIFIC race "
    "lap → **predict_pace** (XGBoost next-lap forecast).\n"
    "- tyre / degradation / cliff → **predict_tire**.\n"
    "- pit / undercut / overcut → **predict_pit**.\n"
    "- overtake / safety car probability → **predict_situation**.\n"
    "- team radio NLP → **analyze_radio**.\n"
    "- full strategy decision (all sub-agents + Monte Carlo) → "
    "**recommend_strategy**.\n"
    "- FIA rules / regulations / sporting code → **query_regulations**.\n"
    "- list helpers: **list_available_gps**, **list_available_drivers**, "
    "**get_lap_range**.\n\n"
    "PARAMETER DEFAULTS\n"
    "- session: use 'R' (race) unless the user explicitly mentions "
    "qualifying ('Q'), sprint qualifying ('SQ'), sprint ('S'), or "
    "practice ('FP1' / 'FP2' / 'FP3').  'vuelta rápida' / 'fastest lap' "
    "WITHOUT a session word implies 'R' (race fastest lap).\n"
    "- year: defaults to 2025 when the user does not give one.  Valid "
    "range 2023-2025.\n"
    "- driver: pass the 3-letter code (VER, HAM, LEC, NOR, PIA, …).  "
    "Surnames also work but codes are preferred.\n"
    "- Grand Prix: pass the canonical name.  The backend accepts country "
    "and city forms (Australia/Melbourne, Italy/Monza, Belgium/Spa).\n"
    "- lap: NEVER default to 1 if the user did not give a lap.  Lap 1 "
    "almost never has data (formation lap).  If a tool requires a lap "
    "and the user did not provide one, either pick a sensible mid-race "
    "lap (around the user's intent) OR call get_lap_range first to find "
    "the valid window.  When in doubt, ask the user.\n"
    "- If the user's last message gives an explicit year, GP, driver, "
    "or lap, prefer those values over any defaults.\n\n"
    "RESPONSE RULES\n"
    "- ALWAYS respond in the same language the user wrote in.\n"
    "- Never fabricate tool outputs, telemetry numbers, lap times or "
    "predictions.  If you do not know, say so.\n"
    "- When summarising a tool result, lead with the strategic insight "
    "in 2-4 sentences, then any caveats.  Keep responses under 200 words "
    "unless the user asks for detail."
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def stream_response(
    text: str,
    request_id: str,
    image: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    context: dict[str, Any] | None = None,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 800,
    stream_tokens: bool = False,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Stream the chat response as a sequence of (event_name, payload) tuples.

    The caller (FastAPI endpoint) is responsible for SSE-formatting each
    yielded tuple — keeping the engine framework-agnostic so it can also
    feed a future WebSocket / CLI consumer without changes.

    Args:
        stream_tokens: When True, the tool-summary leg (the second LLM
            call, made after a tool result comes back) emits live token
            deltas instead of one full-text event. Default False leaves
            every existing caller on today's single-``token`` turn.

    Yielded events:
        ("stage", {"stage": <name>})           — backend phase advanced
        ("tool_result", {"tool_result": ...})  — structured tool output
        ("token", {"token": <chunk>})          — LLM text chunk (one delta
                                                   per event when
                                                   stream_tokens=True)
        ("done", {...})                         — final marker + metadata
    """
    # Cost cap A3 (#224): clamp the client-controlled budget down to the server
    # cap before any provider call. Covers both /tool-message and
    # /tool-message-stream (get_response funnels through here), and both LLM
    # round-trips below reuse this clamped value.
    max_tokens = clamp_max_tokens(max_tokens)
    set_stage(request_id, "preparing_tools")
    yield ("stage", {"stage": "preparing_tools"})
    tools = await _safe_list_tools()

    set_stage(request_id, "model_choosing_tool")
    yield ("stage", {"stage": "model_choosing_tool"})
    base_messages = await asyncio.to_thread(
        build_messages,
        user_message=text,
        image_base64=image,
        system_prompt=_SYSTEM_PROMPT,
        chat_history=chat_history,
        context=context,
    )
    first_response = await _safe_send(
        base_messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        tools=tools,
    )
    assistant_msg = _extract_message(first_response)
    tool_call = _first_tool_call(assistant_msg)

    if tool_call is None:
        async for event in _stream_plain_response(
            assistant_msg,
            request_id,
            first_response,
            base_messages=base_messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            stream_tokens=stream_tokens,
        ):
            yield event
        return

    async for event in _stream_tool_response(
        tool_call=tool_call,
        assistant_msg=assistant_msg,
        request_id=request_id,
        base_messages=base_messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        stream_tokens=stream_tokens,
    ):
        yield event


async def get_response(
    text: str,
    request_id: str,
    image: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    context: dict[str, Any] | None = None,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 800,
) -> dict[str, Any]:
    """Non-streaming variant — returns the same response dict in one shot.

    Useful for the JSON ``/chat/tool-message`` endpoint and any caller
    that does not want to handle SSE.  Internally we drive the streaming
    generator and accumulate the events so behaviour stays consistent.
    """
    accumulated_text = ""
    tool_result_payload: dict[str, Any] | None = None
    metadata: dict[str, Any] = {}
    async for event_name, payload in stream_response(
        text=text,
        request_id=request_id,
        image=image,
        chat_history=chat_history,
        context=context,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    ):
        if event_name == "token":
            accumulated_text += payload.get("token", "")
        elif event_name == "tool_result":
            tool_result_payload = payload.get("tool_result")
        elif event_name == "done":
            metadata = {k: v for k, v in payload.items() if k != "stage"}

    return {
        "response": accumulated_text,
        "tool_result": tool_result_payload,
        "llm_model": metadata.get("llm_model"),
        "tokens_used": metadata.get("tokens_used"),
    }


# ---------------------------------------------------------------------------
# Internal helpers — streaming branches
# ---------------------------------------------------------------------------

async def _stream_plain_response(
    assistant_msg: dict[str, Any],
    request_id: str,
    raw_response: dict[str, Any],
    *,
    base_messages: list[dict[str, Any]],
    model: str | None,
    temperature: float,
    max_tokens: int,
    stream_tokens: bool = False,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Stream the LLM's plain text reply (no tool was called).

    The tool-router first call must be non-streaming (it has to see the whole
    response to know whether a tool_call was requested), so its text arrives
    whole. When ``stream_tokens`` is set we re-issue that reply as a live
    token stream — no ``tools=`` — so casual chat animates for parity with the
    tool-summary leg; the already-produced text is the fallback if streaming
    fails.
    """
    text = _strip_leaked_tool_call((assistant_msg.get("content") or "").strip())
    if not text:
        text = (
            "_(No response from the language model. Try rephrasing the "
            "question or check the backend logs.)_"
        )

    set_stage(request_id, "composing_response")
    yield ("stage", {"stage": "composing_response"})

    if stream_tokens:
        async for event in _stream_plain_deltas(
            base_messages, model, temperature, max_tokens, fallback_text=text
        ):
            yield event
        return

    yield ("token", {"token": text})
    yield ("done", _done_metadata(raw_response))


async def _stream_refused_tool(
    tool_name: str,
    request_id: str,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Emit a refusal for a non-allowlisted tool — no dispatch, no LLM call.

    Security A2 (#224): keeps the SSE contract (stage → token → done) intact so
    the frontend renders the refusal like any plain reply, while guaranteeing the
    MCP client is never touched for a disallowed name.
    """
    message = f"_The `{tool_name}` tool is not available in this chat._"
    set_stage(request_id, "composing_response")
    yield ("stage", {"stage": "composing_response"})
    yield ("token", {"token": message})
    yield ("done", {})


async def _stream_tool_response(
    tool_call: dict[str, Any],
    assistant_msg: dict[str, Any],
    request_id: str,
    base_messages: list[dict[str, Any]],
    model: str | None,
    temperature: float,
    max_tokens: int,
    stream_tokens: bool = False,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Dispatch the model's tool_call, stream the tool_result + summary."""
    tool_name = tool_call["function"]["name"]
    tool_args = coerce_tool_arguments(tool_call["function"].get("arguments"))

    # Security A2 (#224): default-deny. The mcp_bridge filter already hides
    # non-allowed tools from the model, but a hallucinated or leaked name must
    # never reach dispatch — refuse here without calling the MCP client.
    if not is_tool_allowed(tool_name):
        logger.warning("Refused disallowed tool call from the model: %s", tool_name)
        async for event in _stream_refused_tool(tool_name, request_id):
            yield event
        return

    set_stage(request_id, f"calling_{tool_name}")
    yield ("stage", {"stage": f"calling_{tool_name}"})
    tool_data, tool_error = await _safe_call_tool(tool_name, tool_args)

    tool_result_payload = _build_tool_result_payload(tool_name, tool_data, tool_error)
    if tool_result_payload is not None:
        yield ("tool_result", {"tool_result": tool_result_payload})

    set_stage(request_id, "summarizing_with_llm")
    yield ("stage", {"stage": "summarizing_with_llm"})
    summary_messages = _build_summary_messages(
        base_messages=base_messages,
        assistant_msg=assistant_msg,
        tool_call=tool_call,
        tool_data=tool_data,
        tool_error=tool_error,
    )

    if stream_tokens:
        async for event in _stream_summary_deltas(
            summary_messages, model, temperature, max_tokens, tool_name, tool_error,
        ):
            yield event
        return

    summary_response = await _safe_send(
        summary_messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    summary_text = _extract_text(summary_response) or _fallback_summary(tool_name, tool_error)

    yield ("token", {"token": summary_text})

    yield ("done", _done_metadata(summary_response))


async def _stream_summary_deltas(
    summary_messages: list[dict[str, Any]],
    model: str | None,
    temperature: float,
    max_tokens: int,
    tool_name: str,
    tool_error: str | None,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Stream the tool-summary LLM call as live token deltas.

    Opt-in counterpart to the single ``token`` event the caller emits by
    default.  If the provider's stream fails before any text arrives — a
    model/provider combination that does not honour ``stream=True``, a
    dropped connection, and so on — we fall back to the ordinary
    non-streaming call, so turning this flag on can only add live deltas,
    never turn a turn that used to work into a failed one.
    """
    collected = ""
    try:
        async for delta in _bridge_sync_stream(
            lambda: stream_message(
                messages=summary_messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        ):
            collected += delta
            yield ("token", {"token": delta})
    except Exception:
        logger.exception("Token streaming failed for the summary call")
        if not collected:
            summary_response = await _safe_send(
                summary_messages, model=model, temperature=temperature, max_tokens=max_tokens,
            )
            summary_text = _extract_text(summary_response) or _fallback_summary(tool_name, tool_error)
            yield ("token", {"token": summary_text})
            yield ("done", _done_metadata(summary_response))
            return
        # Some deltas already reached the client — do not replay a fallback
        # summary on top of them, just close the turn out cleanly.
        yield ("done", {"llm_model": model, "tokens_used": None})
        return

    if not collected.strip():
        yield ("token", {"token": _fallback_summary(tool_name, tool_error)})

    yield ("done", {"llm_model": model, "tokens_used": None})


async def _stream_plain_deltas(
    messages: list[dict[str, Any]],
    model: str | None,
    temperature: float,
    max_tokens: int,
    *,
    fallback_text: str,
) -> AsyncGenerator[tuple[str, dict[str, Any]], None]:
    """Stream a plain (no-tool) reply as live token deltas.

    The no-tool counterpart to ``_stream_summary_deltas``: re-issues the
    reply through the provider's streaming path (no ``tools=``) so casual
    chat animates like a tool answer instead of arriving whole.
    ``fallback_text`` is the text the non-streaming first call already
    produced — emitted verbatim if the stream yields nothing (a provider
    that does not honour ``stream=True``, a dropped connection), so turning
    streaming on can only add live deltas, never lose a reply that worked.
    """
    collected = ""
    try:
        async for delta in _bridge_sync_stream(
            lambda: stream_message(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        ):
            collected += delta
            yield ("token", {"token": delta})
    except Exception:
        logger.exception("Token streaming failed for the plain reply")
        if not collected:
            yield ("token", {"token": fallback_text})
        yield ("done", {"llm_model": model, "tokens_used": None})
        return

    if not collected.strip():
        yield ("token", {"token": fallback_text})

    yield ("done", {"llm_model": model, "tokens_used": None})


# ---------------------------------------------------------------------------
# Internal helpers — small, single-purpose, no hidden side effects
# ---------------------------------------------------------------------------

async def _safe_list_tools() -> list[dict[str, Any]]:
    """Fetch the FastMCP tool catalog, falling back to an empty list on error.

    A failure here means the LLM cannot pick a tool but can still reply
    in plain text — the chat must keep working even if MCP is misconfigured.
    """
    try:
        return await list_openai_tools()
    except Exception:
        logger.exception("Failed to list MCP tools; the chat will reply text-only.")
        return []


async def _safe_call_tool(name: str, args: dict[str, Any]) -> tuple[Any, str | None]:
    """Dispatch a tool through MCP, returning (data, error_message)."""
    try:
        data = await call_mcp_tool(name, args)
        return data, None
    except Exception as exc:
        logger.exception("MCP tool %s failed", name)
        return None, str(exc)


async def _safe_send(
    messages: list[dict[str, Any]],
    *,
    model: str | None,
    temperature: float,
    max_tokens: int,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Wrap ``send_message`` so any provider hiccup yields an empty response.

    The blocking ``requests`` call runs in a worker thread (``asyncio.to_thread``)
    so a slow LLM turn does not stall the event loop - and with it the concurrent
    SSE sim + voice streams (LLM-cost L-3). Caller treats an empty response as
    "no tool call, no text" and degrades to a fallback message rather than
    crashing the SSE stream; a failure also invalidates the provider preflight.
    """
    try:
        return await asyncio.to_thread(
            send_message,
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
            tools=tools or None,
        )
    except Exception:
        logger.exception("LLM provider call failed")
        return {}


async def _bridge_sync_stream(make_generator: Callable[[], Generator[str, None, None]]) -> AsyncGenerator[str, None]:
    """Turn a blocking text generator into an async one without stalling the loop.

    ``stream_message`` is a plain ``requests``-based generator — there is no
    async provider client — so every ``next()`` call blocks on network I/O
    while it waits for the next chunk. Running each ``next()`` through
    ``asyncio.to_thread`` keeps that wait off the event loop, the same
    reasoning ``_safe_send`` already applies to the non-streaming call, so
    concurrent SSE streams (the sim, voice, other chat turns) stay responsive
    while this one is mid-response.
    """
    iterator = iter(make_generator())
    while True:
        chunk = await asyncio.to_thread(next, iterator, _SYNC_STREAM_DONE)
        if chunk is _SYNC_STREAM_DONE:
            return
        yield chunk


def _extract_message(response: dict[str, Any]) -> dict[str, Any]:
    """Return ``choices[0].message`` or an empty dict if the shape is wrong."""
    choices = response.get("choices") or []
    if not choices:
        return {}
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    return message if isinstance(message, dict) else {}


def _extract_text(response: dict[str, Any]) -> str:
    """Pull plain text out of an LLM response, or empty string.

    Some models (notably smaller / non-instruct variants) occasionally
    emit a tool-call attempt as plain text using the deprecated
    ``to=functions.<name>`` syntax instead of populating the proper
    ``tool_calls`` field.  We strip that leakage so the user does not
    see raw protocol scaffolding in the chat bubble.
    """
    raw = (_extract_message(response).get("content") or "").strip()
    return _strip_leaked_tool_call(raw)


def _strip_leaked_tool_call(text: str) -> str:
    """Remove deprecated ``to=functions.X {...}`` blocks from a response.

    Matches both single-line and JSON-on-next-line forms so the cleanup
    works whether the model put the JSON inline or on the following
    line.  Surrounding whitespace is collapsed so the user never sees
    a blank gap where the leak was.
    """
    import re

    pattern = re.compile(
        r"to=functions\.[A-Za-z0-9_]+\s*[^\n{]*\n?\s*\{.*?\}\s*",
        re.DOTALL,
    )
    cleaned = pattern.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _first_tool_call(message: dict[str, Any]) -> dict[str, Any] | None:
    """Return the first OpenAI-style tool_call from an assistant message.

    Cost cap A3 (#224): this is where the ``_MAX_TOOLS_PER_TURN == 1`` invariant
    lives — only the first proposed tool is ever dispatched, so one message can
    reach at most one tool. Widening this to return several would defeat the cap.
    """
    tool_calls = message.get("tool_calls") or []
    if not tool_calls:
        return None
    first = tool_calls[0]
    return first if isinstance(first, dict) else None


def _build_summary_messages(
    base_messages: list[dict[str, Any]],
    assistant_msg: dict[str, Any],
    tool_call: dict[str, Any],
    tool_data: Any,
    tool_error: str | None,
) -> list[dict[str, Any]]:
    """Append the assistant tool_call + tool result so the next LLM call can summarise.

    OpenAI's chat completions API requires that every ``tool_call`` in
    an assistant message be answered by a matching ``role=tool`` message
    with the same ``tool_call_id``; otherwise the next call fails with
    HTTP 400.  We only execute the first tool_call per turn (single-tool
    design choice), so we trim the assistant message to expose only that
    call before re-sending it.  This keeps the protocol contract intact.

    On error we tag the payload as such and append a user nudge so the
    LLM responds with a concrete recovery suggestion in the user's
    language (e.g. "lap 1 has no data, try lap 2") instead of just
    parroting the error string back.
    """
    pruned_assistant = _assistant_with_only(assistant_msg, tool_call)

    if tool_error:
        payload_for_llm = {"error": tool_error, "tool": tool_call["function"].get("name")}
    else:
        payload_for_llm = _trim_for_llm(tool_data)

    tool_message = {
        "role": "tool",
        "tool_call_id": tool_call.get("id") or "tool_call",
        "content": json.dumps(payload_for_llm, default=str, ensure_ascii=False)[:4000],
    }
    messages = base_messages + [pruned_assistant, tool_message]
    if tool_error:
        messages.append({
            "role": "user",
            "content": (
                "The tool returned an error.  In ONE short paragraph (≤60 words), "
                "explain to me what went wrong and suggest one concrete fix — for "
                "example a different lap, driver, or Grand Prix.  Reply in my "
                "original language.  Do not repeat the raw error string."
            ),
        })
    else:
        messages.append({
            "role": "user",
            "content": (
                "The tool's result is ALREADY shown to me as a card, chart, or "
                "table right above your reply, so do NOT restate the raw numbers "
                "or re-list the items — that would just duplicate what I can see.  "
                "In one or two short sentences, add the insight: what stands out "
                "and what it means for strategy.  Reply in my original language."
            ),
        })
    return messages


def _assistant_with_only(assistant_msg: dict[str, Any], tool_call: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *assistant_msg* with ``tool_calls`` reduced to just *tool_call*.

    Necessary because we only dispatch one tool per turn but the model
    sometimes proposes several; OpenAI then expects a tool answer for
    every proposed call.  By stripping the unanswered ones we keep the
    follow-up call valid while preserving the single-tool design.
    """
    pruned = dict(assistant_msg)
    pruned["tool_calls"] = [tool_call]
    return pruned


def _trim_for_llm(data: Any) -> Any:
    """Cap long arrays so the summary prompt stays within the token budget.

    Mirrors the previous behaviour of ``StrategyHandler._trim_for_llm`` but
    without restricting the trim to specific keys — anything that ends up
    above the threshold gets truncated with a marker so the LLM knows.
    """
    if isinstance(data, dict):
        return {key: _trim_for_llm(value) for key, value in data.items()}
    if isinstance(data, list) and len(data) > 20:
        return data[:20] + [f"...({len(data) - 20} more items truncated)"]
    return data


def _build_tool_result_payload(
    name: str,
    tool_data: Any,
    tool_error: str | None,
) -> dict[str, Any] | None:
    """Wrap the tool output in the ToolResultData shape the frontend expects.

    Frontends consume ``{tool_name, display_type, data, summary}`` to decide
    which renderer to use (chart / metrics / strategy_card / table / text).
    Errors get rendered as text so the user still sees what went wrong.
    """
    if tool_data is None and tool_error is None:
        return None

    display_type = _resolve_display_type(name, tool_error is not None)
    return {
        "tool_name": name,
        "display_type": display_type.value,
        "data": tool_data if tool_data is not None else {"error": tool_error},
        "summary": tool_error or "",
    }


def _resolve_display_type(tool_name: str, has_error: bool) -> DisplayType:
    """Pick the rendering style for *tool_name*, defaulting to text."""
    if has_error:
        return DisplayType.TEXT

    candidates = (tool_name, _strip_prefix(tool_name))
    for candidate in candidates:
        try:
            return TOOL_DISPLAY_MAP.get(ToolName(candidate), DisplayType.TEXT)
        except ValueError:
            continue
    return DisplayType.TEXT


def _strip_prefix(name: str) -> str:
    """Drop FastMCP sub-server prefixes (e.g. ``telemetry__get_lap_times``)."""
    for separator in ("__", "_"):
        prefix, _, suffix = name.partition(separator)
        if prefix and suffix and prefix in {"telemetry", "comparison", "circuit"}:
            return suffix
    return name


def _fallback_summary(tool_name: str, tool_error: str | None) -> str:
    """Produce a short stand-in when the LLM summary call returns nothing."""
    if tool_error:
        return (
            f"_The {tool_name} tool failed: {tool_error}.  Try again or "
            f"adjust the parameters._"
        )
    return (
        f"_The {tool_name} tool ran successfully but the model summary "
        f"came back empty.  The structured result is rendered above; "
        f"you can ask a follow-up for context._"
    )


def _done_metadata(response: dict[str, Any]) -> dict[str, Any]:
    """Extract llm_model + tokens_used for the SSE ``done`` event."""
    if not isinstance(response, dict):
        return {}
    return {
        "llm_model": response.get("model"),
        "tokens_used": (response.get("usage") or {}).get("total_tokens"),
    }
