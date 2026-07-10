"""SSE grammar tests — the committed ``.sse`` transcripts are the wire contract.

Two guarantees:
  * the recorded transcripts are well-formed and carry the expected event
    grammar (read-only, no stub — these also document the shape the SPA's TS
    parser must handle);
  * the *live* server output reproduces the recorded event-name sequence, so a
    grammar change on either side (e.g. the P1 F-19 framing unification) shows up
    as a fixture diff instead of a silent client/server drift.

The transcripts were captured from the FakeOpenAI-driven flow (see
``fixtures/sse/generate_transcripts.py``); regenerate them in the same PR as any
grammar change — the fixture diff IS the contract diff (Testing audit T-7).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from backend.services.chatbot import chat_engine

from tests.sse_utils import event_sequence, parse_sse

FIXTURES = Path(__file__).parent / "fixtures" / "sse"
PLAIN = FIXTURES / "chat_plain.sse"
TOOL = FIXTURES / "chat_tool_call.sse"

STREAM = "/api/v1/chat/tool-message-stream"


async def _no_tools():
    return []


async def _one_tool():
    return [{"type": "function", "function": {"name": "predict_pace", "parameters": {}}}]


async def _fake_dispatch(name, args):
    return {"driver": args.get("driver"), "lap_time_pred": 91.2, "delta_vs_median": -0.31}


# ---------------------------------------------------------------------------
# Recorded-transcript grammar (read-only, no stub)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [PLAIN, TOOL], ids=["plain", "tool_call"])
def test_recorded_transcript_is_well_formed(path):
    events = parse_sse(path.read_text(encoding="utf-8"))
    assert events, f"{path.name} is empty"
    for name, data in events:
        assert name, f"frame without an event name in {path.name}"
        assert isinstance(data, dict), f"frame data is not a JSON object in {path.name}"
    # `done` terminates the stream, exactly once.
    names = [name for name, _ in events]
    assert names[-1] == "done"
    assert names.count("done") == 1


def test_plain_transcript_grammar():
    names = event_sequence(PLAIN.read_text(encoding="utf-8"))
    assert names[0] == "stage"
    assert "tool_result" not in names  # no tool on a plain turn
    assert "token" in names
    assert names[-1] == "done"


def test_tool_transcript_grammar():
    events = parse_sse(TOOL.read_text(encoding="utf-8"))
    names = [name for name, _ in events]
    # A tool turn must emit the structured result before the summary token.
    assert names.index("tool_result") < names.index("token")
    assert names[-1] == "done"

    tool_result = next(data["tool_result"] for name, data in events if name == "tool_result")
    assert {"tool_name", "display_type", "data", "summary"} <= tool_result.keys()


# ---------------------------------------------------------------------------
# Live-output-matches-recorded-grammar (needs the stub)
# ---------------------------------------------------------------------------

def test_live_plain_stream_matches_recorded_grammar(fake_openai, chat_app_client, monkeypatch):
    monkeypatch.setattr(chat_engine, "list_openai_tools", _no_tools)
    fake_openai.push_text("Hola, ¿qué piloto quieres analizar?")

    resp = chat_app_client.post(STREAM, json={"text": "hola"})
    assert resp.status_code == 200
    assert event_sequence(resp.text) == event_sequence(PLAIN.read_text(encoding="utf-8"))


def test_live_tool_stream_matches_recorded_grammar(fake_openai, chat_app_client, monkeypatch):
    monkeypatch.setattr(chat_engine, "list_openai_tools", _one_tool)
    monkeypatch.setattr(chat_engine, "call_mcp_tool", _fake_dispatch)
    fake_openai.push_tool_call("predict_pace", {"driver": "VER", "lap": 30})
    fake_openai.push_text("VER is projected around 91.2s next lap.")

    resp = chat_app_client.post(STREAM, json={"text": "pace for VER at Monza lap 30"})
    assert resp.status_code == 200
    assert event_sequence(resp.text) == event_sequence(TOOL.read_text(encoding="utf-8"))
