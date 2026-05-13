"""Chatbot utility helpers (placeholder).

The legacy ``QueryClassifier`` + ``validate_query_request`` were retired
when the chat moved to MCP-driven function calling via ``chat_engine``.
This package is kept so existing import paths (e.g. tests that may live
in downstream forks) do not crash, but it currently exposes nothing.
"""

__all__: list[str] = []
