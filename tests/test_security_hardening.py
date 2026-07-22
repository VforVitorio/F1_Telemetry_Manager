"""Hermetic tests for the Security Phase C hardening (#226).

Covers the token-bucket rate limiter and the chat request-validation
bounds. No provider, no models - all pure Pydantic + stdlib, so these run in
the deps-lite CI job.
"""

from __future__ import annotations

import pytest

from backend.core.rate_limit import TokenBucket
from backend.models.chat_models import (
    MAX_HISTORY_MESSAGES,
    MAX_TEXT_CHARS,
    ChatRequest,
)


def test_token_bucket_allows_burst_then_blocks():
    """A bucket of capacity N admits N immediate requests, then denies the next."""
    bucket = TokenBucket(capacity=2, refill_per_minute=60)
    assert bucket.try_acquire("ip-a")[0] is True
    assert bucket.try_acquire("ip-a")[0] is True
    allowed, retry_after = bucket.try_acquire("ip-a")
    assert allowed is False
    assert retry_after > 0  # a positive Retry-After is reported


def test_token_bucket_is_keyed_per_client():
    """One client's exhaustion does not affect another key."""
    bucket = TokenBucket(capacity=1, refill_per_minute=1)
    assert bucket.try_acquire("ip-a")[0] is True
    assert bucket.try_acquire("ip-a")[0] is False
    assert bucket.try_acquire("ip-b")[0] is True  # independent bucket state


def test_chat_history_is_capped():
    """chat_history over the cap is rejected before it can reach the prompt."""
    with pytest.raises(ValueError):
        ChatRequest(
            text="hi",
            chat_history=[{"role": "user", "content": "x"}] * (MAX_HISTORY_MESSAGES + 1),
        )


def test_chat_context_is_pruned_to_allowed_keys():
    """Unknown context keys are dropped; only the four build_messages reads survive."""
    request = ChatRequest(
        text="hi",
        context={"year": 2025, "grand_prix": "Monza", "injected": "evil", "drivers": ["NOR"]},
    )
    assert set(request.context) == {"year", "grand_prix", "drivers"}
    assert "injected" not in request.context


def test_chat_text_length_is_bounded():
    """An oversized prompt text is rejected."""
    with pytest.raises(ValueError):
        ChatRequest(text="x" * (MAX_TEXT_CHARS + 1))
