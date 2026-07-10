"""Tests for the FakeOpenAI stub and the chat plumbing that runs through it.

Two tiers here:
  * stub self-tests — hit the stub directly with ``requests`` and pin its wire
    behaviour (models list, FIFO scripting, tool-call shape, request recording);
  * chat integration — drive ``/api/v1/chat/tool-message-stream`` end to end
    against the stub, proving the backend's two-round-trip LLM plumbing (tool
    choice → dispatch → summary) works with no live model.

MCP is monkeypatched out of the chat tests on purpose: the stub's job is the LLM
plumbing, so tool *listing* and *dispatch* are replaced with deterministic fakes
rather than spinning up FastMCP.  The real tool-call-over-SSE grammar is pinned
separately against recorded transcripts (Testing audit item 9 / PR-C).
"""

from __future__ import annotations

import json

import requests
from backend.services.chatbot import chat_engine

from tests.sse_utils import parse_sse as _parse_sse

# ---------------------------------------------------------------------------
# Stub self-tests (talk to the stub directly, no backend)
# ---------------------------------------------------------------------------

def test_models_endpoint_lists_the_fake_model(fake_openai):
    resp = requests.get(f"{fake_openai.url}/models", timeout=5)
    assert resp.status_code == 200
    ids = [m["id"] for m in resp.json()["data"]]
    assert "fake-model" in ids


def test_completions_are_served_in_fifo_order(fake_openai):
    fake_openai.push_text("first").push_text("second")

    first = requests.post(f"{fake_openai.url}/chat/completions", json={"messages": []}, timeout=5)
    second = requests.post(f"{fake_openai.url}/chat/completions", json={"messages": []}, timeout=5)

    assert first.json()["choices"][0]["message"]["content"] == "first"
    assert second.json()["choices"][0]["message"]["content"] == "second"


def test_empty_queue_falls_back_to_a_benign_default(fake_openai):
    resp = requests.post(f"{fake_openai.url}/chat/completions", json={"messages": []}, timeout=5)
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"] == "(fake default reply)"


def test_tool_call_completion_encodes_arguments_as_json_string(fake_openai):
    fake_openai.push_tool_call("predict_pace", {"driver": "VER", "lap": 30})

    resp = requests.post(f"{fake_openai.url}/chat/completions", json={"messages": []}, timeout=5)
    message = resp.json()["choices"][0]["message"]

    assert message["content"] is None
    call = message["tool_calls"][0]
    assert call["function"]["name"] == "predict_pace"
    # arguments must be a JSON-encoded *string*, per the OpenAI wire protocol.
    assert json.loads(call["function"]["arguments"]) == {"driver": "VER", "lap": 30}


def test_requests_are_recorded_for_inspection(fake_openai):
    requests.post(f"{fake_openai.url}/chat/completions", json={"messages": [{"role": "user"}], "tools": [1]}, timeout=5)

    assert len(fake_openai.requests) == 1
    assert fake_openai.requests[0]["tools"] == [1]


# ---------------------------------------------------------------------------
# Chat integration (drive the real endpoint through the stub)
# ---------------------------------------------------------------------------

async def _no_tools():
    return []


async def _one_fake_tool():
    return [{"type": "function", "function": {"name": "predict_pace", "parameters": {}}}]


def test_plain_text_chat_streams_stage_token_done(fake_openai, chat_app_client, monkeypatch):
    """A no-tool turn: the stub's text becomes the single ``token`` event."""
    monkeypatch.setattr(chat_engine, "list_openai_tools", _no_tools)
    fake_openai.push_text("Hola, soy tu asistente de estrategia.")

    resp = chat_app_client.post("/api/v1/chat/tool-message-stream", json={"text": "hola"})
    assert resp.status_code == 200

    events = _parse_sse(resp.text)
    names = [name for name, _ in events]
    assert "stage" in names
    assert names[-1] == "done"

    tokens = [data["token"] for name, data in events if name == "token"]
    assert any("Hola" in t for t in tokens)
    # The backend actually reached the stub (one round-trip, no tool call).
    assert len(fake_openai.requests) == 1


def test_tool_call_chat_streams_tool_result_then_summary(fake_openai, chat_app_client, monkeypatch):
    """A tool turn makes two round-trips: tool-choice, then a no-tools summary."""
    monkeypatch.setattr(chat_engine, "list_openai_tools", _one_fake_tool)

    async def _fake_dispatch(name, args):
        return {"driver": args.get("driver"), "lap_time_pred": 91.2}

    monkeypatch.setattr(chat_engine, "call_mcp_tool", _fake_dispatch)

    # Round-trip 1 → tool call; round-trip 2 → the summary text.
    fake_openai.push_tool_call("predict_pace", {"driver": "VER"})
    fake_openai.push_text("VER is projected around 91.2s next lap.")

    resp = chat_app_client.post("/api/v1/chat/tool-message-stream", json={"text": "pace for VER at Monza lap 30"})
    assert resp.status_code == 200

    events = _parse_sse(resp.text)
    names = [name for name, _ in events]
    assert "tool_result" in names
    assert names[-1] == "done"

    tool_result = next(data["tool_result"] for name, data in events if name == "tool_result")
    assert tool_result["tool_name"] == "predict_pace"

    tokens = [data["token"] for name, data in events if name == "token"]
    assert any("91.2" in t for t in tokens)

    # Two LLM round-trips; the summary call must NOT carry tools= (OpenAI would
    # otherwise expect another tool answer). This pins the single-tool contract.
    assert len(fake_openai.requests) == 2
    assert "tools" not in fake_openai.requests[1] or not fake_openai.requests[1]["tools"]
