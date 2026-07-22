import logging
import sys
from contextlib import asynccontextmanager

# Force UTF-8 on this process's streams. Several services print non-ASCII
# glyphs (e.g. telemetry_service's "✓"/"⚠"/"❌"); on a Windows cp1252 console
# those `print(...)` calls raise UnicodeEncodeError, and because they sit inside
# broad try/except blocks the crash is swallowed and the endpoint silently
# returns empty data (the whole telemetry Dashboard shows "no data"). The
# hasattr guard keeps this safe under a captured stdout (e.g. pytest).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from backend.api.v1.endpoints import circuit_domination, comparison, telemetry, chat, strategy
from backend.core.config import FRONTEND_URL, mcp_enabled
from backend.core.auth import ApiKeyMiddleware, enforce_startup_security
from backend.mcp_tools import mcp as mcp_server, _mount_openapi_tools
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

logger = logging.getLogger(__name__)

# Build the MCP ASGI sub-app (Streamable HTTP, FastMCP 3.x)
mcp_app = mcp_server.http_app(path="/mcp")


@asynccontextmanager
async def lifespan(app):
    """Wrap the FastMCP lifespan so we can mount Phase 2 tools at the right time.

    Three constraints stack up here:
    1. FastAPI ignores ``@app.on_event("startup")`` when a custom
       ``lifespan`` is set — and we MUST set one to drive the MCP server.
    2. ``_mount_openapi_tools`` cannot run at module import time because
       the FastMCP sub-server's ``lifespan`` provider needs ``mcp_app``
       to be already initialised; mounting earlier left the provider's
       ``self.server`` field as the bare ``"telemetry"`` string and the
       startup blew up with ``AttributeError: 'str' object has no
       attribute '_lifespan'``.
    3. The mount must complete BEFORE the server starts serving requests
       so the very first chat call already sees the Phase 2 tools.

    The fix: run the wrapped MCP lifespan first (initialising the server),
    then mount the OpenAPI-derived tools, then yield control to uvicorn.
    """
    # Security A1 (#224): fail closed on a non-loopback bind with no key before
    # any heavy init runs.
    enforce_startup_security()
    async with mcp_app.lifespan(app):
        _mount_openapi_tools(app)
        yield


app = FastAPI(title="F1 Telemetry API", lifespan=lifespan)

app.add_middleware(
    # Security C3 / S-8: the origin is already specific (FRONTEND_URL). Credentials
    # are dropped because no client authenticates by cookie (the Streamlit frontend
    # calls the backend server-side, not from the browser), and the method/header
    # allowlists are enumerated to the verbs/headers actually used instead of "*".
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Request-Id"],
)

# Security A1 (#224): the shared-secret gate. Added AFTER CORS so it wraps
# OUTERMOST — an unauthenticated request is rejected before any other work, and
# OPTIONS is passed through so CORS preflight still runs. One insertion point
# covers both the routers and the /mcp mount (middleware runs before mount
# dispatch; a router-level Depends could not reach the mounted sub-app).
app.add_middleware(ApiKeyMiddleware)

# Add telemetry router
app.include_router(telemetry.router, prefix="/api/v1")

# Add circuit domination router
app.include_router(circuit_domination.router, prefix="/api/v1")

# Add comparison router
app.include_router(comparison.router, prefix="/api/v1")

# Add chat router
app.include_router(chat.router, prefix="/api/v1")

# Add strategy router (N25–N31 agent pipeline)
app.include_router(strategy.router, prefix="/api/v1")


# Mount FastMCP server — MCP clients connect via Streamable HTTP at /mcp.
# Security A1 (#224): OFF by default. This is an open tool surface, so it is
# only exposed when an operator sets F1_MCP_ENABLED=true. The chat pipeline
# still reaches the same tools in-process, so a disabled /mcp costs no feature.
if mcp_enabled():
    app.mount("/mcp", mcp_app)
else:
    logger.info("F1_MCP_ENABLED is off — external /mcp endpoint not mounted (chat tools still work in-process).")


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}


@app.get("/health")
def health():
    """Unauthenticated liveness probe (open path — see core/auth.py OPEN_PATHS)."""
    return {"status": "ok"}
