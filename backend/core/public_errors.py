"""Stable public failure messages; diagnostic exceptions stay in server logs."""

INTERNAL_ERROR = "internal_error: Unable to complete the request."
PROVIDER_ERROR = "provider_unavailable: Unable to contact the language model."
TOOL_ERROR = "tool_failed: Unable to complete the tool request."
DATA_ERROR = "data_unavailable: Requested telemetry data is unavailable."
