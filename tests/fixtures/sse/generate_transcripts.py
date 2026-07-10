"""Regenerate the chat ``.sse`` transcript fixtures from the FakeOpenAI stub.

Run this by hand whenever the chat SSE grammar changes (e.g. the P1 F-19 framing
unification); commit the regenerated ``.sse`` files in the same PR so the fixture
diff records the contract change.

    # from the submodule root, with :1234 free (stop LM Studio first)
    python tests/fixtures/sse/generate_transcripts.py

Deterministic: the stub scripts fixed replies, so re-running produces byte-stable
output unless the server's event grammar actually changed.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # submodule root
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api.v1.endpoints import chat  # noqa: E402
from backend.services.chatbot import chat_engine  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from tests.fake_openai import FakeOpenAIServer  # noqa: E402

OUT = Path(__file__).parent
STREAM = "/api/v1/chat/tool-message-stream"


async def _no_tools():
    return []


async def _one_tool():
    return [{"type": "function", "function": {"name": "predict_pace", "parameters": {}}}]


async def _fake_dispatch(name, args):
    return {"driver": args.get("driver"), "lap_time_pred": 91.2, "delta_vs_median": -0.31}


def main() -> None:
    app = FastAPI()
    app.include_router(chat.router, prefix="/api/v1")
    client = TestClient(app)
    server = FakeOpenAIServer()
    try:
        chat_engine.list_openai_tools = _no_tools
        server.push_text("Hola, soy tu asistente de estrategia. ¿Qué piloto quieres analizar?")
        plain = client.post(STREAM, json={"text": "hola"})
        (OUT / "chat_plain.sse").write_text(plain.text, encoding="utf-8")
        print("wrote chat_plain.sse")

        chat_engine.list_openai_tools = _one_tool
        chat_engine.call_mcp_tool = _fake_dispatch
        server.push_tool_call("predict_pace", {"driver": "VER", "lap": 30})
        server.push_text("VER is projected around 91.2s next lap, ~0.31s under the median.")
        tool = client.post(STREAM, json={"text": "pace for VER at Monza lap 30"})
        (OUT / "chat_tool_call.sse").write_text(tool.text, encoding="utf-8")
        print("wrote chat_tool_call.sse")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
