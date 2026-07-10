"""The provider request timeout must always be finite (Security S-5 / LLM-cost L-1).

A ``None`` timeout on the LM Studio path let a hung local model freeze the
backend forever (``requests`` treats ``timeout=None`` as "wait indefinitely").
These tests pin that ``DEFAULT_TIMEOUT`` stays a real positive number for every
provider, and that the ``F1_LLM_TIMEOUT`` env override is honored.
"""

from __future__ import annotations

import importlib


def _reload_llm_service(monkeypatch, provider: str):
    """Reload llm_service with a chosen provider and no env timeout override.

    ``DEFAULT_TIMEOUT`` is computed at import time from the provider, so the
    module has to be re-imported under the patched environment to observe it.
    """
    monkeypatch.setenv("F1_LLM_PROVIDER", provider)
    monkeypatch.delenv("F1_LLM_TIMEOUT", raising=False)
    import backend.services.chatbot.llm_service as svc

    return importlib.reload(svc)


def test_timeout_finite_for_lmstudio(monkeypatch):
    svc = _reload_llm_service(monkeypatch, "lmstudio")
    assert svc.DEFAULT_TIMEOUT is not None
    assert svc.DEFAULT_TIMEOUT > 0


def test_timeout_finite_for_openai(monkeypatch):
    svc = _reload_llm_service(monkeypatch, "openai")
    assert svc.DEFAULT_TIMEOUT is not None
    assert svc.DEFAULT_TIMEOUT > 0


def test_timeout_env_override(monkeypatch):
    monkeypatch.setenv("F1_LLM_PROVIDER", "lmstudio")
    monkeypatch.setenv("F1_LLM_TIMEOUT", "42")
    import backend.services.chatbot.llm_service as svc

    svc = importlib.reload(svc)
    assert svc.DEFAULT_TIMEOUT == 42.0
