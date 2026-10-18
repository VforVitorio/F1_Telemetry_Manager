"""Content-free audit records for every FastMCP tool dispatch."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

from fastmcp.server.middleware import Middleware, MiddlewareContext

logger = logging.getLogger(__name__)
_chat_request_id: ContextVar[str | None] = ContextVar("chat_mcp_request_id", default=None)


class _ToolFailureTracebackFilter(logging.Filter):
    """Keep FastMCP's generic tool-error line but not exception payloads/arguments."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.exc_info = None
        record.exc_text = None
        return True


logging.getLogger("fastmcp.server.server").addFilter(_ToolFailureTracebackFilter())


@contextmanager
def chat_tool_request(request_id: str) -> Iterator[None]:
    """Attach a request correlation id to the in-process chat dispatch only."""
    token = _chat_request_id.set(request_id)
    try:
        yield
    finally:
        _chat_request_id.reset(token)


class ToolDispatchAudit(Middleware):
    """Record tool identity, argument digest, outcome, and duration, never payloads."""

    async def on_call_tool(self, context: MiddlewareContext, call_next):
        started_at = time.perf_counter()
        outcome = "error"
        error_type: str | None = "DispatchError"
        message = context.message
        tool_name = str(getattr(message, "name", "unknown"))[:128]
        arguments = getattr(message, "arguments", None)
        request_id = _chat_request_id.get()

        try:
            result = await call_next(context)
            failed = bool(getattr(result, "isError", False))
            outcome = "error" if failed else "success"
            error_type = "ToolError" if failed else None
            return result
        except Exception as exc:
            error_type = type(exc).__name__
            raise
        finally:
            event: dict[str, Any] = {
                "event": "mcp_tool_dispatch",
                "caller": "chat.tool_message" if request_id is not None else "mcp.client",
                "source": context.source if context.source in {"client", "server"} else "unknown",
                "method": "tools/call" if context.method == "tools/call" else "unknown",
                "tool": tool_name,
                "arguments_sha256": _digest_arguments(arguments),
                "outcome": outcome,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            }
            if request_id is not None:
                event["request_id_hash"] = hashlib.sha256(
                    request_id.encode("utf-8", errors="replace")
                ).hexdigest()[:16]
            if error_type is not None:
                event["error_type"] = error_type
            logger.info("%s", json.dumps(event, sort_keys=True, separators=(",", ":")))


def _digest_arguments(arguments: Any) -> str:
    try:
        encoded = json.dumps(
            arguments, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str
        ).encode("utf-8")
    except (TypeError, ValueError, RecursionError):
        return "unavailable"
    return hashlib.sha256(encoded).hexdigest()
