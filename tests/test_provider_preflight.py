"""Hermetic tests for the ProviderPreflight TTL cache (LLM-cost L-3, #263).

No provider, no network - check_health is monkeypatched so we can assert the
caching + invalidation behaviour that lets a chat/voice turn fail fast.
"""

from __future__ import annotations

from backend.services.chatbot import llm_service


def test_preflight_caches_within_ttl(monkeypatch):
    """Availability is fetched once and reused until the TTL lapses."""
    calls = {"n": 0}

    def fake_health():
        calls["n"] += 1
        return {"status": "healthy"}

    monkeypatch.setattr(llm_service, "check_health", fake_health)
    preflight = llm_service.ProviderPreflight(ttl_s=1000)

    assert preflight.is_available() is True
    assert preflight.is_available() is True
    assert calls["n"] == 1  # second call served from cache, no extra health ping


def test_preflight_reports_unhealthy(monkeypatch):
    """A non-healthy provider is reported as unavailable."""
    monkeypatch.setattr(llm_service, "check_health", lambda: {"status": "unhealthy"})
    preflight = llm_service.ProviderPreflight(ttl_s=1000)
    assert preflight.is_available() is False


def test_preflight_mark_failed_invalidates(monkeypatch):
    """After a failed send, the cache flips to unavailable without a new ping."""
    monkeypatch.setattr(llm_service, "check_health", lambda: {"status": "healthy"})
    preflight = llm_service.ProviderPreflight(ttl_s=1000)
    assert preflight.is_available() is True
    preflight.mark_failed()
    assert preflight.is_available() is False  # served from the invalidated cache
