"""In-process per-client rate limiting for the expensive unauthenticated endpoints.

Security C2 / S-7: a single client (or a stray script) must not be able to pin
the workers by hammering ``/simulate``, the prediction routes or voice. This is a
local, single-process backend, so a stdlib token bucket keyed on the client IP is
enough - no ``slowapi``/``limits`` dependency is pulled in for a few lines of code.

Each ``rate_limit(...)`` call owns one bucket per route (via a closure), so the
limits are independent. The dependency is evaluated at request admission, so an
open SSE stream consumes exactly one token and then runs unmetered - the limiter
never interferes with a long-lived sim/voice stream.

--- WHERE TO CHANGE IF THE LIMITS CHANGE ---
The per-route (capacity, per_minute) pairs live at each route's
``dependencies=[Depends(rate_limit(...))]`` in the endpoint modules, not here.
Set ``F1_RATE_LIMIT_OFF=1`` to disable entirely (load tests, benchmarking).
"""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request

_DISABLE_ENV = "F1_RATE_LIMIT_OFF"


class TokenBucket:
    """Per-key token bucket. Thread-safe (sync endpoints run in the threadpool).

    ``capacity`` tokens are available at rest; they refill continuously at
    ``refill_per_minute`` tokens/min. A request takes one token; when the bucket
    is empty the caller is told how long to wait for the next token.
    """

    def __init__(self, capacity: int, refill_per_minute: float) -> None:
        self._capacity = float(capacity)
        self._refill_per_s = refill_per_minute / 60.0
        self._lock = threading.Lock()
        self._state: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_ts)

    def try_acquire(self, key: str) -> tuple[bool, float]:
        """Take one token for ``key``; return ``(allowed, retry_after_seconds)``."""
        now = time.monotonic()
        with self._lock:
            tokens, last = self._state.get(key, (self._capacity, now))
            tokens = min(self._capacity, tokens + (now - last) * self._refill_per_s)
            if tokens >= 1.0:
                self._state[key] = (tokens - 1.0, now)
                return True, 0.0
            self._state[key] = (tokens, now)
            deficit = 1.0 - tokens
            retry_after = deficit / self._refill_per_s if self._refill_per_s > 0 else 60.0
            return False, retry_after


def _client_key(request: Request) -> str:
    """Client IP as the bucket key; falls back to a constant for local/unknown clients.

    ``X-Forwarded-For`` is deliberately NOT honored: without a trusted reverse
    proxy it is client-spoofable, and the deployment target is a local process.
    """
    return request.client.host if request.client else "local"


def rate_limit(name: str, capacity: int, per_minute: float) -> Callable[[Request], Awaitable[None]]:
    """Build a FastAPI dependency that rate-limits one route via its own bucket.

    Args:
        name: Route label used in the 429 message (e.g. ``"simulate"``).
        capacity: Burst size - tokens available at rest.
        per_minute: Sustained refill rate in tokens per minute.

    Returns:
        An async dependency that raises 429 (with ``Retry-After``) when the
        per-client bucket is empty, or does nothing when the limit is disabled.
    """
    bucket = TokenBucket(capacity, per_minute)

    async def _dependency(request: Request) -> None:
        if os.getenv(_DISABLE_ENV) == "1":
            return
        allowed, retry_after = bucket.try_acquire(_client_key(request))
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit for '{name}' exceeded; retry shortly.",
                headers={"Retry-After": str(int(retry_after) + 1)},
            )

    return _dependency
