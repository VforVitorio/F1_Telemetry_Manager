"""A1a — /mcp kill-switch flag parsing (issue #224).

The mount decision in ``main.py`` hinges on ``config.mcp_enabled()`` reading the
``F1_MCP_ENABLED`` env var. Default-off is the security-relevant invariant: an
operator must opt IN to expose the external tool surface, so a missing or
unparseable value must never enable it.
"""

from __future__ import annotations

from backend.core.config import mcp_enabled


def test_mcp_disabled_by_default(monkeypatch):
    monkeypatch.delenv("F1_MCP_ENABLED", raising=False)
    assert mcp_enabled() is False


def test_mcp_enabled_accepts_truthy_spellings(monkeypatch):
    for value in ("true", "TRUE", "1", "yes", "on", " On "):
        monkeypatch.setenv("F1_MCP_ENABLED", value)
        assert mcp_enabled() is True, value


def test_mcp_stays_off_for_falsey_or_garbage(monkeypatch):
    for value in ("false", "0", "no", "off", "", "maybe"):
        monkeypatch.setenv("F1_MCP_ENABLED", value)
        assert mcp_enabled() is False, value
