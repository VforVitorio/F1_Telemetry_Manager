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
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
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


class SituationRequest(BaseModel):
    """Request body for the /situation endpoint (N27 overtake + SC probability)."""

    lap_state: Dict[str, Any]


class PitRequest(BaseModel):
    """Request body for the /pit endpoint (N28 stop duration + N16 undercut)."""

    lap_state: Dict[str, Any]


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


# ---------------------------------------------------------------------------
# Typed result models — self-documenting Swagger schemas per agent
# ---------------------------------------------------------------------------


class PaceResult(BaseModel):
    """N25 Pace Agent output."""

    lap_time_pred: float
    delta_vs_prev: float
    delta_vs_median: float
    ci_p10: float
    ci_p90: float
    reasoning: str = ""


class TireResult(BaseModel):
    """N26 Tire Agent output."""

    compound: str
    current_tyre_life: int
    deg_rate: float
    laps_to_cliff_p10: float
    laps_to_cliff_p50: float
    laps_to_cliff_p90: float
    warning_level: str
    reasoning: str = ""


class SituationResult(BaseModel):
    """N27 Race Situation Agent output."""

    overtake_prob: float
    sc_prob_3lap: float
    threat_level: str
    gap_ahead_s: float = 0.0
    pace_delta_s: float = 0.0
    reasoning: str = ""


class PitResult(BaseModel):
    """N28 Pit Strategy Agent output."""

    action: str
    recommended_lap: Optional[int] = None
    compound_recommendation: str = ""
    stop_duration_p05: float = 0.0
    stop_duration_p50: float = 0.0
    stop_duration_p95: float = 0.0
    undercut_prob: Optional[float] = None
    undercut_target: Optional[str] = None
    sc_reactive: bool = False
    reasoning: str = ""


class RadioResult(BaseModel):
    """N29 Radio Agent output."""

    radio_events: list = Field(default_factory=list)
    rcm_events: list = Field(default_factory=list)
    alerts: list = Field(default_factory=list)
    reasoning: str = ""
    corrections: list = Field(default_factory=list)


class RagResult(BaseModel):
    """N30 RAG Agent output."""

    question: str = ""
    answer: str = ""
    articles: List[str] = Field(default_factory=list)
    reasoning: str = ""


class StrategyResponse(BaseModel):
    """Generic envelope returned by every strategy endpoint."""

    agent: str
    result: Dict[str, Any]


# ---------------------------------------------------------------------------
# Structured error helper
# ---------------------------------------------------------------------------


class StrategyError(BaseModel):
    """Structured error payload for strategy endpoints."""

    error: str
    agent: str
    detail: str


def _agent_error(agent: str, exc: Exception, status: int = 500) -> HTTPException:
    """Build a structured error response."""
    return HTTPException(
        status_code=status,
        detail=StrategyError(
            error=type(exc).__name__,
            agent=agent,
            detail=str(exc),
        ).model_dump(),
    )


# ---------------------------------------------------------------------------
# Shared helpers (DRY — extracted to backend.utils)
# ---------------------------------------------------------------------------

from backend.utils.laps_cache import require_laps_df as _require_laps_df  # noqa: E402
from backend.utils.serialization import agent_output_to_dict as _to_dict  # noqa: E402

# ---------------------------------------------------------------------------
# /pace — N25 XGBoost lap-time prediction + bootstrap CI
# ---------------------------------------------------------------------------


@router.post("/pace", response_model=StrategyResponse)
def predict_pace(request: PaceRequest):
    """Run the Pace Agent (N25) for a single lap."""
    try:
        from src.agents.pace_agent import run_pace_agent_from_state

        result = run_pace_agent_from_state(request.lap_state)
        return StrategyResponse(agent="pace", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Pace agent validation error: %s", exc)
        raise _agent_error("pace", exc, status=422)
    except Exception as exc:
        logger.error("Pace agent error: %s", exc, exc_info=True)
        raise _agent_error("pace", exc)


# ---------------------------------------------------------------------------
# /tire — N26 TireDegTCN + MC Dropout cliff estimation
# ---------------------------------------------------------------------------


@router.post("/tire", response_model=StrategyResponse)
def predict_tire(
    request: TireRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the Tire Agent (N26) for a single lap."""
    try:
        from src.agents.tire_agent import run_tire_agent_from_state

        result = run_tire_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="tire", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Tire agent validation error: %s", exc)
        raise _agent_error("tire", exc, status=422)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Tire agent error: %s", exc, exc_info=True)
        raise _agent_error("tire", exc)


# ---------------------------------------------------------------------------
# /situation — N27 LightGBM overtake + SC probability
# ---------------------------------------------------------------------------


@router.post("/situation", response_model=StrategyResponse)
def predict_situation(
    request: SituationRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the Race Situation Agent (N27) for a single lap."""
    try:
        from src.agents.race_situation_agent import run_race_situation_agent_from_state

        result = run_race_situation_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="situation", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Situation agent validation error: %s", exc)
        raise _agent_error("situation", exc, status=422)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Situation agent error: %s", exc, exc_info=True)
        raise _agent_error("situation", exc)


# ---------------------------------------------------------------------------
# /pit — N28 quantile stop duration + N16 undercut predictor
# ---------------------------------------------------------------------------


@router.post("/pit", response_model=StrategyResponse)
def predict_pit(
    request: PitRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the Pit Strategy Agent (N28) for a single lap."""
    try:
        from src.agents.pit_strategy_agent import run_pit_strategy_agent_from_state

        result = run_pit_strategy_agent_from_state(request.lap_state, laps_df)
        return StrategyResponse(agent="pit", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Pit agent validation error: %s", exc)
        raise _agent_error("pit", exc, status=422)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Pit strategy agent error: %s", exc, exc_info=True)
        raise _agent_error("pit", exc)


# ---------------------------------------------------------------------------
# /radio — N29 RoBERTa sentiment + SetFit intent + BERT NER + RCM parser
# ---------------------------------------------------------------------------


@router.post("/radio", response_model=StrategyResponse)
def analyze_radio(
    request: RadioRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the Radio Agent (N29) for a single lap."""
    try:
        from src.agents.radio_agent import (
            RadioMessage,
            RCMEvent,
            run_radio_agent_from_state,
        )

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
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Radio agent validation error: %s", exc)
        raise _agent_error("radio", exc, status=422)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Radio agent error: %s", exc, exc_info=True)
        raise _agent_error("radio", exc)


# ---------------------------------------------------------------------------
# /rag — N30 Qdrant retrieval + LLM synthesis for regulation questions
# ---------------------------------------------------------------------------


@router.post("/rag", response_model=StrategyResponse)
def query_rag(request: RagRequest):
    """Run the RAG Agent (N30) to answer a regulation question."""
    try:
        from src.agents.rag_agent import run_rag_agent

        result = run_rag_agent(request.question)
        return StrategyResponse(agent="rag", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("RAG agent validation error: %s", exc)
        raise _agent_error("rag", exc, status=422)
    except Exception as exc:
        logger.error("RAG agent error: %s", exc, exc_info=True)
        raise _agent_error("rag", exc)


# ---------------------------------------------------------------------------
# /recommend — N31 full orchestrator (all sub-agents + MC simulation + LLM)
# ---------------------------------------------------------------------------


@router.post("/recommend", response_model=StrategyResponse)
def recommend_strategy(
    request: RecommendRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the full Strategy Orchestrator (N31) for a single lap."""
    try:
        from backend.utils.race_state_builder import build_race_state

        from src.agents.strategy_orchestrator import run_strategy_orchestrator_from_state

        race_state = build_race_state(
            request.lap_state,
            gap_ahead_s=request.gap_ahead_s,
            pace_delta_s=request.pace_delta_s,
            risk_tolerance=request.risk_tolerance,
            radio_msgs=request.radio_msgs,
            rcm_events=request.rcm_events,
        )

        result = run_strategy_orchestrator_from_state(
            race_state=race_state,
            laps_df=laps_df,
            lap_state=request.lap_state,
        )
        return StrategyResponse(agent="orchestrator", result=_to_dict(result))
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Orchestrator validation error: %s", exc)
        raise _agent_error("orchestrator", exc, status=422)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Orchestrator error: %s", exc, exc_info=True)
        raise _agent_error("orchestrator", exc)
