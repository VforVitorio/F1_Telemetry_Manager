"""
FastMCP Tool Server — Exposes the N25-N31 strategy agents as MCP tools.

Each tool accepts simple scalar parameters (gp, driver, lap, year) so an LLM
can reason about them easily.  Internally every tool builds a canonical
``lap_state`` via the shared helper in ``strategy.py`` and then calls the
agent's ``run_*_from_state`` entry point in-process (no HTTP round-trip).

The server is mounted on the FastAPI app at ``/mcp`` via ``http_app()``
(Streamable HTTP transport, FastMCP 3.x) so external MCP clients
(Claude Desktop, Cursor, etc.) can connect, while the chat pipeline
calls the underlying Python functions directly.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Repo-root injection (same pattern as strategy.py)
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve()
_REPO = _HERE.parent
while not (_REPO / ".git").exists() and _REPO != _REPO.parent:
    _REPO = _REPO.parent
if not (_REPO / ".git").exists():
    _REPO = Path("/app")
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Server instance
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "F1 Strategy Tools",
    instructions=(
        "Tools for real-time F1 race strategy analysis.  Each tool wraps a "
        "production ML agent (XGBoost, LightGBM, TCN, RoBERTa, LLM-RAG).  "
        "Pass a Grand Prix name, driver code, and lap number to get predictions."
    ),
)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_lap_state(gp: str, driver: str, lap: int, year: int = 2025) -> dict[str, Any]:
    """Build a canonical lap_state dict from the featured parquet.

    Delegates to the same logic used by GET /api/v1/strategy/lap-state
    so every tool sees an identical structure.
    """
    from backend.api.v1.endpoints.strategy import get_lap_state
    return get_lap_state(gp=gp, driver=driver, lap=lap, year=year)


def _get_laps_df(year: int = 2025):
    """Return the cached featured DataFrame for the given season."""
    from backend.utils.laps_cache import get_laps_df
    return get_laps_df(year)


def _serialize(obj: Any) -> dict[str, Any]:
    """Convert an agent output (dataclass / dict) to a plain dict."""
    from backend.utils.serialization import agent_output_to_dict
    return agent_output_to_dict(obj)


def _format_result(data: dict[str, Any]) -> str:
    """Pretty-print a result dict as compact JSON for the LLM context."""
    return json.dumps(data, indent=2, default=str, ensure_ascii=False)


# ---------------------------------------------------------------------------
# MCP Tools — Agent wrappers
# ---------------------------------------------------------------------------

@mcp.tool
def predict_pace(gp: str, driver: str, lap: int, year: int = 2025) -> str:
    """Predict lap time for a driver at a specific lap using the N25 XGBoost model.

    Returns predicted lap time, delta vs previous lap, delta vs session
    median, and a 80% confidence interval (P10/P90 via bootstrap).
    """
    from src.agents.pace_agent import run_pace_agent_from_state

    lap_state = _build_lap_state(gp, driver, lap, year)
    result = run_pace_agent_from_state(lap_state)
    return _format_result(_serialize(result))


@mcp.tool
def predict_tire(gp: str, driver: str, lap: int, year: int = 2025) -> str:
    """Analyse tyre degradation and estimate laps to performance cliff.

    Uses the N26 TireDegTCN model with MC Dropout for uncertainty.
    Returns compound, degradation rate, cliff estimates (P10/P50/P90),
    and a warning level (LOW/MEDIUM/HIGH/CRITICAL).
    """
    from src.agents.tire_agent import run_tire_agent_from_state

    lap_state = _build_lap_state(gp, driver, lap, year)
    laps_df = _get_laps_df(year)
    result = run_tire_agent_from_state(lap_state, laps_df)
    return _format_result(_serialize(result))


@mcp.tool
def predict_situation(gp: str, driver: str, lap: int, year: int = 2025) -> str:
    """Estimate overtake probability and safety car likelihood.

    Uses the N27 LightGBM models for overtake (per-pair) and SC (per-lap)
    prediction.  Returns overtake_prob, sc_prob_3lap, threat_level, and
    contextual factors.
    """
    from src.agents.race_situation_agent import run_race_situation_agent_from_state

    lap_state = _build_lap_state(gp, driver, lap, year)
    laps_df = _get_laps_df(year)
    result = run_race_situation_agent_from_state(lap_state, laps_df)
    return _format_result(_serialize(result))


@mcp.tool
def predict_pit(gp: str, driver: str, lap: int, year: int = 2025) -> str:
    """Recommend pit stop strategy — when to pit, which compound, undercut odds.

    Uses N28 HistGBT quantile model for stop duration (P05/P50/P95)
    and N16 LightGBM for undercut success probability.
    """
    from src.agents.pit_strategy_agent import run_pit_strategy_agent_from_state

    lap_state = _build_lap_state(gp, driver, lap, year)
    laps_df = _get_laps_df(year)
    result = run_pit_strategy_agent_from_state(lap_state, laps_df)
    return _format_result(_serialize(result))


@mcp.tool
def analyze_radio(gp: str, driver: str, lap: int, year: int = 2025) -> str:
    """Analyse team radio communications for a driver on a specific lap.

    Runs the N29 NLP pipeline (RoBERTa sentiment, SetFit intent, BERT NER)
    on available radio transcripts and returns alerts, sentiment, and entities.
    """
    from src.agents.radio_agent import RadioMessage, RCMEvent, run_radio_agent_from_state

    base_state = _build_lap_state(gp, driver, lap, year)
    # Mirror the endpoint pattern: merge radio fields into lap_state
    lap_state = {
        **base_state,
        "lap": base_state.get("lap_number", lap),
        "radio_msgs": [],
        "rcm_events": [],
    }
    laps_df = _get_laps_df(year)
    result = run_radio_agent_from_state(lap_state, laps_df)
    return _format_result(_serialize(result))


@mcp.tool
def query_regulations(question: str) -> str:
    """Look up FIA regulations using the RAG knowledge base.

    Searches the Qdrant vector database of FIA sporting/technical regulations
    and synthesises an answer grounded in the retrieved articles.
    """
    from src.agents.rag_agent import run_rag_agent

    result = run_rag_agent(question)
    return _format_result(_serialize(result))


@mcp.tool
def recommend_strategy(
    gp: str,
    driver: str,
    lap: int,
    year: int = 2025,
    risk_tolerance: float = 0.5,
) -> str:
    """Run the full N31 Strategy Orchestrator — calls all sub-agents, runs
    Monte Carlo simulation, and produces a ranked strategy recommendation.

    Returns the recommended action, confidence, scenario scores, and
    per-agent reasoning summaries.
    """
    from backend.utils.race_state_builder import build_race_state
    from src.agents.strategy_orchestrator import run_strategy_orchestrator_from_state

    lap_state = _build_lap_state(gp, driver, lap, year)
    laps_df = _get_laps_df(year)

    # Mirror the /recommend endpoint exactly
    race_state = build_race_state(
        lap_state,
        gap_ahead_s=lap_state.get("driver", {}).get("gap_ahead_s", 2.0),
        pace_delta_s=0.0,
        risk_tolerance=risk_tolerance,
        radio_msgs=None,
        rcm_events=None,
    )

    result = run_strategy_orchestrator_from_state(
        race_state=race_state,
        laps_df=laps_df,
        lap_state=lap_state,
    )
    return _format_result(_serialize(result))


# ---------------------------------------------------------------------------
# MCP Tools — Helper / listing tools
# ---------------------------------------------------------------------------

@mcp.tool
def list_available_gps(year: int = 2025) -> str:
    """List all Grand Prix events available in the data for a given season."""
    from backend.api.v1.endpoints.strategy import available_gps
    return _format_result(available_gps(year))


@mcp.tool
def list_available_drivers(gp: str, year: int = 2025) -> str:
    """List all drivers that participated in a specific Grand Prix."""
    from backend.api.v1.endpoints.strategy import available_drivers
    return _format_result(available_drivers(gp, year))


@mcp.tool
def get_lap_range(gp: str, driver: str, year: int = 2025) -> str:
    """Get the min and max lap numbers available for a driver in a GP."""
    from backend.api.v1.endpoints.strategy import lap_range
    return _format_result(lap_range(gp, driver, year))


# ---------------------------------------------------------------------------
# MCP Tools — Phase 2: Telemetry & Comparison (auto-generated from OpenAPI)
# ---------------------------------------------------------------------------
#
# Phase 1 tools (above) are defined manually because they wrap complex ML
# agents with simplified params (gp, driver, lap) that are easy for the LLM
# to reason about.  The raw FastAPI endpoints accept lap_state dicts, which
# are too complex for direct LLM consumption.
#
# Phase 2 tools cover telemetry and comparison endpoints that already have
# simple query-string params (year, gp, session, driver).  These are
# auto-generated from the FastAPI OpenAPI spec using FastMCP.from_openapi(),
# which reads /openapi.json at startup and converts every GET/POST endpoint
# into an MCP tool — zero manual maintenance.
#
# The auto-generated sub-server is mounted on the main `mcp` instance so
# all tools (Phase 1 manual + Phase 2 auto) are available under one server.

import httpx as _httpx

def _mount_openapi_tools() -> None:
    """Mount auto-generated MCP tools from the FastAPI OpenAPI spec.

    Called lazily on first request to avoid circular imports at module load.
    Fetches /openapi.json from the running backend and converts telemetry +
    comparison endpoints into MCP tools.
    """
    global _openapi_mounted
    if _openapi_mounted:
        return

    try:
        # Fetch the OpenAPI spec from our own backend
        resp = _httpx.get("http://localhost:8000/openapi.json", timeout=5)
        if resp.status_code != 200:
            logger.warning("Could not fetch OpenAPI spec: HTTP %s", resp.status_code)
            return

        spec = resp.json()

        # Filter to only telemetry + comparison paths (skip strategy/chat/auth)
        filtered_paths = {}
        for path, methods in spec.get("paths", {}).items():
            if any(prefix in path for prefix in ["/telemetry/", "/comparison/", "/circuit-domination/"]):
                filtered_paths[path] = methods

        if not filtered_paths:
            logger.info("No telemetry/comparison paths found in OpenAPI spec")
            return

        filtered_spec = {**spec, "paths": filtered_paths}

        client = _httpx.AsyncClient(base_url="http://localhost:8000")
        sub = FastMCP.from_openapi(
            openapi_spec=filtered_spec,
            client=client,
            name="telemetry",
        )

        # Mount the sub-server's tools onto our main mcp instance
        mcp.mount("telemetry", sub)
        logger.info("Mounted %d telemetry/comparison tools from OpenAPI", len(filtered_paths))

    except Exception as exc:
        logger.warning("Failed to mount OpenAPI tools: %s", exc)

    _openapi_mounted = True


_openapi_mounted = False
