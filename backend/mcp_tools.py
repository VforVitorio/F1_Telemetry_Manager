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

# Country / alias → canonical GP name mapping (matches the GP_Name column
# in the featured parquet, which uses circuit / city names).  An LLM with
# only the schema "Grand Prix name" defaults to the country form
# ("Australia", "Italy", "Bahrain"), so we normalise here before hitting
# the data layer.  Keeping it as one map means every MCP tool — and any
# external MCP client (Claude Desktop, Cursor) — gets the same handling.
_GP_ALIASES: dict[str, str] = {
    # Bahrain
    "bahrain": "Sakhir", "sakhir": "Sakhir",
    "bahrein": "Sakhir", "baréin": "Sakhir", "barein": "Sakhir",
    # Saudi Arabia
    "jeddah": "Jeddah", "saudi": "Jeddah",
    "saudi arabia": "Jeddah", "arabia saudita": "Jeddah",
    "arabia": "Jeddah", "yeda": "Jeddah",
    # Australia
    "australia": "Melbourne", "melbourne": "Melbourne",
    # Japan
    "japan": "Suzuka", "japón": "Suzuka", "japon": "Suzuka",
    "suzuka": "Suzuka",
    # China
    "china": "Shanghai", "shanghai": "Shanghai",
    # Miami
    "miami": "Miami",
    # Imola
    "imola": "Imola", "emilia": "Imola", "emilia romagna": "Imola",
    # Monaco
    "monaco": "Monaco", "mónaco": "Monaco",
    # Canada
    "canada": "Montréal", "canadá": "Montréal",
    "montreal": "Montréal", "montréal": "Montréal",
    # Spain
    "spain": "Barcelona", "españa": "Barcelona", "espana": "Barcelona",
    "barcelona": "Barcelona", "cataluña": "Barcelona", "catalunya": "Barcelona",
    # Austria
    "austria": "Spielberg", "spielberg": "Spielberg",
    "red bull ring": "Spielberg",
    # Britain
    "britain": "Silverstone", "great britain": "Silverstone",
    "gran bretaña": "Silverstone", "gran bretana": "Silverstone",
    "uk": "Silverstone", "reino unido": "Silverstone",
    "silverstone": "Silverstone",
    # Hungary
    "hungary": "Budapest", "hungría": "Budapest", "hungria": "Budapest",
    "budapest": "Budapest",
    # Belgium
    "belgium": "Spa-Francorchamps", "bélgica": "Spa-Francorchamps",
    "belgica": "Spa-Francorchamps", "spa": "Spa-Francorchamps",
    "spa-francorchamps": "Spa-Francorchamps", "francorchamps": "Spa-Francorchamps",
    # Netherlands
    "netherlands": "Zandvoort", "países bajos": "Zandvoort",
    "paises bajos": "Zandvoort", "holanda": "Zandvoort",
    "zandvoort": "Zandvoort",
    # Italy
    "italy": "Monza", "italia": "Monza", "monza": "Monza",
    # Azerbaijan
    "azerbaijan": "Baku", "azerbaiyán": "Baku", "azerbaiyan": "Baku",
    "baku": "Baku", "bakú": "Baku",
    # Singapore
    "singapore": "Marina Bay", "singapur": "Marina Bay",
    "marina bay": "Marina Bay",
    # United States
    "united states": "Austin", "austin": "Austin",
    "cota": "Austin", "estados unidos": "Austin", "usa": "Austin",
    "us gp": "Austin",
    # Mexico
    "mexico": "Mexico City", "méxico": "Mexico City",
    "mexico city": "Mexico City", "ciudad de méxico": "Mexico City",
    # Brazil
    "brazil": "São Paulo", "brasil": "São Paulo",
    "interlagos": "São Paulo",
    "sao paulo": "São Paulo", "são paulo": "São Paulo",
    # Las Vegas
    "las vegas": "Las Vegas", "vegas": "Las Vegas",
    # Qatar
    "qatar": "Lusail", "lusail": "Lusail", "catar": "Lusail",
    # Abu Dhabi
    "abu dhabi": "Yas Island", "yas marina": "Yas Island",
    "yas island": "Yas Island", "uae": "Yas Island",
}


def _normalize_gp_name(gp: str) -> str:
    """Map a free-form GP name (country / alias) to its canonical city form.

    Returns the input unchanged when no alias matches — the parquet still
    uses the canonical names directly, so a perfect match passes through.
    Longer aliases (``red bull ring``, ``marina bay``) are checked first
    so they win over single-word fragments.
    """
    if not gp:
        return gp
    lower = gp.strip().lower()
    if lower in _GP_ALIASES:
        return _GP_ALIASES[lower]
    for alias in sorted(_GP_ALIASES, key=len, reverse=True):
        if alias in lower:
            return _GP_ALIASES[alias]
    return gp


# 3-letter driver codes for the 2023-2025 grids — matches the Driver
# column in the featured parquet, which is the only form the agents
# expect.
_DRIVER_CODES: set[str] = {
    "VER", "PER", "LEC", "SAI", "HAM", "RUS", "ANT", "NOR", "PIA",
    "ALO", "STR", "GAS", "OCO", "DOO", "COL", "ALB", "SAR", "TSU",
    "RIC", "LAW", "HAD", "BOT", "ZHO", "HUL", "BOR", "MAG", "BEA",
}

# Surname (lowercase, no diacritics) → 3-letter code.  Lets an LLM that
# defaults to natural names ("Verstappen", "Max Verstappen", "leclerc")
# still hit the agents without us forcing it to memorise codes.
_DRIVER_SURNAMES: dict[str, str] = {
    "verstappen": "VER", "perez": "PER", "leclerc": "LEC", "sainz": "SAI",
    "hamilton": "HAM", "russell": "RUS", "antonelli": "ANT", "norris": "NOR",
    "piastri": "PIA", "alonso": "ALO", "stroll": "STR", "gasly": "GAS",
    "ocon": "OCO", "doohan": "DOO", "colapinto": "COL", "albon": "ALB",
    "sargeant": "SAR", "tsunoda": "TSU", "ricciardo": "RIC", "lawson": "LAW",
    "hadjar": "HAD", "bottas": "BOT", "zhou": "ZHO", "hulkenberg": "HUL",
    "bortoleto": "BOR", "magnussen": "MAG", "bearman": "BEA",
}


def _normalize_driver_code(driver: str) -> str:
    """Map a free-form driver name to its canonical 3-letter code.

    Accepts 3-letter codes ("VER", "ver"), surnames ("Verstappen",
    "leclerc") and full names ("Max Verstappen") — the LLM doesn't have
    to remember the F1 abbreviation system.  Falls back to the input as
    given so the data layer still surfaces an honest "driver not found"
    when the user truly typed something unrecognisable.
    """
    if not driver:
        return driver
    raw = str(driver).strip()
    upper = raw.upper()
    if upper in _DRIVER_CODES:
        return upper
    lower = raw.lower()
    if lower in _DRIVER_SURNAMES:
        return _DRIVER_SURNAMES[lower]
    for token in lower.split():
        if token in _DRIVER_SURNAMES:
            return _DRIVER_SURNAMES[token]
    if len(upper) >= 3 and upper[:3] in _DRIVER_CODES:
        return upper[:3]
    return raw


def _normalize_year(year: Any) -> int:
    """Coerce year to int, defaulting to 2025 when the value is unparseable.

    The LLM occasionally emits ``"2024"`` (string) instead of ``2024``
    even though the schema says integer; coercing here keeps the agents
    from blowing up on the type mismatch.
    """
    try:
        return int(year)
    except (TypeError, ValueError):
        return 2025


def _normalize_lap(lap: Any) -> int:
    """Coerce lap to int, defaulting to 1 on garbage input.

    Range validation lives in the agents (they know how many laps a
    particular GP has); we only protect against ``"25"`` arriving as a
    string instead of an int.
    """
    try:
        return int(lap)
    except (TypeError, ValueError):
        return 1


def _normalize_risk_tolerance(risk: Any) -> float:
    """Coerce risk tolerance to a float in [0.0, 1.0].

    The orchestrator's scenario weighting reads this directly so a value
    outside the unit interval would silently bias the recommendation.
    """
    try:
        value = float(risk)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, value))


def _build_lap_state(gp: str, driver: str, lap: int, year: int = 2025) -> dict[str, Any]:
    """Build a canonical lap_state dict from the featured parquet.

    Delegates to the same logic used by GET /api/v1/strategy/lap-state
    so every tool sees an identical structure.  All four parameters are
    normalised here so every Phase 1 tool (predict_pace / predict_tire /
    predict_situation / predict_pit / analyze_radio / recommend_strategy)
    benefits without having to remember the conversion at the call site.
    """
    from backend.api.v1.endpoints.strategy import get_lap_state
    return get_lap_state(
        gp=_normalize_gp_name(gp),
        driver=_normalize_driver_code(driver),
        lap=_normalize_lap(lap),
        year=_normalize_year(year),
    )


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

    year = _normalize_year(year)
    lap_state = _build_lap_state(gp, driver, lap, year)
    laps_df = _get_laps_df(year)

    # Mirror the /recommend endpoint exactly
    race_state = build_race_state(
        lap_state,
        gap_ahead_s=lap_state.get("driver", {}).get("gap_ahead_s", 2.0),
        pace_delta_s=0.0,
        risk_tolerance=_normalize_risk_tolerance(risk_tolerance),
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
    return _format_result(available_gps(_normalize_year(year)))


@mcp.tool
def list_available_drivers(gp: str, year: int = 2025) -> str:
    """List all drivers that participated in a specific Grand Prix."""
    from backend.api.v1.endpoints.strategy import available_drivers
    return _format_result(
        available_drivers(_normalize_gp_name(gp), _normalize_year(year))
    )


@mcp.tool
def get_lap_range(gp: str, driver: str, year: int = 2025) -> str:
    """Get the min and max lap numbers available for a driver in a GP."""
    from backend.api.v1.endpoints.strategy import lap_range
    return _format_result(
        lap_range(
            _normalize_gp_name(gp),
            _normalize_driver_code(driver),
            _normalize_year(year),
        )
    )


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
