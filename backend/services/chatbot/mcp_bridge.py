"""
MCP Bridge — Adapter between the chat backend and the FastMCP tool server.

The chat used to maintain its own parallel registry of tools (regex
keyword map, JSON-extraction prompt, confidence scoring) that drifted
from the FastMCP server's actual tools.  This bridge eliminates that
duplication: tool schemas are pulled live from the FastMCP instance,
exposed to the LLM via OpenAI's ``tools=`` function-calling format, and
dispatched back through the MCP client when the model picks one.

Design choices:
- **In-process MCP client**: ``fastmcp.Client(mcp)`` connects directly to
  the same Python instance the FastAPI app mounts at ``/mcp`` — no HTTP
  round-trip, identical schemas guaranteed.
- **Async-only API**: the FastMCP 3.x client is async; callers wrap the
  bridge in their own event loop or use the async-friendly endpoints.
- **OpenAI tool format**: the LLM-facing format is the OpenAI v1
  function-calling schema, which both OpenAI cloud and LM Studio's v1
  endpoint accept.  Local models that don't honour ``tools=`` simply
  return text and we treat the message as a plain reply.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schema helpers — pure functions, no MCP import (kept testable in isolation)
# ---------------------------------------------------------------------------

def _normalize_input_schema(schema: Any) -> dict[str, Any]:
    """Return a JSON-Schema object suitable for OpenAI's ``parameters`` field.

    The MCP spec lets ``inputSchema`` be ``None`` for parameter-less tools;
    OpenAI requires an object with at least ``type: object``.  Anything
    that is not a dict is replaced with the empty-object schema so the
    payload stays valid.
    """
    if isinstance(schema, dict):
        return schema
    return {"type": "object", "properties": {}}


def to_openai_tool(name: str, description: str, input_schema: Any) -> dict[str, Any]:
    """Convert a single MCP tool to OpenAI's ``tools=[...]`` entry shape.

    OpenAI / LM Studio expects: ``{"type": "function", "function": {name,
    description, parameters}}``.  Defined as a free function so it can be
    unit-tested without spinning up a FastMCP server.
    """
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description or "",
            "parameters": _normalize_input_schema(input_schema),
        },
    }


def coerce_tool_arguments(raw_arguments: Any) -> dict[str, Any]:
    """Parse the ``arguments`` field of a tool_call into a kwargs dict.

    OpenAI returns ``arguments`` as a JSON-encoded string; some local
    providers send it as a dict already.  Empty / malformed payloads
    become an empty kwargs dict so the tool dispatch can still surface
    a clean error from the MCP layer.
    """
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if not raw_arguments:
        return {}
    try:
        parsed = json.loads(raw_arguments)
    except (TypeError, json.JSONDecodeError):
        logger.warning("Could not parse tool arguments JSON: %r", raw_arguments)
        return {}
    return parsed if isinstance(parsed, dict) else {}


# ---------------------------------------------------------------------------
# FastMCP-backed bridge — async API
# ---------------------------------------------------------------------------

async def list_openai_tools() -> list[dict[str, Any]]:
    """Fetch every tool registered with the FastMCP server in OpenAI format.

    Includes both the manually decorated ``@mcp.tool`` Phase 1 strategy
    tools and the Phase 2 telemetry tools auto-generated from the
    FastAPI OpenAPI spec via ``FastMCP.from_openapi``.
    """
    tools = await _fetch_tools()
    return [to_openai_tool(t.name, t.description, t.inputSchema) for t in tools]


async def call_mcp_tool(name: str, arguments: dict[str, Any]) -> Any:
    """Dispatch a tool call by name through the MCP client and return the data.

    The MCP client returns a structured ``CallToolResult`` whose ``data``
    attribute holds the tool's return value.  Our Phase 1 tools serialise
    their output via ``json.dumps`` so ``data`` arrives as a JSON string
    rather than a Python dict — we parse it here so downstream renderers
    (chat tool_result component) can do the dict access they expect.
    Errors from the tool propagate up untouched.
    """
    from fastmcp import Client
    from backend.mcp_tools import mcp, _mount_openapi_tools  # noqa: F401

    # Idempotent: ensures Phase 2 telemetry tools are mounted before the
    # client lists them.  The startup hook in main.py also calls this; the
    # second call is a no-op thanks to the _openapi_mounted flag.
    _mount_openapi_tools()

    async with Client(mcp) as client:
        result = await client.call_tool(name, arguments or {})

    raw = getattr(result, "data", None)
    if raw is None:
        raw = getattr(result, "content", None)
    return _coerce_tool_payload(raw)


def _coerce_tool_payload(raw: Any) -> Any:
    """Parse a JSON-encoded string into its dict/list, leave everything else alone.

    Phase 1 tools (``predict_pace``, ``predict_tire``, ...) wrap their
    output in ``json.dumps`` because MCP defines them as returning ``str``.
    The chat's tool_result renderer expects a dict, so the JSON has to
    be re-parsed before reaching the frontend.  Phase 2 telemetry tools
    return dicts directly (auto-mounted from OpenAPI) and pass through
    unchanged.  A genuine plain-string return (rare) also passes through.
    """
    if not isinstance(raw, str):
        return raw
    stripped = raw.strip()
    if not stripped or stripped[0] not in "{[":
        return raw
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        logger.warning("MCP tool returned a string that looked like JSON but failed to parse")
        return raw


async def _fetch_tools() -> list[Any]:
    """Connect once and return the live tool list. Internal helper."""
    from fastmcp import Client
    from backend.mcp_tools import mcp, _mount_openapi_tools

    _mount_openapi_tools()
    async with Client(mcp) as client:
        return await client.list_tools()
