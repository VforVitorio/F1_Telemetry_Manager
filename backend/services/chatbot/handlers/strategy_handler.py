"""
Strategy Query Handler

Routes strategy-intent chat messages to the N25–N31 agent pipeline.

When the chat context carries a `lap_state` dict (populated by the frontend
when a race replay is active), this handler runs the full orchestrator and
returns the StrategyRecommendation as a formatted natural-language response.

When no lap_state is present it falls back to a general strategy Q&A via the
LLM, without calling the ML models.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from backend.models.tool_schemas import (
    DisplayType,
    ToolCall,
    ToolName,
    ToolResultData,
    TOOL_DISPLAY_MAP,
)
from backend.services.chatbot.lmstudio_service import (
    LMStudioError,
    build_messages,
    send_message,
)

from .base_handler import BaseHandler

# ---------------------------------------------------------------------------
# Repo-root path injection — same pattern as strategy endpoint
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parent
while not (_REPO_ROOT / ".git").exists() and _REPO_ROOT != _REPO_ROOT.parent:
    _REPO_ROOT = _REPO_ROOT.parent
if not (_REPO_ROOT / ".git").exists():
    _REPO_ROOT = Path("/app")
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a Formula 1 strategy expert assistant embedded in a real-time telemetry
and race simulation system.  You have access to ML models that predict lap times,
tyre degradation, overtake probability, safety-car likelihood, pit stop duration,
and undercut success.

When a race state is available (current lap, compound, tyre life, gap to rival),
you provide a concrete pit-stop recommendation with confidence and reasoning.

When no live race state is available, answer general strategy questions clearly
and concisely, citing relevant F1 strategy concepts (tyre delta, undercut window,
overcut risk, safety-car timing, track position value).

Keep responses under 200 words unless the user explicitly asks for detail.
"""


def _format_recommendation(rec_dict: Dict[str, Any]) -> str:
    """Render a StrategyRecommendation dict as a chat-friendly string."""
    action = rec_dict.get("action", "UNKNOWN")
    confidence = rec_dict.get("confidence", 0.0)
    reasoning = rec_dict.get("reasoning", "")
    scores = rec_dict.get("scenario_scores", {})

    lines = [
        f"**Recommended action:** {action}  (confidence {confidence:.0%})",
        "",
        reasoning,
    ]
    if scores:
        lines += ["", "**Scenario scores:**"]
        for key, val in scores.items():
            if isinstance(val, dict):
                lines.append(f"- {key}: score={val.get('score', 0):.3f}")
            else:
                lines.append(f"- {key}: {val:.3f}")
    return "\n".join(lines)


class StrategyHandler(BaseHandler):
    """
    Handler for strategy-intent chat queries.

    When the request context contains a `lap_state` key, the full N31
    orchestrator pipeline is invoked and the result is formatted as a
    structured strategy recommendation.

    Without a lap_state the handler falls back to LLM-only strategy Q&A
    using a dedicated strategy system prompt.
    """

    def handle(
        self,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        self._log_request(message, **kwargs)

        lap_state = (context or {}).get("lap_state")

        if lap_state:
            return self._handle_with_pipeline(message, lap_state, context, chat_history, **kwargs)
        return self._handle_text_only(message, image, chat_history, context, **kwargs)

    # ------------------------------------------------------------------

    def _handle_with_pipeline(
        self,
        message: str,
        lap_state: dict,
        context: Dict[str, Any],
        chat_history: Optional[list],
        **kwargs,
    ) -> Dict[str, Any]:
        """Run the N31 orchestrator and return a formatted recommendation."""
        try:
            from backend.utils.laps_cache import get_laps_df
            from backend.utils.race_state_builder import build_race_state
            from backend.utils.serialization import agent_output_to_dict
            from src.agents.strategy_orchestrator import run_strategy_orchestrator_from_state

            laps_df = get_laps_df()
            if laps_df is None:
                raise FileNotFoundError("Featured parquet not found. Run the data pipeline first.")

            race_state = build_race_state(
                lap_state,
                gap_ahead_s=float(context.get("gap_ahead_s", 2.0)),
                pace_delta_s=float(context.get("pace_delta_s", 0.0)),
                risk_tolerance=float(context.get("risk_tolerance", 0.5)),
            )

            rec = run_strategy_orchestrator_from_state(
                race_state=race_state,
                laps_df=laps_df,
                lap_state=lap_state,
            )

            rec_dict = agent_output_to_dict(rec)
            response_text = _format_recommendation(rec_dict)
            self._log_response(len(response_text))

            return {
                "response": response_text,
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "strategy",
                    "mode": "pipeline",
                    "action": rec_dict.get("action"),
                    "confidence": rec_dict.get("confidence"),
                },
            }

        except Exception as exc:
            logger.error("Strategy pipeline error: %s", exc, exc_info=True)
            # Degrade gracefully to text-only if the ML pipeline fails
            fallback = (
                f"I encountered an error running the strategy models: {exc}. "
                "I'll answer based on general F1 strategy knowledge instead.\n\n"
            )
            text_result = self._handle_text_only(message, None, chat_history, {}, **kwargs)
            text_result["response"] = fallback + text_result["response"]
            text_result["metadata"]["mode"] = "fallback_text"
            return text_result

    def _handle_text_only(
        self,
        message: str,
        image: Optional[str],
        chat_history: Optional[list],
        context: Optional[Dict[str, Any]],
        **kwargs,
    ) -> Dict[str, Any]:
        """Fall back to LLM-only strategy Q&A."""
        try:
            messages = build_messages(
                user_message=message,
                image_base64=image,
                system_prompt=_SYSTEM_PROMPT,
                chat_history=chat_history,
                context=context,
            )
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.5),
                max_tokens=kwargs.get("max_tokens", 600),
                stream=False,
            )

            if "choices" in response and response["choices"]:
                content = response["choices"][0]["message"]["content"]
                self._log_response(len(content))
                return {
                    "response": content,
                    "llm_model": response.get("model"),
                    "tokens_used": response.get("usage", {}).get("total_tokens"),
                    "metadata": {"handler_type": "strategy", "mode": "text_only"},
                }
            raise ValueError("Empty response from LLM")

        except LMStudioError as exc:
            logger.error("LMStudio error in StrategyHandler: %s", exc)
            return {
                "response": (
                    "I can't reach the LLM service right now. "
                    "Please make sure LM Studio is running on port 1234."
                ),
                "llm_model": None,
                "tokens_used": None,
                "metadata": {"handler_type": "strategy", "mode": "text_only", "error": str(exc)},
            }
        except Exception as exc:
            logger.error("StrategyHandler error: %s", exc, exc_info=True)
            return {
                "response": f"Error processing strategy query: {exc}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {"handler_type": "strategy", "error": str(exc)},
            }

    # ------------------------------------------------------------------
    # Tool-aware flow (used by /tool-message endpoint)
    # ------------------------------------------------------------------

    def handle_with_tools(
        self,
        message: str,
        tool_call: ToolCall,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Execute a tool call and return structured data + LLM summary.

        This is the main entry point for the tool-message chat endpoint.
        It calls the appropriate agent, gets structured data, then asks
        LM Studio to summarise the result in natural language.
        """
        try:
            raw_result = self._execute_tool(tool_call)
            llm_result = self._trim_for_llm(raw_result)
            summary = self._summarise_result(message, tool_call, llm_result)
            display_type = TOOL_DISPLAY_MAP.get(tool_call.tool, DisplayType.TEXT)

            tool_result = ToolResultData(
                tool_name=tool_call.tool.value,
                display_type=display_type,
                data=raw_result,
                summary=summary,
            )

            return {
                "response": summary,
                "llm_model": None,
                "tokens_used": None,
                "tool_result": tool_result.model_dump(),
            }
        except Exception as exc:
            logger.error("Tool execution error (%s): %s", tool_call.tool, exc, exc_info=True)
            return {
                "response": f"Error running {tool_call.tool.value}: {exc}",
                "llm_model": None,
                "tokens_used": None,
                "tool_result": None,
            }

    def _execute_tool(self, tool_call: ToolCall) -> Dict[str, Any]:
        """Dispatch to the correct agent based on tool_call.tool."""
        from backend.mcp_tools import (
            predict_pace,
            predict_tire,
            predict_situation,
            predict_pit,
            analyze_radio,
            query_regulations,
            recommend_strategy,
            list_available_gps,
            list_available_drivers,
            get_lap_range,
        )

        p = tool_call.params
        dispatch = {
            ToolName.PREDICT_PACE: lambda: predict_pace(p.gp, p.driver, p.lap, p.year),
            ToolName.PREDICT_TIRE: lambda: predict_tire(p.gp, p.driver, p.lap, p.year),
            ToolName.PREDICT_SITUATION: lambda: predict_situation(p.gp, p.driver, p.lap, p.year),
            ToolName.PREDICT_PIT: lambda: predict_pit(p.gp, p.driver, p.lap, p.year),
            ToolName.ANALYZE_RADIO: lambda: analyze_radio(p.gp, p.driver, p.lap, p.year),
            ToolName.QUERY_REGULATIONS: lambda: query_regulations(p.question or ""),
            ToolName.RECOMMEND_STRATEGY: lambda: recommend_strategy(p.gp, p.driver, p.lap, p.year, p.risk_tolerance),
            ToolName.LIST_GPS: lambda: list_available_gps(p.year),
            ToolName.LIST_DRIVERS: lambda: list_available_drivers(p.gp or "", p.year),
            ToolName.GET_LAP_RANGE: lambda: get_lap_range(p.gp or "", p.driver or "", p.year),
        }
        # Phase 2 telemetry tools are auto-generated from OpenAPI via
        # FastMCP.from_openapi() and mounted as a sub-server.  They execute
        # via HTTP to the FastAPI endpoints, NOT via this dispatch map.

        fn = dispatch.get(tool_call.tool)
        if fn is not None:
            raw = fn()
            return json.loads(raw) if isinstance(raw, str) else raw

        # Phase 2: telemetry tools not in dispatch — call FastAPI endpoint via HTTP
        return self._execute_telemetry_tool(tool_call)

    def _execute_telemetry_tool(self, tool_call: ToolCall) -> Dict[str, Any]:
        """Call a Phase 2 telemetry endpoint via HTTP (auto-generated tools).

        Maps ToolName to the corresponding FastAPI GET endpoint and passes
        extracted params as query strings.
        """
        import requests as _req

        p = tool_call.params
        base = "http://localhost:8000/api/v1"

        endpoint_map = {
            ToolName.GET_LAP_TIMES: (
                f"{base}/telemetry/lap-times",
                {
                    "year": p.year,
                    "gp": p.gp or "",
                    "session": "R",
                    "drivers": ",".join(code for code in (p.driver, p.driver2) if code),
                },
            ),
            ToolName.GET_TELEMETRY: (
                f"{base}/telemetry/lap-telemetry",
                {"year": p.year, "gp": p.gp or "", "session": "R", "driver": p.driver or "", "lap_number": p.lap or 1},
            ),
            ToolName.COMPARE_DRIVERS: (
                f"{base}/comparison/compare",
                {"year": p.year, "gp": p.gp or "", "session": "R", "driver1": p.driver or "", "driver2": p.driver2 or ""},
            ),
            ToolName.GET_RACE_DATA: (
                f"{base}/telemetry/race-data",
                {"year": p.year, "gp": p.gp or "", "driver": p.driver or ""},
            ),
        }

        entry = endpoint_map.get(tool_call.tool)
        if entry is None:
            raise ValueError(f"Unknown tool: {tool_call.tool}")

        url, params = entry
        try:
            resp = _req.get(url, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except _req.exceptions.RequestException as exc:
            return {"error": str(exc)}

    @staticmethod
    def _trim_for_llm(raw: Dict[str, Any]) -> Dict[str, Any]:
        """Return a shallow copy of the tool payload with long lists capped.

        The frontend renderer needs the full arrays to draw meaningful charts,
        but the LLM summariser only needs a representative slice to describe
        the result.  Trimming happens here — not inside the tool itself — so
        that `tool_result.data` keeps the complete payload.
        """
        if not isinstance(raw, dict):
            return raw

        trimmed = dict(raw)
        for key in ("lap_times", "race_data"):
            value = trimmed.get(key)
            if isinstance(value, list) and len(value) > 20:
                trimmed[key] = value[:20]
                trimmed[f"{key}_note"] = f"Showing 20 of {len(value)} records"
        return trimmed

    def _summarise_result(
        self,
        user_message: str,
        tool_call: ToolCall,
        result: Dict[str, Any],
    ) -> str:
        """Ask LM Studio to produce a concise natural-language summary."""
        try:
            compact = json.dumps(result, default=str, ensure_ascii=False)[:2000]
            prompt = (
                f"The user asked: \"{user_message}\"\n\n"
                f"The {tool_call.tool.value} tool returned this data:\n{compact}\n\n"
                "Provide a concise, expert F1 strategy summary of this data in 2-4 sentences. "
                "Highlight the key insight and any recommended action."
            )
            messages = build_messages(prompt, system_prompt=_SYSTEM_PROMPT)
            response = send_message(messages, temperature=0.3, max_tokens=300)

            if "choices" in response and response["choices"]:
                return response["choices"][0]["message"]["content"]
        except Exception:
            logger.debug("LLM summarisation failed, using raw format", exc_info=True)

        return _format_recommendation(result) if "action" in result else str(result)[:500]
