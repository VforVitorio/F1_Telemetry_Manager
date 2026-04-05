"""
Strategy API Endpoints

HTTP interface for the N25–N31 multi-agent strategy pipeline.
Each sub-agent and the orchestrator are exposed as individual POST endpoints
so the frontend (and future MCP clients) can call them independently.

Sys-path note: this file resolves the repo root via the .git walker and inserts
it into sys.path so that `src.agents.*` imports work regardless of how the
telemetry backend is started.
"""

import logging
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Repo-root injection — `src/agents/` must be importable from here
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE
while not (_REPO_ROOT / ".git").exists():
    _REPO_ROOT = _REPO_ROOT.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/strategy", tags=["strategy"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class PaceRequest(BaseModel):
    """Request body for the /pace endpoint (N25 XGBoost lap-time prediction)."""
    lap_state: Dict[str, Any]


class TireRequest(BaseModel):
    """Request body for the /tire endpoint (N26 TireDegTCN cliff estimation)."""
    lap_state: Dict[str, Any]
    gp_name: str = ""
    year: int = 2025


class SituationRequest(BaseModel):
    """Request body for the /situation endpoint (N27 overtake + SC probability)."""
    lap_state: Dict[str, Any]
    gp_name: str = ""
    year: int = 2025


class PitRequest(BaseModel):
    """Request body for the /pit endpoint (N28 stop duration + N16 undercut)."""
    lap_state: Dict[str, Any]
    gp_name: str = ""
    year: int = 2025


class RadioRequest(BaseModel):
    """
    Request body for the /radio endpoint (N29 NLP pipeline + RCM parser).

    radio_msgs and rcm_events must be lists of plain dicts matching the
    RadioMessage / RCMEvent field names respectively.
    """
    lap_state: Dict[str, Any]
    radio_msgs: List[Dict[str, Any]] = Field(default_factory=list)
    rcm_events: List[Dict[str, Any]] = Field(default_factory=list)


class RagRequest(BaseModel):
    """Request body for the /rag regulation-lookup endpoint."""
    question: str


class RecommendRequest(BaseModel):
    """
    Request body for the full orchestrator endpoint (/recommend).

    Accepts the raw lap_state dict produced by RaceStateManager.  The
    endpoint derives RaceState from it internally so the caller does not
    need to know the RaceState schema.
    """
    lap_state: Dict[str, Any]
    gp_name: str = ""
    year: int = 2025
    gap_ahead_s: float = 2.0
    pace_delta_s: float = 0.0
    risk_tolerance: float = 0.5
    radio_msgs: Optional[List[Dict[str, Any]]] = None
    rcm_events: Optional[List[Dict[str, Any]]] = None


class StrategyResponse(BaseModel):
    """Generic envelope returned by every strategy endpoint."""
    agent: str
    result: Dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_laps_df_cache: Optional[pd.DataFrame] = None


def _get_laps_df() -> Optional[pd.DataFrame]:
    """Load the featured parquet once and cache it for subsequent requests."""
    global _laps_df_cache
    if _laps_df_cache is not None:
        return _laps_df_cache
    path = _REPO_ROOT / "data" / "processed" / "laps_featured_2025.parquet"
    if not path.exists():
        logger.warning("Featured parquet not found: %s", path)
        return None
    _laps_df_cache = pd.read_parquet(path)
    logger.info("Loaded laps_df: %d rows", len(_laps_df_cache))
    return _laps_df_cache


def _to_dict(obj: Any) -> Dict[str, Any]:
    """Convert a dataclass or Pydantic model to a plain JSON-serialisable dict."""
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    try:
        return obj.model_dump()
    except AttributeError:
        pass
    try:
        return obj.dict()
    except AttributeError:
        pass
    return vars(obj)


def _require_laps_df() -> pd.DataFrame:
    laps_df = _get_laps_df()
    if laps_df is None:
        raise HTTPException(
            status_code=503,
            detail="Featured parquet (data/processed/laps_featured_2025.parquet) not available.",
        )
    return laps_df


# ---------------------------------------------------------------------------
# /pace — N25 XGBoost lap-time prediction + bootstrap CI
# ---------------------------------------------------------------------------

@router.post("/pace", response_model=StrategyResponse)
async def predict_pace(request: PaceRequest):
    """
    Run the Pace Agent (N25) for a single lap.

    Returns predicted lap time, confidence interval (P10/P90), and
    delta vs. session median.
    """
    try:
        from src.agents.pace_agent import run_pace_agent_from_state
        result = run_pace_agent_from_state(request.lap_state)
        return StrategyResponse(agent="pace", result=_to_dict(result))
    except Exception as exc:
        logger.error("Pace agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /tire — N26 TireDegTCN + MC Dropout cliff estimation
# ---------------------------------------------------------------------------

@router.post("/tire", response_model=StrategyResponse)
async def predict_tire(request: TireRequest):
    """
    Run the Tire Agent (N26) for a single lap.

    Returns degradation rate, laps-to-cliff (P10/P50/P90), and warning level.
    """
    try:
        from src.agents.tire_agent import run_tire_agent_from_state
        laps_df = _require_laps_df()
        result = run_tire_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="tire", result=_to_dict(result))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Tire agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /situation — N27 LightGBM overtake + SC probability
# ---------------------------------------------------------------------------

@router.post("/situation", response_model=StrategyResponse)
async def predict_situation(request: SituationRequest):
    """
    Run the Race Situation Agent (N27) for a single lap.

    Returns overtake probability, SC-within-3-laps probability, and
    derived threat level (LOW / MEDIUM / HIGH).
    """
    try:
        from src.agents.race_situation_agent import run_race_situation_agent_from_state
        laps_df = _require_laps_df()
        result = run_race_situation_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="situation", result=_to_dict(result))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Situation agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /pit — N28 quantile stop duration + N16 undercut predictor
# ---------------------------------------------------------------------------

@router.post("/pit", response_model=StrategyResponse)
async def predict_pit(request: PitRequest):
    """
    Run the Pit Strategy Agent (N28) for a single lap.

    Returns recommended action, compound suggestion, stop duration
    quantiles (P05/P50/P95), and undercut success probability.
    """
    try:
        from src.agents.pit_strategy_agent import run_pit_strategy_agent_from_state
        laps_df = _require_laps_df()
        result = run_pit_strategy_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="pit", result=_to_dict(result))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Pit strategy agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /radio — N29 RoBERTa sentiment + SetFit intent + BERT NER + RCM parser
# ---------------------------------------------------------------------------

@router.post("/radio", response_model=StrategyResponse)
async def analyze_radio(request: RadioRequest):
    """
    Run the Radio Agent (N29) for a single lap.

    Expects radio_msgs and rcm_events as lists of plain dicts in the request
    body.  Returns classified radio events, RCM events, and derived alerts.
    """
    try:
        from src.agents.radio_agent import (
            RadioMessage,
            RCMEvent,
            run_radio_agent_from_state,
        )

        laps_df = _require_laps_df()

        # Reconstruct typed objects from raw dicts
        radio_msgs = [RadioMessage(**m) for m in request.radio_msgs]
        rcm_events = [RCMEvent(**e) for e in request.rcm_events]

        lap_state = {
            **request.lap_state,
            "lap": request.lap_state.get("lap_number", 0),
            "radio_msgs": radio_msgs,
            "rcm_events": rcm_events,
        }

        result = run_radio_agent_from_state(lap_state, laps_df)
        return StrategyResponse(agent="radio", result=_to_dict(result))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Radio agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /rag — N30 Qdrant retrieval + LLM synthesis for regulation questions
# ---------------------------------------------------------------------------

@router.post("/rag", response_model=StrategyResponse)
async def query_rag(request: RagRequest):
    """
    Run the RAG Agent (N30) to answer a regulation question.

    Retrieves relevant FIA Sporting Regulation passages from the local
    Qdrant store and synthesises a concise answer via the LangGraph agent.
    Requires LM Studio to be running (LLM synthesis step).
    """
    try:
        from src.agents.rag_agent import run_rag_agent
        result = run_rag_agent(request.question)
        return StrategyResponse(agent="rag", result=_to_dict(result))
    except Exception as exc:
        logger.error("RAG agent error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /recommend — N31 full orchestrator (all sub-agents + MC simulation + LLM)
# ---------------------------------------------------------------------------

@router.post("/recommend", response_model=StrategyResponse)
async def recommend_strategy(request: RecommendRequest):
    """
    Run the full Strategy Orchestrator (N31) for a single lap.

    Calls all five sub-agents, runs Monte-Carlo simulation over the four
    strategy options (STAY_OUT / PIT_NOW / UNDERCUT / OVERCUT), and uses
    LLM synthesis (via LM Studio) to produce a final StrategyRecommendation.

    Requires LM Studio to be running for the LLM synthesis step; the ML
    sub-agents (XGBoost, TireDegTCN, LightGBM) run locally regardless.
    """
    try:
        from src.agents.strategy_orchestrator import (
            RaceState,
            run_strategy_orchestrator_from_state,
        )

        laps_df = _require_laps_df()
        d = request.lap_state.get("driver", {})
        w = request.lap_state.get("weather", {})

        race_state = RaceState(
            driver=d.get("driver", "UNK"),
            lap=request.lap_state.get("lap_number", 1),
            total_laps=request.lap_state.get("session_meta", {}).get("total_laps", 57),
            position=d.get("position", 10),
            compound=d.get("compound", "MEDIUM"),
            tyre_life=d.get("tyre_life", 1),
            gap_ahead_s=request.gap_ahead_s,
            pace_delta_s=request.pace_delta_s,
            air_temp=float(w.get("air_temp", 25.0)),
            track_temp=float(w.get("track_temp", 35.0)),
            rainfall=bool(w.get("rainfall", False)),
            radio_msgs=request.radio_msgs or [],
            rcm_events=request.rcm_events or [],
            risk_tolerance=request.risk_tolerance,
        )

        result = run_strategy_orchestrator_from_state(
            race_state=race_state,
            laps_df=laps_df,
            lap_state=request.lap_state,
        )
        return StrategyResponse(agent="orchestrator", result=_to_dict(result))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Orchestrator error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
