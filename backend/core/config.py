import os
from pathlib import Path

from dotenv import load_dotenv

from backend.core.paths import get_repo_root

# Load the repo-root .env, then the submodule-local .env below as an override.
load_dotenv(get_repo_root() / ".env")
# Also load a local .env in src/telemetry/ if it exists (overrides)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")


def _env_flag(name: str, *, default: bool) -> bool:
    """Read a boolean env var, accepting ``1/true/yes/on`` (case-insensitive)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def mcp_enabled() -> bool:
    """Whether the external ``/mcp`` Streamable-HTTP endpoint is mounted.

    Security A1 (issue #224): the FastMCP server is a fully open tool surface,
    so it is OFF by default and only mounted when an operator opts in with
    ``F1_MCP_ENABLED=true``. The chat pipeline calls the same tools in-process
    regardless of this flag, so turning it off removes exposure, not features.
    Read fresh (not cached) so a test can toggle it per case.
    """
    return _env_flag("F1_MCP_ENABLED", default=False)