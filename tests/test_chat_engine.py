"""Unit tests for the chat engine helpers.

The engine orchestrates: pull tools → first LLM call → optional MCP
dispatch → summary LLM call.  These tests cover the small pure helpers
that compose that flow — message extraction, display-type resolution,
tool-call detection, summary fallback — without touching the LLM or
FastMCP.
"""

from __future__ import annotations

from backend.models.tool_schemas import DisplayType
from backend.services.chatbot.chat_engine import (
    _build_tool_result_payload,
    _done_metadata,
    _extract_message,
    _extract_text,
    _fallback_summary,
    _first_tool_call,
    _resolve_display_type,
    _strip_prefix,
    _trim_for_llm,
)


class TestExtractMessage:
    """``choices[0].message`` is the only place text or tool_calls can live."""

    def test_normal_response(self):
        assert _extract_message({"choices": [{"message": {"content": "hi"}}]}) == {"content": "hi"}

    def test_empty_choices(self):
        assert _extract_message({"choices": []}) == {}

    def test_missing_choices(self):
        assert _extract_message({}) == {}

    def test_choice_without_message_field(self):
        assert _extract_message({"choices": [{}]}) == {}


class TestExtractText:
    """Trims surrounding whitespace; empty/missing content is normalised to ''."""

    def test_normal_text(self):
        assert _extract_text({"choices": [{"message": {"content": "  hello  "}}]}) == "hello"

    def test_no_choices(self):
        assert _extract_text({}) == ""

    def test_null_content(self):
        assert _extract_text({"choices": [{"message": {"content": None}}]}) == ""


class TestFirstToolCall:
    """The engine processes one tool call per turn — we always pick index 0."""

    def test_no_tool_calls(self):
        assert _first_tool_call({}) is None

    def test_empty_tool_calls(self):
        assert _first_tool_call({"tool_calls": []}) is None

    def test_single_tool_call(self):
        tc = {"id": "t1", "function": {"name": "predict_pace", "arguments": "{}"}}
        assert _first_tool_call({"tool_calls": [tc]}) == tc

    def test_multiple_tool_calls_returns_first(self):
        tc1 = {"id": "t1", "function": {"name": "a", "arguments": "{}"}}
        tc2 = {"id": "t2", "function": {"name": "b", "arguments": "{}"}}
        assert _first_tool_call({"tool_calls": [tc1, tc2]}) == tc1


class TestResolveDisplayType:
    """Tool-name → frontend renderer hint, with FastMCP prefix stripping."""

    def test_known_phase1_tool(self):
        assert _resolve_display_type("predict_pace", has_error=False) == DisplayType.METRICS

    def test_known_phase2_tool(self):
        assert _resolve_display_type("compare_drivers", has_error=False) == DisplayType.CHART

    def test_telemetry_prefix_is_stripped(self):
        assert _resolve_display_type("telemetry_get_lap_times", has_error=False) == DisplayType.CHART

    def test_unknown_tool_falls_back_to_text(self):
        assert _resolve_display_type("unknown_tool_xyz", has_error=False) == DisplayType.TEXT

    def test_error_always_renders_as_text(self):
        # Even a chart-tool falls back to text when the dispatch failed.
        assert _resolve_display_type("compare_drivers", has_error=True) == DisplayType.TEXT


class TestStripPrefix:
    """FastMCP sub-server prefixes are dropped only for known mounts."""

    def test_double_underscore_separator(self):
        assert _strip_prefix("telemetry__get_lap_times") == "get_lap_times"

    def test_single_underscore_separator(self):
        assert _strip_prefix("telemetry_get_lap_times") == "get_lap_times"

    def test_unknown_prefix_kept(self):
        # ``predict`` is not a registered sub-server, so the name is left alone.
        assert _strip_prefix("predict_pace") == "predict_pace"

    def test_no_separator(self):
        assert _strip_prefix("recommend") == "recommend"


class TestTrimForLlm:
    """Long arrays are truncated with a marker so the prompt stays bounded."""

    def test_small_list_passes_through(self):
        assert _trim_for_llm([1, 2, 3]) == [1, 2, 3]

    def test_long_list_is_capped_with_marker(self):
        big = list(range(50))
        trimmed = _trim_for_llm(big)
        assert trimmed[:20] == list(range(20))
        assert "30 more items truncated" in str(trimmed[-1])

    def test_dict_recurses_into_values(self):
        data = {"laps": list(range(50)), "name": "VER"}
        trimmed = _trim_for_llm(data)
        assert len(trimmed["laps"]) == 21
        assert trimmed["name"] == "VER"

    def test_scalars_pass_through(self):
        assert _trim_for_llm("hello") == "hello"
        assert _trim_for_llm(42) == 42


class TestBuildToolResultPayload:
    """The payload always exposes the four-field shape the frontend renderer needs."""

    def test_success_payload(self):
        payload = _build_tool_result_payload("compare_drivers", {"a": 1}, None)
        assert payload["tool_name"] == "compare_drivers"
        assert payload["display_type"] == "chart"
        assert payload["data"] == {"a": 1}
        assert payload["summary"] == ""

    def test_error_payload_renders_as_text(self):
        payload = _build_tool_result_payload("predict_pace", None, "tool timed out")
        assert payload["display_type"] == "text"
        assert payload["data"] == {"error": "tool timed out"}
        assert "tool timed out" in payload["summary"]

    def test_no_data_no_error_returns_none(self):
        assert _build_tool_result_payload("predict_pace", None, None) is None


class TestFallbackSummary:
    """When the second LLM call returns nothing the user still sees something useful."""

    def test_with_error_mentions_tool_name(self):
        text = _fallback_summary("compare_drivers", "timeout")
        assert "compare_drivers" in text
        assert "timeout" in text

    def test_without_error_mentions_tool_name(self):
        text = _fallback_summary("predict_tire", None)
        assert "predict_tire" in text


class TestDoneMetadata:
    """Final SSE event carries provider model + token usage when available."""

    def test_extracts_model_and_tokens(self):
        response = {"model": "gpt-5.4-mini", "usage": {"total_tokens": 100}}
        assert _done_metadata(response) == {"llm_model": "gpt-5.4-mini", "tokens_used": 100}

    def test_missing_usage_yields_none_tokens(self):
        response = {"model": "gpt-5.4-mini"}
        assert _done_metadata(response) == {"llm_model": "gpt-5.4-mini", "tokens_used": None}

    def test_empty_response(self):
        assert _done_metadata({}) == {"llm_model": None, "tokens_used": None}

    def test_non_dict_response(self):
        assert _done_metadata(None) == {}
