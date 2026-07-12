"""A2 — default-deny tool allowlist (issue #224).

Hermetic: no FakeOpenAI socket. The two chokepoints are exercised directly —
the ``mcp_bridge`` filter (with a stubbed tool fetch) and the ``chat_engine``
dispatch guard (with a spy over the MCP call).
"""

from __future__ import annotations

from types import SimpleNamespace

from backend.models.tool_schemas import (
    CHAT_ALLOWED_TOOLS,
    TOOL_RISK_MAP,
    ToolRisk,
    is_tool_allowed,
)
from backend.services.chatbot import chat_engine, mcp_bridge

# The real dispatched MCP names (must match the system-prompt cheat sheet).
_REAL_TOOL_NAMES = {
    "predict_pace", "predict_tire", "predict_situation", "predict_pit",
    "analyze_radio", "list_available_gps", "list_available_drivers",
    "get_lap_range", "query_regulations", "recommend_strategy",
    "compare_drivers", "get_lap_times", "get_telemetry", "get_race_data",
}


# ---------------------------------------------------------------------------
# The allowlist itself
# ---------------------------------------------------------------------------

def test_all_real_tools_are_allowed():
    for name in _REAL_TOOL_NAMES:
        assert is_tool_allowed(name), name


def test_allowlist_is_exactly_the_read_tools():
    assert CHAT_ALLOWED_TOOLS == frozenset(_REAL_TOOL_NAMES)
    assert not any(risk is ToolRisk.MUTATING for risk in TOOL_RISK_MAP.values())


def test_drift_and_hallucinated_names_are_denied():
    # The ToolName enum's "list_gps" drifts from the real "list_available_gps";
    # keying by real names is what makes the drift name correctly denied.
    for name in ("list_gps", "list_drivers", "delete_everything", "export_report", ""):
        assert not is_tool_allowed(name), name


def test_a_mutating_tool_would_not_be_allowed(monkeypatch):
    monkeypatch.setitem(TOOL_RISK_MAP, "wipe_cache", ToolRisk.MUTATING)
    # CHAT_ALLOWED_TOOLS is frozen at import, so a live MUTATING classification is
    # denied by is_tool_allowed regardless — the hard rule holds by construction.
    assert not is_tool_allowed("wipe_cache")


# ---------------------------------------------------------------------------
# Chokepoint 1 — mcp_bridge filter (model never sees a non-allowed tool)
# ---------------------------------------------------------------------------

async def test_list_openai_tools_filters_disallowed(monkeypatch):
    fake_tools = [
        SimpleNamespace(name="predict_pace", description="d", inputSchema={"type": "object"}),
        SimpleNamespace(name="delete_everything", description="d", inputSchema={"type": "object"}),
    ]

    async def fake_fetch():
        return fake_tools

    monkeypatch.setattr(mcp_bridge, "_fetch_tools", fake_fetch)
    tools = await mcp_bridge.list_openai_tools()
    names = {t["function"]["name"] for t in tools}
    assert "predict_pace" in names
    assert "delete_everything" not in names


# ---------------------------------------------------------------------------
# Chokepoint 2 — chat_engine dispatch guard (hallucination never dispatched)
# ---------------------------------------------------------------------------

async def test_dispatch_guard_refuses_disallowed_tool(monkeypatch):
    called: list[str] = []

    async def spy(name, args):
        called.append(name)
        return {"x": 1}, None

    monkeypatch.setattr(chat_engine, "_safe_call_tool", spy)
    tool_call = {"id": "c1", "function": {"name": "delete_everything", "arguments": "{}"}}
    events = [
        ev
        async for ev in chat_engine._stream_tool_response(
            tool_call=tool_call,
            assistant_msg={"tool_calls": [tool_call]},
            request_id="r1",
            base_messages=[],
            model=None,
            temperature=0.3,
            max_tokens=100,
        )
    ]
    assert called == []  # never dispatched
    assert "tool_result" not in [name for name, _ in events]
    assert "done" in [name for name, _ in events]


async def test_dispatch_allows_allowlisted_tool(monkeypatch):
    called: list[str] = []

    async def spy_call(name, args):
        called.append(name)
        return {"ok": True}, None

    async def spy_send(messages, **kwargs):
        return {"choices": [{"message": {"content": "summary"}}], "model": "fake"}

    monkeypatch.setattr(chat_engine, "_safe_call_tool", spy_call)
    monkeypatch.setattr(chat_engine, "_safe_send", spy_send)
    tool_call = {"id": "c1", "function": {"name": "predict_pace", "arguments": "{}"}}
    events = [
        ev
        async for ev in chat_engine._stream_tool_response(
            tool_call=tool_call,
            assistant_msg={"tool_calls": [tool_call]},
            request_id="r1",
            base_messages=[],
            model=None,
            temperature=0.3,
            max_tokens=100,
        )
    ]
    assert called == ["predict_pace"]
    assert "tool_result" in [name for name, _ in events]
