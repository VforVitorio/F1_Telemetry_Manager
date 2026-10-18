from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from backend.core.config import (
    configured_chat_provider,
    configured_strategy_provider,
    provider_api_urls,
    resolve_simulation_provider,
)
from backend.services.chatbot import llm_service
from backend.services.chatbot.llm_service import LLMServiceError


def test_provider_urls_use_one_configured_base(monkeypatch):
    monkeypatch.setenv("LM_STUDIO_HOST", "llm-host")

    assert provider_api_urls("lmstudio") == (
        "http://llm-host:1234/v1/chat/completions",
        "http://llm-host:1234/v1/models",
    )
    assert provider_api_urls("openai") == (
        "https://api.openai.com/v1/chat/completions",
        "https://api.openai.com/v1/models",
    )


def test_legacy_chat_alias_cannot_switch_the_strategy_provider(monkeypatch):
    monkeypatch.delenv("F1_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "openai")

    assert configured_chat_provider() == "openai"
    assert configured_strategy_provider() == "lmstudio"
    assert resolve_simulation_provider() == "lmstudio"


def test_primary_provider_setting_selects_both_paths(monkeypatch):
    monkeypatch.setenv("F1_LLM_PROVIDER", "openai")

    assert configured_chat_provider() == "openai"
    assert configured_strategy_provider() == "openai"


def test_provider_error_logs_do_not_contain_prompts_keys_or_response_bodies(monkeypatch, caplog):
    prompt = "private-prompt-canary"
    secret = "private-api-key-canary"
    response_body = f"provider-echo:{prompt}:{secret}"
    response = SimpleNamespace(status_code=401, text=response_body)

    monkeypatch.setattr(llm_service, "_is_openai", True)
    monkeypatch.setattr(llm_service, "OPENAI_API_KEY", secret)
    monkeypatch.setattr(llm_service.requests, "get", lambda *args, **kwargs: response)
    monkeypatch.setattr(llm_service.requests, "post", lambda *args, **kwargs: response)
    caplog.set_level(logging.DEBUG, logger=llm_service.logger.name)

    llm_service.check_health()
    with pytest.raises(LLMServiceError):
        llm_service.get_available_models()
    with pytest.raises(LLMServiceError):
        llm_service.send_message([{"role": "user", "content": prompt}])
    with pytest.raises(LLMServiceError):
        list(llm_service.stream_message([{"role": "user", "content": prompt}]))

    assert prompt not in caplog.text
    assert secret not in caplog.text
    assert response_body not in caplog.text
