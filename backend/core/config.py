import os
from pathlib import Path

from dotenv import load_dotenv

from backend.core.paths import get_repo_root

# Load the repo-root .env, then the submodule-local .env below as an override.
load_dotenv(get_repo_root() / ".env")
# Also load a local .env in src/telemetry/ if it exists (overrides)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")


def _normalize_llm_provider(value: str) -> str:
    return "openai" if value == "openai" else "lmstudio"


def configured_chat_provider() -> str:
    """Read the chat provider, retaining its legacy ``LLM_PROVIDER`` alias."""
    configured = os.getenv("F1_LLM_PROVIDER", os.getenv("LLM_PROVIDER", "lmstudio"))
    return _normalize_llm_provider(configured)


def configured_strategy_provider() -> str:
    """Read the strategy provider; only ``F1_LLM_PROVIDER`` controls agents."""
    return _normalize_llm_provider(os.getenv("F1_LLM_PROVIDER", "lmstudio"))


def resolve_simulation_provider(requested: str | None = None) -> str:
    """Return the process provider and reject per-request provider switching.

    The strategy agents read ``F1_LLM_PROVIDER`` and cache their clients. The
    legacy ``LLM_PROVIDER`` alias remains chat-only and cannot switch agents.
    """
    process_provider = configured_strategy_provider()
    if requested is not None and requested != process_provider:
        raise ValueError(
            f"Requested provider '{requested}' conflicts with backend process provider "
            f"'{process_provider}'. Set F1_LLM_PROVIDER={requested} and restart the backend; "
            "provider switching per request is unsupported."
        )
    return process_provider


def provider_api_urls(provider: str) -> tuple[str, str]:
    """Return the completions and models endpoints for the configured provider.

    ``LM_STUDIO_HOST`` is the shared local-provider setting used by the backend
    and strategy clients. Request data never selects or overrides either URL.
    """
    if provider == "openai":
        base_url = "https://api.openai.com/v1"
    else:
        host = os.getenv("LM_STUDIO_HOST") or "localhost"
        base_url = f"http://{host}:1234/v1"

    base_url = base_url.rstrip("/")
    return f"{base_url}/chat/completions", f"{base_url}/models"


def _env_flag(name: str, *, default: bool) -> bool:
    """Read a boolean env var, accepting ``1/true/yes/on`` (case-insensitive)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def api_key() -> str | None:
    """The shared API secret, or None when unset (auth then passes — see auth.py).

    Read fresh so a test can set/clear it per case and so key rotation takes
    effect without a process restart.
    """
    return os.getenv("F1_API_KEY") or None


def bind_host() -> str:
    """The host uvicorn binds to; the startup guard fails closed on non-loopback.

    The Dockerfile passes ``--host $F1_HOST``, so this value mirrors the real
    bind in the container. Defaults to loopback so a bare ``uvicorn`` run without
    F1_HOST is treated as safe.

    ponytail: this trusts F1_HOST to match the actual --host. A manual
    ``uvicorn --host 0.0.0.0`` with F1_HOST unset would evade the guard — an
    accepted ceiling for a single-user deploy; wire the real bound socket in if
    a multi-host deploy ever needs it.
    """
    return os.getenv("F1_HOST", "127.0.0.1")


def mcp_enabled() -> bool:
    """Whether the external ``/mcp`` Streamable-HTTP endpoint is mounted.

    Security A1 (issue #224): the FastMCP server is a fully open tool surface,
    so it is OFF by default and only mounted when an operator opts in with
    ``F1_MCP_ENABLED=true``. The chat pipeline calls the same tools in-process
    regardless of this flag, so turning it off removes exposure, not features.
    Read fresh (not cached) so a test can toggle it per case.
    """
    return _env_flag("F1_MCP_ENABLED", default=False)


_DEFAULT_CHAT_MAX_TOKENS = 2048


def chat_max_tokens() -> int:
    """Server-side cap on completion tokens per chat turn (cost cap A3, #224).

    A client's requested ``max_tokens`` is clamped down to this at every chat
    boundary, so injected text cannot steer a huge completion. Defaults to 2048 —
    above the internal 800/1000 defaults, so normal use is unaffected and only an
    over-large request is capped. Read fresh so an operator can retune without a
    restart; garbage falls back to the default.
    """
    try:
        value = int(os.getenv("F1_CHAT_MAX_TOKENS", str(_DEFAULT_CHAT_MAX_TOKENS)))
    except ValueError:
        return _DEFAULT_CHAT_MAX_TOKENS
    return max(1, value)


def clamp_max_tokens(requested: int) -> int:
    """Clamp a client-requested ``max_tokens`` down to :func:`chat_max_tokens`."""
    return min(int(requested), chat_max_tokens())
