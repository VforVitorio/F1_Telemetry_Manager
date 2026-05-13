from contextlib import asynccontextmanager

from backend.api.v1.endpoints import circuit_domination, comparison, telemetry, chat, voice, strategy
from backend.core.config import FRONTEND_URL
from backend.mcp_tools import mcp as mcp_server, _mount_openapi_tools
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

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
    async with mcp_app.lifespan(app):
        _mount_openapi_tools(app)
        yield


app = FastAPI(title="F1 Telemetry API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Add telemetry router
app.include_router(telemetry.router, prefix="/api/v1")

# Add circuit domination router
app.include_router(circuit_domination.router, prefix="/api/v1")

# Add comparison router
app.include_router(comparison.router, prefix="/api/v1")

# Add chat router
app.include_router(chat.router, prefix="/api/v1")

# Add voice router
app.include_router(voice.router, prefix="/api/v1/voice", tags=["voice"])

# Add strategy router (N25–N31 agent pipeline)
app.include_router(strategy.router, prefix="/api/v1")


# Mount FastMCP server — MCP clients connect via Streamable HTTP at /mcp
app.mount("/mcp", mcp_app)


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}
