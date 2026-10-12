"""Provider selection for simulations stays fixed to the backend process."""

from __future__ import annotations

import os

import pytest
from backend.core.config import resolve_simulation_provider


@pytest.mark.parametrize(
    ("configured", "requested", "expected"),
    [
        (None, None, "lmstudio"),
        ("openai", None, "openai"),
        ("openai", "openai", "openai"),
        ("lmstudio", "lmstudio", "lmstudio"),
        ("unexpected", "lmstudio", "lmstudio"),
    ],
)
def test_provider_uses_the_process_configuration(monkeypatch, configured, requested, expected):
    if configured is None:
        monkeypatch.delenv("F1_LLM_PROVIDER", raising=False)
    else:
        monkeypatch.setenv("F1_LLM_PROVIDER", configured)

    assert resolve_simulation_provider(requested) == expected


def test_provider_rejects_mismatch_without_changing_environment(monkeypatch):
    monkeypatch.setenv("F1_LLM_PROVIDER", "lmstudio")

    with pytest.raises(ValueError, match="conflicts with backend process provider"):
        resolve_simulation_provider("openai")

    assert os.environ["F1_LLM_PROVIDER"] == "lmstudio"


def test_legacy_chat_alias_does_not_select_the_strategy_provider(monkeypatch):
    monkeypatch.delenv("F1_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "openai")

    assert resolve_simulation_provider() == "lmstudio"
