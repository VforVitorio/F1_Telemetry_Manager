"""API-key authentication + fail-closed startup guard (Security A1, issue #224).

A single shared secret is the whole identity model here: this is a single-user
TFG deploy with no IdP or user store, so one static key (``F1_API_KEY``) enforced
by one ASGI middleware is the minimal control that covers BOTH the routers and
the ``/mcp`` sub-app from a single insertion point. A router-level ``Depends``
cannot guard an ``app.mount()`` sub-app; middleware runs before mount dispatch,
so it can.

Safe-by-default:
- When ``F1_API_KEY`` is unset the middleware passes every request, so local dev
  is unchanged. The only dangerous combination — a non-loopback bind with no key
  — is refused at startup by :func:`enforce_startup_security`, so "no key" only
  ever means "localhost-only", never "open to the network".
- ``OPTIONS`` (CORS preflight) and the unauthenticated paths ``/`` and
  ``/health`` always pass.

Pure ASGI on purpose (not ``BaseHTTPMiddleware``): the latter buffers the whole
response body, which would break the SSE streams
(``/chat/tool-message-stream``, ``/simulate``). A pass-through ASGI wrapper
leaves streaming untouched.

--- WHERE TO CHANGE IF THE AUTH CONTRACT CHANGES ---
- Header name: ``_API_KEY_HEADER`` below.
- Open (keyless) paths: ``OPEN_PATHS`` below.
- The env vars (``F1_API_KEY``, ``F1_HOST``) are read via ``core.config``.
- Registration order lives in ``main.py`` (added after CORS so auth is outermost).
"""

from __future__ import annotations

import hmac
import logging

from backend.core.config import api_key, bind_host

logger = logging.getLogger(__name__)

# ASGI lowercases HTTP header names in ``scope``; match in lowercase bytes.
_API_KEY_HEADER = b"x-api-key"

# Liveness/root paths that must answer without a key (uptime probes, a human
# hitting ``/``). Everything else is gated once a key is configured.
OPEN_PATHS = frozenset({"/", "/health"})

_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _is_loopback(host: str) -> bool:
    """True when *host* binds only the loopback interface.

    ``0.0.0.0`` / ``::`` (all interfaces) and any concrete LAN/public address are
    NOT loopback — those are exactly the binds that must carry a key.
    """
    normalized = (host or "").strip().lower()
    return normalized in _LOOPBACK_HOSTS or normalized.startswith("127.")


def enforce_startup_security() -> None:
    """Fail closed when bound to a non-loopback host without an API key.

    That pairing is the only one that silently exposes the whole surface to the
    network, so we refuse to boot rather than come up open. Localhost with no key
    stays allowed (local dev); any key with any bind is allowed.

    Raises:
        RuntimeError: on a non-loopback bind with ``F1_API_KEY`` unset.
    """
    if api_key():
        return
    host = bind_host()
    if not _is_loopback(host):
        raise RuntimeError(
            f"Refusing to start: bound to non-loopback host {host!r} without "
            f"F1_API_KEY set. Set F1_API_KEY, or bind F1_HOST to 127.0.0.1."
        )
    logger.warning(
        "F1_API_KEY is not set — the API is UNAUTHENTICATED (localhost-only bind %r).",
        host,
    )


class ApiKeyMiddleware:
    """Pure-ASGI shared-secret gate. Policy lives in the module docstring."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        # Gate HTTP and WebSocket alike. There is no WS route today, but the
        # architecture anticipates a live WS feed, and a passthrough here would
        # hand a future WS endpoint an unauthenticated door. `lifespan` and other
        # non-connection scopes are never gated.
        if scope["type"] not in ("http", "websocket") or self._is_authorized(scope):
            await self.app(scope, receive, send)
            return
        await self._reject(scope, send)

    def _is_authorized(self, scope) -> bool:
        """True when the request may proceed without or with a valid key."""
        if scope.get("method") == "OPTIONS":
            return True
        if scope.get("path") in OPEN_PATHS:
            return True
        expected = api_key()
        if not expected:
            # Safe-by-default: no key configured → local dev. The startup guard
            # already refused the only unsafe bind for this state.
            return True
        provided = self._header(scope, _API_KEY_HEADER)
        if provided is None:
            return False
        return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))

    @staticmethod
    def _header(scope, name: bytes) -> str | None:
        """Return the first value of header *name* (lowercased bytes) or None."""
        for key, value in scope.get("headers") or []:
            if key == name:
                return value.decode("latin-1")
        return None

    @staticmethod
    async def _reject(scope, send) -> None:
        """Refuse an unauthenticated request without touching the downstream app.

        HTTP → a bare 401 JSON body; WebSocket → a policy-violation close (1008)
        before the handshake is accepted.
        """
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        body = b'{"detail":"Missing or invalid API key."}'
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})
