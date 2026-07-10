"""Contract tests for the chat router — happy paths, error contracts, OpenAPI.

Per-router isolation (a bare FastAPI app carrying only ``chat.router``) keeps the
heavy strategy / telemetry / voice import surface out: those routers import
pandas / fastf1 / ``src.agents`` at module top and need a backend-full test tier,
not the hermetic deps-lite one this suite runs in.

The load-bearing contract here is the escaped-bug class the Testing audit cares
about: **a provider failure must not surface as HTTP 200.**  ``/message`` already
maps it to 503 (pinned below).  ``/tool-message`` still swallows it into a 200
with a fallback string — pinned as a strict ``xfail`` against the P1 F-11 error
envelope so the gap is executable debt, not prose (flip it to a passing assert
when F-11 lands).
"""

from __future__ import annotations

import json

import pytest
from backend.services.chatbot import chat_engine

CHAT = "/api/v1/chat"


async def _no_tools():
    """Isolate the chat flow from FastMCP — no tool is ever offered."""
    return []


# ---------------------------------------------------------------------------
# health / models
# ---------------------------------------------------------------------------

def test_health_is_healthy_when_the_stub_is_reachable(fake_openai, chat_app_client):
    resp = chat_app_client.get(f"{CHAT}/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["lm_studio_reachable"] is True


def test_models_lists_the_loaded_model(fake_openai, chat_app_client):
    resp = chat_app_client.get(f"{CHAT}/models")
    assert resp.status_code == 200
    assert "fake-model" in resp.json()["models"]


# ---------------------------------------------------------------------------
# /message (legacy, non-tool)
# ---------------------------------------------------------------------------

def test_message_happy_path_returns_the_reply(fake_openai, chat_app_client):
    fake_openai.push_text("Hola, ¿en qué te ayudo?")
    resp = chat_app_client.post(f"{CHAT}/message", json={"text": "hola"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["response"] == "Hola, ¿en qué te ayudo?"
    assert body["llm_model"] == "fake-model"


def test_message_provider_failure_returns_503_not_200(fake_openai, chat_app_client):
    """The correct error contract: a provider 500 becomes a backend 503."""
    fake_openai.push_error(500, "boom")
    resp = chat_app_client.post(f"{CHAT}/message", json={"text": "hola"})
    assert resp.status_code == 503


def test_message_requires_text(chat_app_client):
    resp = chat_app_client.post(f"{CHAT}/message", json={})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /tool-message (tool-aware, non-streaming)
# ---------------------------------------------------------------------------

def test_tool_message_happy_path_returns_reply(fake_openai, chat_app_client, monkeypatch):
    monkeypatch.setattr(chat_engine, "list_openai_tools", _no_tools)
    fake_openai.push_text("Necesito piloto, GP y vuelta para analizar la degradación.")
    resp = chat_app_client.post(f"{CHAT}/tool-message", json={"text": "analiza degradación"})
    assert resp.status_code == 200
    assert "piloto" in resp.json()["response"]


def test_tool_message_rejects_empty_text(chat_app_client):
    resp = chat_app_client.post(f"{CHAT}/tool-message", json={"text": ""})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /status (smart-spinner poll target)
# ---------------------------------------------------------------------------

def test_status_returns_a_stage_field(chat_app_client):
    resp = chat_app_client.get(f"{CHAT}/status", params={"request_id": "abc"})
    assert resp.status_code == 200
    assert "stage" in resp.json()


# ---------------------------------------------------------------------------
# OpenAPI meta — guards the SPA's typed-client generation (migration A5-4)
# ---------------------------------------------------------------------------

def test_chat_openapi_operations_are_typed_and_have_operation_ids():
    from backend.api.v1.endpoints import chat
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(chat.router, prefix="/api/v1")
    schema = app.openapi()

    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            assert "operationId" in operation, f"{method.upper()} {path} lacks an operationId"

    # Response models must be concrete (named components), not a bare object,
    # so the generated client gets real return types.
    dumped = json.dumps(schema)
    assert "ToolMessageResponse" in dumped
    assert "ChatResponse" in dumped
    assert "HealthResponse" in dumped

    # No chat route should leak a `year` query param (P1 F-15 was a strategy-route
    # bug; the chat surface must stay clean as the typed client grows over it).
    for methods in schema["paths"].values():
        for operation in methods.values():
            param_names = {p.get("name") for p in operation.get("parameters", [])}
            assert "year" not in param_names


# ---------------------------------------------------------------------------
# PR-D — error envelope, written test-first (xfail until P1 F-11 lands)
# ---------------------------------------------------------------------------

@pytest.mark.xfail(
    strict=True,
    reason=(
        "P1 F-11: /tool-message swallows provider errors into HTTP 200 with a "
        "fallback string; the error envelope is not implemented yet. When F-11 "
        "lands this will XPASS and (strict) fail — that is the signal to remove "
        "the xfail and keep the assert."
    ),
)
def test_tool_message_provider_failure_should_not_return_200(fake_openai, chat_app_client, monkeypatch):
    monkeypatch.setattr(chat_engine, "list_openai_tools", _no_tools)
    fake_openai.push_error(500, "boom")
    resp = chat_app_client.post(f"{CHAT}/tool-message", json={"text": "hola"})
    assert resp.status_code >= 400  # currently 200 → xfail documents the gap
