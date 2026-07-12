"""A3 — server-side max_tokens clamp + 1-tool-per-turn invariant (issue #224).

Hermetic: the provider call is spied, so the clamped budget is asserted on what
the engine would send, with no real LLM and no FakeOpenAI socket.
"""

from __future__ import annotations

from backend.core.config import chat_max_tokens, clamp_max_tokens
from backend.services.chatbot import chat_engine


# ---------------------------------------------------------------------------
# The cap + clamp helpers
# ---------------------------------------------------------------------------

def test_chat_max_tokens_default_and_override(monkeypatch):
    monkeypatch.delenv("F1_CHAT_MAX_TOKENS", raising=False)
    assert chat_max_tokens() == 2048
    monkeypatch.setenv("F1_CHAT_MAX_TOKENS", "256")
    assert chat_max_tokens() == 256
    monkeypatch.setenv("F1_CHAT_MAX_TOKENS", "not-a-number")
    assert chat_max_tokens() == 2048  # garbage falls back to the default


def test_clamp_reduces_only_above_the_cap(monkeypatch):
    monkeypatch.setenv("F1_CHAT_MAX_TOKENS", "256")
    assert clamp_max_tokens(1_000_000) == 256
    assert clamp_max_tokens(8192) == 256
    assert clamp_max_tokens(100) == 100  # already under the cap, untouched


# ---------------------------------------------------------------------------
# The clamp is applied at the engine boundary (what the provider receives)
# ---------------------------------------------------------------------------

async def test_stream_response_clamps_provider_budget(monkeypatch):
    monkeypatch.setenv("F1_CHAT_MAX_TOKENS", "256")
    captured: dict[str, int] = {}

    async def _no_tools():
        return []

    async def spy_send(messages, *, model, temperature, max_tokens, tools=None):
        captured["max_tokens"] = max_tokens
        return {"choices": [{"message": {"content": "hi"}}], "model": "fake"}

    monkeypatch.setattr(chat_engine, "_safe_list_tools", _no_tools)
    monkeypatch.setattr(chat_engine, "_safe_send", spy_send)

    _ = [
        ev
        async for ev in chat_engine.stream_response(
            text="hola", request_id="r1", max_tokens=8192
        )
    ]
    assert captured["max_tokens"] == 256  # 8192 clamped to the cap


# ---------------------------------------------------------------------------
# 1-tool-per-turn invariant
# ---------------------------------------------------------------------------

def test_only_the_first_tool_call_is_taken():
    assert chat_engine._MAX_TOOLS_PER_TURN == 1
    message = {
        "tool_calls": [
            {"id": "a", "function": {"name": "predict_pace"}},
            {"id": "b", "function": {"name": "predict_tire"}},
        ]
    }
    assert chat_engine._first_tool_call(message)["id"] == "a"
