"""Public chat failures retain diagnostics without leaking provider or tool text."""

import json

import pytest
from backend.api.v1.endpoints import chat
from backend.services.chatbot import chat_engine, llm_service

MARKER = r"Fictional225_7f8a C:\private-fictional\provider-body-225.json"


@pytest.mark.parametrize(
    "path,status",
    [("message", 503), ("stream", 200), ("tool-message", 503), ("tool-message-stream", 200)],
)
def test_provider_body_never_reaches_public_frames(
    path, status, fake_openai, chat_app_client, monkeypatch, caplog
):
    async def no_tools():
        return []

    monkeypatch.setattr(chat_engine, "list_openai_tools", no_tools)
    fake_openai.push_error(500, MARKER)
    response = chat_app_client.post(f"/api/v1/chat/{path}", json={"text": "hello"})
    assert response.status_code == status
    assert MARKER.split()[0] not in response.text
    assert "provider_unavailable" in response.text
    assert MARKER.split()[0] in caplog.text


@pytest.mark.parametrize("path", ["tool-message", "tool-message-stream"])
@pytest.mark.parametrize("returned_error", [False, True])
def test_tool_failures_safe_before_summary(
    path, returned_error, fake_openai, chat_app_client, monkeypatch, caplog
):
    async def tools():
        return [
            {
                "type": "function",
                "function": {
                    "name": "predict_pace",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ]

    async def failing_tool(name, args):
        if returned_error:
            return {"error": MARKER, "detail": MARKER}
        raise FileNotFoundError(MARKER)

    monkeypatch.setattr(chat_engine, "list_openai_tools", tools)
    monkeypatch.setattr(chat_engine, "call_mcp_tool", failing_tool)
    fake_openai.push_tool_call("predict_pace", {})
    fake_openai.push_text("Please try another lap.")
    response = chat_app_client.post(f"/api/v1/chat/{path}", json={"text": "predict pace"})
    assert response.status_code == 200
    assert "tool_failed" in response.text
    assert MARKER.split()[0] not in response.text
    assert MARKER.split()[0] not in json.dumps(fake_openai.requests[-1])
    assert MARKER.split()[0] in caplog.text


@pytest.mark.parametrize(
    "method,path,target,status",
    [
        ("get", "health", "check_health", 500),
        ("get", "models", "get_available_models", 500),
        ("post", "message", "lm_send_message", 500),
        ("post", "stream", "lm_stream_message", 200),
        ("post", "stream", "build_messages", 500),
        ("post", "message", "build_messages", 500),
    ],
)
def test_chat_unexpected_exceptions(
    method, path, target, status, chat_app_client, monkeypatch, caplog
):
    def fail(*args, **kwargs):
        raise RuntimeError(MARKER)

    monkeypatch.setattr(chat, target, fail)
    response = getattr(chat_app_client, method)(
        f"/api/v1/chat/{path}", **({"json": {"text": "hello"}} if method == "post" else {})
    )
    assert response.status_code == status
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


def test_health_service_error_as_data(monkeypatch, chat_app_client, caplog):
    def fail(*args, **kwargs):
        raise RuntimeError(MARKER)

    monkeypatch.setattr(llm_service.requests, "get", fail)
    response = chat_app_client.get("/api/v1/chat/health")
    assert response.json()["status"] == "unhealthy"
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


def test_image_retry_retains_logs(chat_app_client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise llm_service.LLMServiceError(MARKER)

    monkeypatch.setattr(chat, "lm_send_message", fail)
    response = chat_app_client.post("/api/v1/chat/message", json={"text": "hello", "image": "YWJj"})
    assert response.status_code == 503
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


@pytest.mark.parametrize("path", ["tool-message", "tool-message-stream"])
def test_tool_route_unexpected_failure(path, chat_app_client, monkeypatch, caplog):
    async def fail(**kwargs):
        raise RuntimeError(MARKER)
        yield  # Make the streaming branch an async generator.

    async def fail_json(**kwargs):
        raise RuntimeError(MARKER)

    monkeypatch.setattr(chat_engine, "stream_response", fail)
    monkeypatch.setattr(chat_engine, "get_response", fail_json)
    response = chat_app_client.post(f"/api/v1/chat/{path}", json={"text": "hello"})
    assert response.status_code == 200
    assert "error" in response.text.lower() or "provider_unavailable" in response.text
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


@pytest.mark.parametrize(
    "exception",
    [llm_service.requests.exceptions.ConnectionError, llm_service.requests.exceptions.Timeout],
)
@pytest.mark.parametrize("path", ["message", "stream", "health", "models"])
def test_provider_transport_diagnostics(exception, path, chat_app_client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise exception(MARKER)

    monkeypatch.setattr(llm_service.requests, "post", fail)
    monkeypatch.setattr(llm_service.requests, "get", fail)
    if path in ("health", "models"):
        response = chat_app_client.get(f"/api/v1/chat/{path}")
    else:
        response = chat_app_client.post(f"/api/v1/chat/{path}", json={"text": "hello"})
    assert response.status_code == (200 if path in ("stream", "health") else 503)
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text
