"""A1b — API-key middleware + fail-closed startup guard (issue #224).

Two hermetic layers, no real provider, no heavy imports:
- pure functions ``_is_loopback`` / ``enforce_startup_security`` (unit);
- the ``ApiKeyMiddleware`` driven over a bare FastAPI app via ``TestClient``.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.core.auth import (
    ApiKeyMiddleware,
    _is_loopback,
    enforce_startup_security,
)

PROTECTED = "/api/v1/strategy/ping"


def _build_app() -> FastAPI:
    """A minimal app carrying only the auth middleware + open/protected routes."""
    app = FastAPI()
    app.add_middleware(ApiKeyMiddleware)

    @app.get("/")
    def root():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get(PROTECTED)
    def protected():
        return {"pong": True}

    return app


# ---------------------------------------------------------------------------
# Startup guard — the fail-closed unit
# ---------------------------------------------------------------------------

def test_is_loopback_classifies_binds():
    for host in ("127.0.0.1", "localhost", "::1", "127.0.1.1", " 127.0.0.1 "):
        assert _is_loopback(host), host
    for host in ("0.0.0.0", "192.168.1.5", "::", "", "10.0.0.2"):
        assert not _is_loopback(host), host


def test_guard_raises_on_public_bind_without_key(monkeypatch):
    monkeypatch.delenv("F1_API_KEY", raising=False)
    monkeypatch.setenv("F1_HOST", "0.0.0.0")
    with pytest.raises(RuntimeError):
        enforce_startup_security()


def test_guard_allows_loopback_without_key(monkeypatch):
    monkeypatch.delenv("F1_API_KEY", raising=False)
    monkeypatch.setenv("F1_HOST", "127.0.0.1")
    enforce_startup_security()  # must not raise


def test_guard_allows_public_bind_with_key(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    monkeypatch.setenv("F1_HOST", "0.0.0.0")
    enforce_startup_security()  # a key covers any bind


# ---------------------------------------------------------------------------
# Middleware — safe-by-default + gate when a key is set
# ---------------------------------------------------------------------------

def test_no_key_configured_passes_everything(monkeypatch):
    monkeypatch.delenv("F1_API_KEY", raising=False)
    client = TestClient(_build_app())
    assert client.get(PROTECTED).status_code == 200


def test_key_set_blocks_protected_without_header(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    client = TestClient(_build_app())
    assert client.get(PROTECTED).status_code == 401


def test_key_set_allows_correct_header(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    client = TestClient(_build_app())
    resp = client.get(PROTECTED, headers={"X-API-Key": "secret"})
    assert resp.status_code == 200
    assert resp.json() == {"pong": True}


def test_key_set_rejects_wrong_header(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    client = TestClient(_build_app())
    assert client.get(PROTECTED, headers={"X-API-Key": "nope"}).status_code == 401


def test_open_paths_pass_without_key(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    client = TestClient(_build_app())
    assert client.get("/").status_code == 200
    assert client.get("/health").status_code == 200


def test_options_is_never_blocked(monkeypatch):
    monkeypatch.setenv("F1_API_KEY", "secret")
    client = TestClient(_build_app())
    # No CORS on this bare app, so OPTIONS falls through to a 405 — the point is
    # the middleware did NOT turn it into a 401 (preflight must reach CORS).
    assert client.options(PROTECTED).status_code != 401
