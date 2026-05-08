from backend.api.v1.endpoints import circuit_domination, comparison, telemetry, chat, voice, strategy
from backend.core.config import FRONTEND_URL
from backend.mcp_tools import mcp as mcp_server, _mount_openapi_tools
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

# Build the MCP ASGI sub-app (Streamable HTTP, FastMCP 3.x)
mcp_app = mcp_server.http_app(path="/mcp")

app = FastAPI(title="F1 Telemetry API", lifespan=mcp_app.lifespan)

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


@app.on_event("startup")
def _startup_mount_openapi():
    """Mount Phase 2 telemetry tools from OpenAPI spec after server starts."""
    _mount_openapi_tools()


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}
