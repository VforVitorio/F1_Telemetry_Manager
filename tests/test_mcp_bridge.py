"""Unit tests for the MCP bridge pure helpers.

The bridge has two concerns: format MCP tool definitions for the OpenAI
``tools=`` parameter, and parse the ``arguments`` field that comes back
from the model's tool_call.  Both are covered here without spinning up
a FastMCP server, since the live ``list_openai_tools`` / ``call_mcp_tool``
paths are exercised end-to-end by manual smoke tests against the running
backend.
"""

from __future__ import annotations

from backend.services.chatbot.mcp_bridge import (
    _normalize_input_schema,
    coerce_tool_arguments,
    to_openai_tool,
)


class TestNormalizeInputSchema:
    """OpenAI requires ``parameters`` to always be an object schema."""

    def test_dict_passes_through(self):
        schema = {"type": "object", "properties": {"gp": {"type": "string"}}}
        assert _normalize_input_schema(schema) == schema

    def test_none_becomes_empty_object(self):
        assert _normalize_input_schema(None) == {"type": "object", "properties": {}}

    def test_non_dict_becomes_empty_object(self):
        # Defensive: a malformed FastMCP entry should not crash the chat.
        assert _normalize_input_schema("not a dict") == {"type": "object", "properties": {}}


class TestToOpenaiTool:
    """Wrap an MCP Tool's metadata in the ``{"type": "function", ...}`` shape."""

    def test_full_tool(self):
        schema = {
            "type": "object",
            "properties": {"gp": {"type": "string"}, "lap": {"type": "integer"}},
            "required": ["gp", "lap"],
        }
        tool = to_openai_tool("predict_pace", "Predict next-lap delta", schema)
        assert tool["type"] == "function"
        assert tool["function"]["name"] == "predict_pace"
        assert tool["function"]["description"] == "Predict next-lap delta"
        assert tool["function"]["parameters"] == schema

    def test_missing_description_becomes_empty_string(self):
        # OpenAI accepts an empty description; we should not pass ``None``.
        tool = to_openai_tool("list_gps", None, None)
        assert tool["function"]["description"] == ""

    def test_missing_schema_yields_empty_object(self):
        tool = to_openai_tool("ping", "Health check", None)
        assert tool["function"]["parameters"] == {"type": "object", "properties": {}}


class TestCoerceToolArguments:
    """OpenAI returns arguments as a JSON-encoded string; some providers send a dict."""

    def test_dict_passes_through(self):
        assert coerce_tool_arguments({"gp": "Monza"}) == {"gp": "Monza"}

    def test_json_string_is_parsed(self):
        assert coerce_tool_arguments('{"gp": "Monza", "lap": 30}') == {"gp": "Monza", "lap": 30}

    def test_empty_string_yields_empty_dict(self):
        assert coerce_tool_arguments("") == {}

    def test_none_yields_empty_dict(self):
        assert coerce_tool_arguments(None) == {}

    def test_malformed_json_yields_empty_dict(self):
        # Logs a warning internally but never raises — the chat must keep going.
        assert coerce_tool_arguments("not json") == {}

    def test_json_array_is_rejected(self):
        # Tool kwargs must be a dict; arrays come back as empty kwargs.
        assert coerce_tool_arguments("[1, 2, 3]") == {}
