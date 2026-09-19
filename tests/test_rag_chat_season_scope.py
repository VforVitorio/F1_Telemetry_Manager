"""Contract tests for #1196's chat-facing RAG season parameter."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

pytest.importorskip("fastmcp")

from backend import mcp_tools
from backend.api.v1.endpoints import strategy
from fastapi import FastAPI
from starlette.testclient import TestClient


def _fake_rag(monkeypatch):
    calls: list[tuple[str, int | None]] = []

    def run_rag_agent(question: str, year: int | None = None):
        calls.append((question, year))
        return SimpleNamespace(question=question, year=year)

    import src.agents.rag_agent as rag_agent

    monkeypatch.setattr(rag_agent, "run_rag_agent", run_rag_agent)
    return calls


def _strategy_client() -> TestClient:
    app = FastAPI()
    app.include_router(strategy.router, prefix="/api/v1")
    return TestClient(app)


def test_mcp_regulation_query_forwards_an_explicit_year(monkeypatch):
    calls = _fake_rag(monkeypatch)

    result = mcp_tools.query_regulations("tyre allocation", year=2023)

    assert calls == [("tyre allocation", 2023)]
    assert '"year": 2023' in result


def test_mcp_regulation_query_keeps_none_unscoped(monkeypatch):
    calls = _fake_rag(monkeypatch)

    mcp_tools.query_regulations("latest tyre allocation")

    assert calls == [("latest tyre allocation", None)]


def test_mcp_regulation_query_refuses_an_invalid_year(monkeypatch):
    calls = _fake_rag(monkeypatch)

    result = mcp_tools.query_regulations("tyres", year="banana")

    assert "Year REFUSED" in result
    assert calls == []


@pytest.mark.asyncio
async def test_mcp_transport_validates_and_forwards_year(monkeypatch):
    calls = _fake_rag(monkeypatch)

    result = await mcp_tools.mcp.call_tool(
        "query_regulations", {"question": "pit rules", "year": 2026}
    )

    assert calls == [("pit rules", 2026)]
    assert result.content


def test_http_rag_query_forwards_optional_year(monkeypatch):
    calls = _fake_rag(monkeypatch)

    with _strategy_client() as client:
        response = client.post(
            "/api/v1/strategy/rag",
            json={"question": "What changed in 2023?", "year": 2023},
        )

    assert response.status_code == 200
    assert calls == [("What changed in 2023?", 2023)]


def test_http_rag_query_accepts_omitted_year_and_rejects_garbage(monkeypatch):
    calls = _fake_rag(monkeypatch)

    with _strategy_client() as client:
        unscoped = client.post("/api/v1/strategy/rag", json={"question": "Any rule?"})
        invalid = client.post(
            "/api/v1/strategy/rag",
            json={"question": "Any rule?", "year": "banana"},
        )

    assert unscoped.status_code == 200
    assert invalid.status_code == 422
    assert calls == [("Any rule?", None)]


def test_http_rag_openapi_marks_year_optional():
    with _strategy_client() as client:
        schema = client.app.openapi()

    rag_schema = schema["components"]["schemas"]["RagRequest"]
    assert "year" in rag_schema["properties"]
    assert "year" not in rag_schema.get("required", [])
