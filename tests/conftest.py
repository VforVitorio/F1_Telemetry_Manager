"""Pytest config — make the ``backend`` package importable and share fixtures.

The submodule keeps its source directly under ``backend/`` instead of the
more conventional ``src/backend``, so we add the submodule root to
``sys.path`` here once per session.  This mirrors what the ``backend``
package itself does at runtime via uvicorn's working directory.

Also exposes the two integration fixtures the FakeOpenAI harness needs:
``fake_openai`` (the scripted OpenAI stub bound to :1234) and
``chat_app_client`` (a bare FastAPI app carrying only the chat router).
"""

import os
import sys
from pathlib import Path

import pytest

# Point the backend's LLM client at exactly where the FakeOpenAI stub binds
# (127.0.0.1), before any backend module is imported.  llm_service reads
# LM_STUDIO_HOST at import time and defaults to "localhost", which can resolve
# to ::1 first while the stub only listens on IPv4 — pinning removes that
# address-family ambiguity so the integration tests are deterministic on CI.
os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["F1_LLM_PROVIDER"] = "lmstudio"
os.environ["LLM_PROVIDER"] = "lmstudio"
os.environ["OPENAI_API_KEY"] = ""
os.environ["LM_STUDIO_HOST"] = "127.0.0.1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
parent_source = Path(os.environ.get("F1_PARENT_SOURCE", ROOT.parents[1]))
if (parent_source / "src" / "f1_strat_manager").is_dir():
    sys.path.append(str(parent_source))

from tests.fake_openai import FakeOpenAIServer  # noqa: E402  (needs sys.path patched first)


@pytest.fixture(autouse=True)
def loopback_only(monkeypatch):
    """Refuse external sockets while permitting asyncio and the provider stub."""
    import ipaddress
    import socket

    connect = socket.socket.connect
    connect_ex = socket.socket.connect_ex
    getaddrinfo = socket.getaddrinfo

    def check(address):
        if isinstance(address, tuple):
            host = address[0]
            if isinstance(host, bytes):
                host = host.decode("ascii")
            try:
                local = host in (None, "localhost") or ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = False
            if not local:
                raise AssertionError(f"External connection refused: {host}")

    def guarded_connect(sock, address):
        check(address)
        return connect(sock, address)

    def guarded_connect_ex(sock, address):
        check(address)
        return connect_ex(sock, address)

    def guarded_getaddrinfo(host, port, *args, **kwargs):
        check((host, port))
        return getaddrinfo(host, port, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)
    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)


@pytest.fixture
def fake_openai():
    """Start the FakeOpenAI stub on :1234 for one test, tear it down after.

    Skips (never fails) when :1234 is already bound — a dev running a real LM
    Studio locally should not see red tests; CI runners always have the port
    free.  Removing this collision entirely is the env-configurable-port
    enabler (Testing T-3), deliberately out of scope here.
    """
    try:
        server = FakeOpenAIServer()
    except OSError:
        pytest.skip("port 1234 is occupied (a real LM Studio?) — FakeOpenAI cannot bind")
    try:
        yield server
    finally:
        server.shutdown()


@pytest.fixture
def chat_app_client():
    """A ``TestClient`` over a bare FastAPI app mounting only the chat router.

    Mirrors the per-router isolation pattern (one router per app) so a chat
    contract test never drags in the strategy/FastMCP import surface.
    Paths match production (``/api/v1/chat/...``) because the router carries its
    own ``/chat`` prefix and is mounted here under ``/api/v1``.
    """
    from backend.api.v1.endpoints import chat
    from fastapi import FastAPI
    from starlette.testclient import TestClient

    app = FastAPI()
    app.include_router(chat.router, prefix="/api/v1")
    with TestClient(app) as client:
        yield client
