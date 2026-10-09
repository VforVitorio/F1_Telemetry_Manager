"""The provider request timeout must always be finite (Security S-5 / LLM-cost L-1).

A ``None`` timeout on the LM Studio path let a hung local model freeze the
backend forever (``requests`` treats ``timeout=None`` as "wait indefinitely").
These tests pin that ``DEFAULT_TIMEOUT`` stays a real positive number for every
provider, and that the ``F1_LLM_TIMEOUT`` env override is honored.
"""

from __future__ import annotations

import os
import subprocess
import sys


def _provider_timeout(monkeypatch, provider: str, override: str | None = None) -> float:
    """Inspect import-time configuration without replacing other tests' exception types."""
    monkeypatch.setenv("F1_LLM_PROVIDER", provider)
    if override is None:
        monkeypatch.delenv("F1_LLM_TIMEOUT", raising=False)
    else:
        monkeypatch.setenv("F1_LLM_TIMEOUT", override)
    output = subprocess.check_output(
        [
            sys.executable,
            "-B",
            "-c",
            "from backend.services.chatbot.llm_service import DEFAULT_TIMEOUT; print(DEFAULT_TIMEOUT)",
        ],
        env=os.environ.copy(),
        text=True,
    )
    return float(output.strip())


def test_timeout_finite_for_lmstudio(monkeypatch):
    assert _provider_timeout(monkeypatch, "lmstudio") > 0


def test_timeout_finite_for_openai(monkeypatch):
    assert _provider_timeout(monkeypatch, "openai") > 0


def test_timeout_env_override(monkeypatch):
    assert _provider_timeout(monkeypatch, "lmstudio", "42") == 42.0
