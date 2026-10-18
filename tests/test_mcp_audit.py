from __future__ import annotations

import asyncio
import hashlib
import json
import logging

from backend.mcp_tools import _catch_tool_input_error, mcp
from backend.services.chatbot import mcp_bridge
from fastmcp import Client


def test_middleware_audits_success_and_failure_without_payloads(caplog, capsys, monkeypatch):
    request_id = "private-request-canary"
    secret_argument = "private-argument-canary"
    secret_result = "private-result-canary"

    def audit_probe_success(secret: str) -> str:
        return secret_result

    def audit_probe_failure(secret: str) -> str:
        raise RuntimeError(secret)

    def audit_probe_unwrapped_failure(secret: str) -> str:
        raise RuntimeError(secret)

    mcp.add_tool(audit_probe_success)
    mcp.add_tool(_catch_tool_input_error(audit_probe_failure))
    mcp.add_tool(audit_probe_unwrapped_failure)
    caplog.set_level(logging.INFO, logger="backend.core.mcp_audit")
    monkeypatch.setattr("backend.mcp_tools._mount_openapi_tools", lambda: None)

    async def call_tools() -> None:
        await mcp_bridge.call_mcp_tool(
            "audit_probe_success", {"secret": secret_argument}, request_id=request_id
        )
        async with Client(mcp) as client:
            try:
                await client.call_tool("audit_probe_failure", {"secret": secret_argument})
            except Exception:
                pass
            try:
                await client.call_tool("audit_probe_unwrapped_failure", {"secret": secret_argument})
            except Exception:
                pass

    try:
        asyncio.run(call_tools())
    finally:
        mcp.local_provider.remove_tool("audit_probe_success")
        mcp.local_provider.remove_tool("audit_probe_failure")
        mcp.local_provider.remove_tool("audit_probe_unwrapped_failure")

    events = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "backend.core.mcp_audit"
    ]
    assert [event["outcome"] for event in events] == ["success", "error", "error"]
    assert events[0]["caller"] == "chat.tool_message"
    assert events[0]["request_id_hash"] == hashlib.sha256(request_id.encode()).hexdigest()[:16]
    assert events[1]["caller"] == "mcp.client"
    assert events[2]["caller"] == "mcp.client"
    assert all(event["method"] == "tools/call" for event in events)
    assert all(event["arguments_sha256"] for event in events)
    assert request_id not in caplog.text
    assert secret_argument not in caplog.text
    assert secret_result not in caplog.text
    fastmcp_stderr = capsys.readouterr().err
    assert secret_argument not in fastmcp_stderr
    assert "RuntimeError" not in fastmcp_stderr
