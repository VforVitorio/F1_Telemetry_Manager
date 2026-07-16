"""
Strategy API Endpoints

HTTP interface for the N25–N31 multi-agent strategy pipeline.
Each sub-agent and the orchestrator are exposed as individual POST endpoints
so the frontend (and future MCP clients) can call them independently.

Sys-path note: this file resolves the repo root via the .git walker and inserts
it into sys.path so that `src.agents.*` imports work regardless of how the
telemetry backend is started.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Repo-root injection — `src/agents/` must be importable from here
# ---------------------------------------------------------------------------
from backend.core.paths import get_data_root, get_repo_root
from backend.core.rate_limit import rate_limit

_REPO_ROOT = get_repo_root()
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


class PaceRangeRequest(BaseModel):
    """Batch pace predictions across a lap range."""

    year: int = 2025
    gp: str
    driver: str
    lap_start: int
    lap_end: int


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

from backend.utils.laps_cache import get_laps_df  # noqa: E402
from backend.utils.laps_cache import require_laps_df as _require_laps_df  # noqa: E402
from backend.utils.serialization import agent_output_to_dict as _to_dict  # noqa: E402

# ---------------------------------------------------------------------------
# Helper GET endpoints — parquet metadata for frontend selectors
# ---------------------------------------------------------------------------


@router.get("/available-gps")
def available_gps(year: int = 2025):
    """Return the list of GP names available in the featured parquet."""
    df = get_laps_df(year)
    if df is None:
        return {"gps": []}
    return {"gps": sorted(df["GP_Name"].dropna().unique().tolist())}


@router.get("/available-drivers")
def available_drivers(gp: str, year: int = 2025):
    """Return driver codes for a specific GP in the featured parquet."""
    df = get_laps_df(year)
    if df is None:
        return {"drivers": []}
    subset = df[df["GP_Name"] == gp]
    return {"drivers": sorted(subset["Driver"].dropna().unique().tolist())}


@router.get("/lap-range")
def lap_range(gp: str, driver: str, year: int = 2025):
    """Return the min/max lap numbers for a driver in a GP."""
    df = get_laps_df(year)
    if df is None:
        return {"min_lap": 1, "max_lap": 1}
    subset = df[(df["GP_Name"] == gp) & (df["Driver"] == driver)]
    if subset.empty:
        return {"min_lap": 1, "max_lap": 1}
    return {
        "min_lap": int(subset["LapNumber"].min()),
        "max_lap": int(subset["LapNumber"].max()),
    }


# ---------------------------------------------------------------------------
# Raw per-race fallback — Safety Car / pit / out laps
# ---------------------------------------------------------------------------
# The featured parquet (get_laps_df) drops Safety-Car / pit / out laps PER
# DRIVER because the ML models were not trained on them. The arcade replay,
# by contrast, reads the RAW per-race parquet (data/raw/<year>/<location>/
# laps.parquet), which keeps EVERY lap, so it can run strategy on any lap. To
# reach arcade parity, /lap-state falls back to this raw source when the
# featured parquet is missing the requested lap. The raw parquet already
# carries every column the lap_state builder reads except the pre-converted
# second columns, so we derive LapTime_s / Sector*_s and tag GP_Name, then feed
# it through the SAME builder — the returned lap_state is byte-identical in
# shape to the featured path.

_RACE_LAPS_CACHE: Dict[tuple, Optional[pd.DataFrame]] = {}


def _resolve_race_dir(year: int, gp: str) -> Path:
    """Map a featured GP_Name to its data/raw/<year>/<location> folder.

    Mirrors the arcade's resolver: GP_TO_LOCATION covers the country->circuit
    aliases (Qatar->Lusail, Miami->Miami_Gardens); the underscore variant covers
    the FastF1 space-vs-underscore mismatch (Las Vegas->Las_Vegas). Falls back to
    the primary candidate so the caller's "not found" message stays clean.
    """
    from src.arcade.config import GP_TO_LOCATION

    base = _REPO_ROOT / "data" / "raw" / str(year)
    folder = GP_TO_LOCATION.get(gp, gp)
    candidate = base / folder
    if candidate.exists():
        return candidate
    return base / folder.replace(" ", "_")


def _get_race_laps_df(year: int, gp: str) -> Optional[pd.DataFrame]:
    """Load the RAW per-race laps parquet, normalised to the featured schema.

    Returns None when the race folder or parquet is absent. Cached per
    (year, gp) since the file never changes within a process. The derived
    *_s columns and GP_Name tag are exactly the fields the featured parquet
    pre-computes, so a raw row is interchangeable with a featured row in the
    lap_state builder.
    """
    key = (year, gp)
    if key in _RACE_LAPS_CACHE:
        return _RACE_LAPS_CACHE[key]

    path = _resolve_race_dir(year, gp) / "laps.parquet"
    if not path.exists():
        logger.warning("Raw race parquet not found: %s", path)
        _RACE_LAPS_CACHE[key] = None
        return None

    df = pd.read_parquet(path)
    df["LapTime_s"] = pd.to_timedelta(df["LapTime"]).dt.total_seconds()
    for src_col, dst_col in (
        ("Sector1Time", "Sector1_s"),
        ("Sector2Time", "Sector2_s"),
        ("Sector3Time", "Sector3_s"),
    ):
        df[dst_col] = pd.to_timedelta(df[src_col]).dt.total_seconds()
    df["GP_Name"] = gp

    _RACE_LAPS_CACHE[key] = df
    logger.info("Loaded raw race laps %s %d: %d rows", gp, year, len(df))
    return df


@router.get("/lap-state")
def get_lap_state(
    gp: str,
    driver: str,
    lap: int,
    year: int = 2025,
):
    """Build the canonical lap_state dict for one (gp, driver, lap).

    Reads the featured parquet first; when that lap was dropped from it
    (Safety Car / pit / out lap), falls back to the raw per-race parquet so any
    lap is runnable, exactly like the arcade replay. The returned structure
    matches RaceStateManager.get_lap_state() either way, so it can be passed
    directly to any agent endpoint.
    """
    from fastapi import HTTPException as _HTTPExc

    def _lap_row(frame: Optional[pd.DataFrame]):
        """The driver's row for this lap in *frame*, or None when unavailable."""
        if frame is None:
            return None
        return frame[(frame["Driver"] == driver) & (frame["LapNumber"] == lap)]

    df = get_laps_df(year)
    gp_df = df[df["GP_Name"] == gp] if df is not None else None
    row = _lap_row(gp_df)

    if row is None or row.empty:
        full = _get_race_laps_df(year, gp)
        if full is not None:
            gp_df = full
            row = _lap_row(gp_df)

    if gp_df is None:
        raise _HTTPExc(503, detail=f"No data source for {gp} {year}")
    if row is None or row.empty:
        raise _HTTPExc(404, detail=f"No data for {driver} lap {lap} at {gp}")

    r = row.iloc[0]

    def _safe(val):
        """Convert numpy types to Python native; NaN → 0."""
        if pd.isna(val):
            return 0
        try:
            return val.item()
        except AttributeError:
            return val

    # Compute cumulative lap times per driver up to this lap for real gaps
    laps_up_to = gp_df[gp_df["LapNumber"] <= lap].copy()
    cum_times = (
        laps_up_to.sort_values(["Driver", "LapNumber"])
        .groupby("Driver")["LapTime_s"]
        .sum()
    )
    driver_cum = cum_times.get(driver, 0.0)

    # Build position-sorted list for gap computation at this lap
    lap_snapshot = gp_df[gp_df["LapNumber"] == lap].copy()
    lap_snapshot["_cum"] = lap_snapshot["Driver"].map(cum_times)
    lap_snapshot = lap_snapshot.sort_values("Position")

    drv_pos = int(_safe(r.get("Position", 0)))
    gap_ahead_s = 0.0
    if drv_pos > 1:
        car_ahead = lap_snapshot[lap_snapshot["Position"] == drv_pos - 1]
        if not car_ahead.empty:
            gap_ahead_s = abs(float(driver_cum - car_ahead.iloc[0]["_cum"]))

    driver_dict = {
        "driver": str(r.get("Driver", "")),
        "team": str(r.get("Team", "")),
        "lap_number": int(_safe(r.get("LapNumber", lap))),
        "lap_time_s": float(_safe(r.get("LapTime_s", 0))),
        "position": drv_pos,
        "compound": str(r.get("Compound", "")),
        "compound_id": int(_safe(r.get("CompoundID", 0))),
        "tyre_life": int(_safe(r.get("TyreLife", 0))),
        "stint": int(_safe(r.get("Stint", 1))),
        "stint_baseline_tyre_life": _stint_baseline_tyre_life(
            gp_df, driver, r.get("Stint"),
        ),
        "fresh_tyre": bool(r.get("FreshTyre", False)),
        "speed_i1": float(_safe(r.get("SpeedI1", 0))),
        "speed_i2": float(_safe(r.get("SpeedI2", 0))),
        "speed_fl": float(_safe(r.get("SpeedFL", 0))),
        "speed_st": float(_safe(r.get("SpeedST", 0))),
        "fuel_load": float(_safe(r.get("FuelLoad", 0))),
        "driver_number": int(_safe(r.get("DriverNumber", 0))),
        "sector1_s": float(_safe(r.get("Sector1_s", 0))),
        "sector2_s": float(_safe(r.get("Sector2_s", 0))),
        "sector3_s": float(_safe(r.get("Sector3_s", 0))),
        "gap_ahead_s": round(gap_ahead_s, 3),
    }

    # Rivals: every other driver still CLASSIFIED on this lap, with real gaps.
    #
    # The null-Position filter is load-bearing, and it fixes two bugs at once
    # (#428, #430). A crashed or retired car keeps a row on the lap it went out but
    # its Position is NaN. Feeding that through `_safe` coerced it to 0, and 0 is a
    # real, searchable key: the pit and situation agents look for the car ahead with
    # `position == driver_pos - 1`, which for the RACE LEADER is exactly 0. So the
    # leader's "car ahead" became, by arithmetic, whichever car had just crashed —
    # the single most absurd car to undercut. Dropping position-less cars here means
    # they are neither targeted nor counted, and no sentinel can collide with a real
    # position. This is what `RaceStateManager` already does (it preserves NaN as
    # None and retired cars fall out naturally); the API path just has to match it.
    rivals_df = lap_snapshot[
        (lap_snapshot["Driver"] != driver) & (lap_snapshot["Position"].notna())
    ]
    rivals = []
    for _, rr in rivals_df.iterrows():
        rival_pos = int(rr["Position"])
        rival_gap = 0.0
        if rival_pos > 1:
            ahead = lap_snapshot[lap_snapshot["Position"] == rival_pos - 1]
            if not ahead.empty:
                rival_gap = abs(float(rr["_cum"] - ahead.iloc[0]["_cum"]))
        rivals.append({
            "driver": str(rr.get("Driver", "")),
            "team": str(rr.get("Team", "")),
            "position": rival_pos,
            "lap_time_s": float(_safe(rr.get("LapTime_s", 0))),
            "compound": str(rr.get("Compound", "")),
            "tyre_life": int(_safe(rr.get("TyreLife", 0))),
            "gap_ahead_s": round(rival_gap, 3),
        })

    weather = {
        "air_temp": float(_safe(r.get("AirTemp", 25))),
        "track_temp": float(_safe(r.get("TrackTemp", 40))),
        "humidity": float(_safe(r.get("Humidity", 50))),
        "rainfall": int(_safe(r.get("Rainfall", 0))),
    }

    total_laps = int(gp_df["LapNumber"].max())

    return {
        "lap_number": int(lap),
        "driver": driver_dict,
        "rivals": rivals,
        "weather": weather,
        "session_meta": {
            "gp_name": gp,
            "year": year,
            "driver": driver,
            "team": driver_dict["team"],
            "total_laps": total_laps,
        },
    }

# ---------------------------------------------------------------------------
# /pace — N25 XGBoost lap-time prediction + bootstrap CI
# ---------------------------------------------------------------------------


@router.post("/pace", response_model=StrategyResponse, dependencies=[Depends(rate_limit("pace", capacity=20, per_minute=60))])
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
# /pace-range — batch pace predictions for a lap range (Model Lab chart)
# ---------------------------------------------------------------------------


@router.post("/pace-range", dependencies=[Depends(rate_limit("pace-range", capacity=5, per_minute=10))])
def predict_pace_range(request: PaceRangeRequest):
    """Run Pace Agent across a lap range and return actual vs predicted."""
    import numpy as np

    from src.agents.pace_agent import run_pace_agent_from_state

    df = get_laps_df(request.year)
    if df is None:
        raise HTTPException(503, detail=f"No parquet for {request.year}")

    gp_df = df[df["GP_Name"] == request.gp]
    if gp_df.empty:
        raise HTTPException(404, detail=f"GP '{request.gp}' not found")

    drv_df = gp_df[gp_df["Driver"] == request.driver].sort_values("LapNumber")
    if drv_df.empty:
        raise HTTPException(404, detail=f"Driver '{request.driver}' not found")

    drv_df = drv_df[
        (drv_df["LapNumber"] >= request.lap_start)
        & (drv_df["LapNumber"] <= request.lap_end)
    ]

    total_laps = int(gp_df["LapNumber"].max())
    results = []

    for _, row in drv_df.iterrows():
        lap_num = int(row["LapNumber"])
        actual = float(row["LapTime_s"]) if not pd.isna(row.get("LapTime_s")) else None

        # Skip laps without a valid previous lap time (lap 1 of each stint)
        prev_lt = row.get("Prev_LapTime")
        if pd.isna(prev_lt) or (prev_lt is not None and prev_lt < 60):
            results.append({
                "lap": lap_num, "actual": actual,
                "pred": None, "ci_p10": None, "ci_p90": None,
                "compound": str(row.get("Compound", "")),
                "stint": int(row.get("Stint", 1)),
            })
            continue

        # Build a minimal lap_state for this row
        lap_state = _build_lap_state_from_row(row, gp_df, request.gp, request.year, total_laps)

        try:
            out = run_pace_agent_from_state(lap_state)
            results.append({
                "lap": lap_num, "actual": actual,
                "pred": out.lap_time_pred, "ci_p10": out.ci_p10, "ci_p90": out.ci_p90,
                "compound": str(row.get("Compound", "")),
                "stint": int(row.get("Stint", 1)),
            })
        except Exception:
            results.append({
                "lap": lap_num, "actual": actual,
                "pred": None, "ci_p10": None, "ci_p90": None,
                "compound": str(row.get("Compound", "")),
                "stint": int(row.get("Stint", 1)),
            })

    return {"predictions": results, "count": len(results)}


def _stint_baseline_tyre_life(gp_df, driver: str, stint) -> Optional[int]:
    """TyreLife at the first lap of `driver`'s `stint`, or None if unresolvable.

    N06 trains `FuelEffect` as `(TyreLife - min(TyreLife of the stint)) * 0.055`, but
    `run_pace_agent_from_state` receives only the lap_state — it has no laps frame to
    take a minimum from. So the baseline has to travel INSIDE the lap_state, and the
    producers (which do hold the frame) are the ones that can compute it (#446).

    Returns None rather than a guess when the stint or its TyreLife is unresolvable; the
    agent then emits NaN plus a warning, which XGBoost handles natively (the training
    parquet itself carries 2% null FuelEffect) and which nobody can mistake for a reading.

    Caveat worth knowing: on the FEATURED frame the stint's opening laps are often the
    out-laps that N04's IsAccurate filter drops, so the minimum can sit 1-2 laps late and
    understate FuelEffect by <= ~0.11 s. Bounded, conservative, and 40x smaller than the
    bug it replaces. The raw-parquet fallback path sees the full stint and is exact.
    """
    if stint is None or pd.isna(stint):
        return None
    rows = gp_df[(gp_df["Driver"] == driver) & (gp_df["Stint"] == stint)]
    tyre_life = rows["TyreLife"].dropna() if "TyreLife" in rows.columns else None
    if tyre_life is None or tyre_life.empty:
        return None
    return int(tyre_life.min())


def _build_lap_state_from_row(row, gp_df, gp: str, year: int, total_laps: int) -> dict:
    """Build the canonical lap_state dict from a single parquet row."""
    def _s(val, default=0):
        if pd.isna(val):
            return default
        try:
            return val.item()
        except AttributeError:
            return val

    lap = int(row["LapNumber"])
    return {
        "lap_number": lap,
        "driver": {
            "driver": str(row.get("Driver", "")),
            "team": str(row.get("Team", "")),
            "lap_number": lap,
            "lap_time_s": float(_s(row.get("LapTime_s", 0))),
            "position": int(_s(row.get("Position", 10))),
            "compound": str(row.get("Compound", "")),
            "compound_id": int(_s(row.get("CompoundID", 0))),
            "tyre_life": int(_s(row.get("TyreLife", 0))),
            "stint": int(_s(row.get("Stint", 1))),
            "stint_baseline_tyre_life": _stint_baseline_tyre_life(
                gp_df, str(row.get("Driver", "")), row.get("Stint"),
            ),
            "fresh_tyre": bool(row.get("FreshTyre", False)),
            "speed_i1": float(_s(row.get("SpeedI1", 0))),
            "speed_i2": float(_s(row.get("SpeedI2", 0))),
            "speed_fl": float(_s(row.get("SpeedFL", 0))),
            "speed_st": float(_s(row.get("SpeedST", 0))),
            "fuel_load": float(_s(row.get("FuelLoad", 0))),
            "driver_number": int(_s(row.get("DriverNumber", 0))),
            "sector1_s": float(_s(row.get("Sector1_s", 0))),
            "sector2_s": float(_s(row.get("Sector2_s", 0))),
            "sector3_s": float(_s(row.get("Sector3_s", 0))),
        },
        "rivals": [],
        "weather": {
            "air_temp": float(_s(row.get("AirTemp", 25))),
            "track_temp": float(_s(row.get("TrackTemp", 40))),
            "humidity": float(_s(row.get("Humidity", 50))),
            "rainfall": int(_s(row.get("Rainfall", 0))),
        },
        "session_meta": {
            "gp_name": gp, "year": year,
            "driver": str(row.get("Driver", "")),
            "team": str(row.get("Team", "")),
            "total_laps": total_laps,
        },
    }


# ---------------------------------------------------------------------------
# /tire-range — TCN degradation across a lap range (Tyres agent-tab chart)
# ---------------------------------------------------------------------------


@router.post("/tire-range", dependencies=[Depends(rate_limit("tire-range", capacity=5, per_minute=10))])
def predict_tire_range(
    request: PaceRangeRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the TireDegTCN across a lap range for the Tyres agent-tab chart.

    Returns, per lap in the window, the ACTUAL cumulative fuel-adjusted degradation
    (the parquet's `FuelAdjustedDegAbsolute`, i.e. the TCN's own training target)
    and the model's PREDICTED value (a deterministic forward pass over the stint up
    to that lap). Laps the featured parquet dropped (Safety Car / out laps) are
    simply absent from the series, so the lines break there rather than erroring.

    The tire agent is set up once (its `laps_df`/`session_meta`), then only the
    cheap deterministic predict path runs per lap — no per-lap MC Dropout.
    """
    import torch

    from src.agents.tire_agent import _compound_name_to_id, _get_default_tire_agent

    df = get_laps_df(request.year)
    if df is None:
        raise HTTPException(503, detail=f"No parquet for {request.year}")
    gp_df = df[df["GP_Name"] == request.gp]
    if gp_df.empty:
        raise HTTPException(404, detail=f"GP '{request.gp}' not found")
    drv_df = gp_df[gp_df["Driver"] == request.driver].sort_values("LapNumber")
    if drv_df.empty:
        raise HTTPException(404, detail=f"Driver '{request.driver}' not found")
    drv_df = drv_df[
        (drv_df["LapNumber"] >= request.lap_start) & (drv_df["LapNumber"] <= request.lap_end)
    ]

    total_laps = int(gp_df["LapNumber"].max())
    agent = _get_default_tire_agent()

    # Set the agent up ONCE, directly (NO run_from_state → no LLM): fill laps_df +
    # session_meta exactly as run_from_state's setup does, then only the cheap
    # deterministic TCN forward runs per lap. Running the full agent per lap would
    # invoke the LLM (slow) and leaves the model in MC-train mode, which corrupts
    # the eval-mode prediction scale — the manual setup keeps the forward clean.
    team = str(drv_df.iloc[0].get("Team", "")) if not drv_df.empty else ""
    agent.laps_df = laps_df.copy()
    lt_col = "LapTime_s" if "LapTime_s" in laps_df.columns else "LapTime"
    lap_times = pd.to_numeric(laps_df[lt_col], errors="coerce").dropna()
    if "TrackStatus" in laps_df.columns:
        clean_mask = laps_df["TrackStatus"].astype(str) == "1"
        clean_times = lap_times[clean_mask] if clean_mask.sum() > 0 else lap_times
    else:
        clean_times = lap_times
    agent.session_meta = {
        "fastest_lap_s": float(clean_times.min()) if len(clean_times) > 0 else 90.0,
        "cluster_mean_lap_s": float(clean_times.mean()) if len(clean_times) > 0 else 90.0,
        "total_laps": total_laps,
        "cluster_id": agent.cfg.circuit_cluster_map.get(request.gp, 0),
        "team_id": agent.cfg.team_id_map.get(team, 4),
        "year": request.year,
        "AirTemp": 28.0,
        "TrackTemp": 38.0,
        "Humidity": 50.0,
        "Rainfall": 0.0,
    }

    results = []
    for _, row in drv_df.iterrows():
        lap = int(row["LapNumber"])
        compound = str(row.get("Compound", ""))
        tyre_life = int(row["TyreLife"]) if not pd.isna(row.get("TyreLife")) else 0
        actual = (
            float(row["FuelAdjustedDegAbsolute"])
            if "FuelAdjustedDegAbsolute" in row.index
            and not pd.isna(row.get("FuelAdjustedDegAbsolute"))
            else None
        )

        pred = None
        try:
            compound_id = (
                compound
                if compound.startswith("C")
                else _compound_name_to_id(compound, request.gp, request.year)
            )
            stint = agent._get_driver_stint(request.driver, tyre_life)
            if stint is not None and compound_id in agent.bundles:
                tensor = agent._build_stint_tensor(stint, compound_id, agent.session_meta)
                model = agent.bundles[compound_id]["model"]
                with torch.no_grad():
                    model.eval()
                    pred = float(model(tensor).item())
        except Exception as exc:  # noqa: BLE001 — a bad lap just leaves a gap, never a 500
            logger.debug("tire-range: skipping lap %s (%s)", lap, exc)
            pred = None

        results.append(
            {
                "lap": lap,
                "actual": actual,
                "pred": pred,
                "compound": compound,
                "tyre_life": tyre_life,
            }
        )

    return {"predictions": results, "count": len(results)}


# ---------------------------------------------------------------------------
# /tire — N26 TireDegTCN + MC Dropout cliff estimation
# ---------------------------------------------------------------------------


@router.post("/tire", response_model=StrategyResponse, dependencies=[Depends(rate_limit("tire", capacity=20, per_minute=60))])
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


@router.post("/situation", response_model=StrategyResponse, dependencies=[Depends(rate_limit("situation", capacity=20, per_minute=60))])
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


@router.post("/pit", response_model=StrategyResponse, dependencies=[Depends(rate_limit("pit", capacity=20, per_minute=60))])
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


@router.post("/radio", response_model=StrategyResponse, dependencies=[Depends(rate_limit("radio", capacity=20, per_minute=60))])
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


@router.post("/rag", response_model=StrategyResponse, dependencies=[Depends(rate_limit("rag", capacity=5, per_minute=10))])
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
# Safety-Car context — RCM events for the analysed lap
# ---------------------------------------------------------------------------
# The orchestrator only recommends PIT_NOW under a Safety Car when the
# SAFETY_CAR_DEPLOYED race-control message reaches the Race Situation agent (N27),
# which then flips sc_currently_active -> forces sc_prob_3lap=1.0 -> routes the pit
# + RAG agents (RCMContextResolver, thesis 6.3). A "SAFETY CAR DEPLOYED" message is
# a one-shot row at the deploy lap, so a single-lap run several laps into the
# neutralisation would miss it. This mirrors the arcade/CLI exactly: replay every
# lap's RCM window in order through a stateful RaceControlStateTracker and re-assert
# (inject a synthetic event) on laps that carry no fresh message. RCM only — no
# Whisper / radio transcription (disable_transcription keeps it out of the request
# path; radio_msgs, which feed only N29, stay empty as before).

_RADIO_RUNNER_CACHE: Dict[tuple, Any] = {}


def _get_radio_runner(year: int, gp: str, laps_df: pd.DataFrame):
    """A transcription-disabled RadioPipelineRunner for (year, gp), or None.

    Cached per (year, gp). `disable_transcription` keeps Whisper out of the
    request path — only the pre-parsed rcm.parquet is needed for the SC override.
    A missing corpus degrades to None (no RCM), never an error.
    """
    key = (year, gp)
    if key in _RADIO_RUNNER_CACHE:
        return _RADIO_RUNNER_CACHE[key]
    runner = None
    try:
        from src.nlp.radio_runner import RadioPipelineRunner

        runner = RadioPipelineRunner(
            year=year,
            gp_name=gp,
            laps_df=laps_df,
            data_root=get_data_root(),
            disable_transcription=True,
        )
    except Exception as exc:  # noqa: BLE001 - corpus is optional; degrade to no RCM
        logger.warning("Radio/RCM corpus unavailable for %s %d: %s", gp, year, exc)
    _RADIO_RUNNER_CACHE[key] = runner
    return runner


def _rcm_events_for_lap(year: int, gp: str, laps_df: pd.DataFrame, lap: int) -> List[Dict[str, Any]]:
    """RCM events active at *lap*, replaying the stateful SC tracker from lap 1.

    Returns the lap's own RCM rows plus a synthetic SAFETY CAR DEPLOYED when a
    neutralisation is still in force but this lap carried no fresh message
    (mirrors ``src/arcade/strategy.py``). Empty list when the corpus is missing.
    """
    runner = _get_radio_runner(year, gp, laps_df)
    if runner is None:
        return []
    from src.nlp.rcm_state import RaceControlStateTracker

    tracker = RaceControlStateTracker()
    rcm_at_lap: List[Dict[str, Any]] = []
    for n in range(1, lap + 1):
        _radios, rcm = runner.radios_for_lap(n)
        tracker.ingest(n, rcm)
        if n == lap:
            rcm_at_lap = list(rcm)
    if tracker.should_inject(lap):
        rcm_at_lap.append(tracker.synthetic_event())
    return rcm_at_lap


# ---------------------------------------------------------------------------
# /recommend — N31 full orchestrator (all sub-agents + MC simulation + LLM)
# ---------------------------------------------------------------------------


@router.post("/recommend", response_model=StrategyResponse, dependencies=[Depends(rate_limit("recommend", capacity=5, per_minute=10))])
def recommend_strategy(
    request: RecommendRequest,
    laps_df: pd.DataFrame = Depends(_require_laps_df),
):
    """Run the full Strategy Orchestrator (N31) for a single lap."""
    try:
        from backend.utils.race_state_builder import build_race_state

        from src.agents.strategy_orchestrator import run_strategy_orchestrator_from_state

        # Safety-Car override: when the caller didn't supply RCM events, load them
        # for this lap so an active Safety Car reaches N27 (arcade parity — without
        # this the orchestrator never sees the neutralisation and stays out).
        gp = request.gp_name or request.lap_state.get("session_meta", {}).get("gp_name", "")

        rcm_events = request.rcm_events
        if rcm_events is None:
            lap = int(request.lap_state.get("lap_number", 0) or 0)
            if gp and lap:
                rcm_events = _rcm_events_for_lap(request.year, gp, laps_df, lap)

        # Scope the frame to THIS race before the agents see it (#429). The cached
        # parquet holds the whole season, and every agent lookup that takes it
        # (_get_lap_row, _get_position_map, _get_undercut_candidates,
        # _get_driver_stint, the SC feature builder) filters by Driver/LapNumber but
        # NOT by GP — so they silently resolved to whichever race sorted first or
        # last in the file. Measured before this filter: the lap-7 position map came
        # from Zandvoort and PIA's lap-7 row from Barcelona, while analysing Lusail.
        # Every one of those lookups wants the single race, so one filter here fixes
        # them all without touching the agents.
        race_laps_df = laps_df[laps_df["GP_Name"] == gp] if gp else laps_df

        race_state = build_race_state(
            request.lap_state,
            gap_ahead_s=request.gap_ahead_s,
            pace_delta_s=request.pace_delta_s,
            risk_tolerance=request.risk_tolerance,
            radio_msgs=request.radio_msgs,
            rcm_events=rcm_events,
        )

        result = run_strategy_orchestrator_from_state(
            race_state=race_state,
            laps_df=race_laps_df,
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


# ---------------------------------------------------------------------------
# Radio corpus endpoints — query pre-built radio data from parquet
# ---------------------------------------------------------------------------

# GP name → slug resolver (shared with CLI and radio runner)
try:
    from src.f1_strat_manager.gp_slugs import COUNTRY_SLUG_BY_GP, resolve_gp_slug
except ImportError:
    COUNTRY_SLUG_BY_GP = {}

    def resolve_gp_slug(gp_name: str) -> str:  # type: ignore[misc]
        return gp_name.lower().replace(" ", "_")


def _radio_corpus_root() -> Path:
    """Base path for the processed radio corpus."""
    return get_data_root() / "processed" / "race_radios"


def _transcript_cache_root() -> Path:
    """Base path for cached Whisper transcripts."""
    return get_data_root() / "processed" / "radio_nlp"


def _driver_number_to_code(year: int = 2025) -> dict:
    """Build a {driver_number: 'VER'} mapping from the featured parquet."""
    df = get_laps_df(year)
    if df is None:
        return {}
    mapping = df[["DriverNumber", "Driver"]].drop_duplicates()
    return dict(zip(mapping["DriverNumber"].astype(int), mapping["Driver"]))


@router.get("/radio-available-gps")
def radio_available_gps(year: int = 2025):
    """Return GP names that have a radio corpus for the given year."""
    corpus = _radio_corpus_root() / str(year)
    if not corpus.is_dir():
        return {"gps": []}

    # Invert slug map to translate on-disk slugs back to friendly names
    slug_to_gp = {v: k for k, v in COUNTRY_SLUG_BY_GP.items()}
    # Deduplicate (Montreal/Montréal both map to canada)
    seen = {}
    for slug in sorted(d.name for d in corpus.iterdir() if d.is_dir()):
        friendly = slug_to_gp.get(slug, slug.replace("_", " ").title())
        if friendly not in seen:
            seen[friendly] = slug
    return {"gps": sorted(seen.keys())}


@router.get("/radio-laps")
def radio_laps(gp: str, year: int = 2025, driver: Optional[str] = None):
    """Return drivers and their laps that have radio messages.

    If *driver* is provided (3-letter code, e.g. 'VER'), only that driver's
    laps are returned.  Otherwise all drivers with radio are listed.
    """
    import json as _json

    try:
        slug = resolve_gp_slug(gp)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc))

    radios_path = _radio_corpus_root() / str(year) / slug / "radios.parquet"
    if not radios_path.exists():
        return {"drivers": []}

    rdf = pd.read_parquet(radios_path)
    drv_map = _driver_number_to_code(year)

    # Load cached transcripts (if available)
    transcripts: dict = {}
    tx_path = _transcript_cache_root() / str(year) / slug / "transcripts.json"
    if tx_path.exists():
        try:
            with open(tx_path, encoding="utf-8") as f:
                transcripts = _json.load(f)
        except Exception:
            pass

    # Optionally filter by driver code
    if driver:
        # Find the driver_number for this code
        code_to_num = {v: k for k, v in drv_map.items()}
        drv_num = code_to_num.get(driver)
        if drv_num is not None:
            rdf = rdf[rdf["driver_number"] == drv_num]
        else:
            return {"drivers": []}

    result = []
    for drv_num, grp in rdf.groupby("driver_number"):
        code = drv_map.get(int(drv_num), f"#{drv_num}")
        laps_data = []
        for _, row in grp.sort_values("lap_number").iterrows():
            audio_key = str(row.get("audio_path", "")).replace("\\", "/")
            tx = transcripts.get(audio_key, {})
            laps_data.append({
                "lap": int(row["lap_number"]),
                "text": tx.get("text", ""),
                "has_transcript": bool(tx.get("text")),
                "audio_path": audio_key,
            })
        result.append({"driver": code, "driver_number": int(drv_num), "laps": laps_data})

    result.sort(key=lambda d: d["driver"])
    return {"drivers": result}


@router.get("/radio-transcript")
def radio_transcript(gp: str, driver: str, lap: int, year: int = 2025):
    """Return the transcript text for a specific driver/lap radio message."""
    import json as _json

    try:
        slug = resolve_gp_slug(gp)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc))

    radios_path = _radio_corpus_root() / str(year) / slug / "radios.parquet"
    if not radios_path.exists():
        raise HTTPException(404, detail=f"No radio corpus for {gp} {year}")

    rdf = pd.read_parquet(radios_path)
    drv_map = _driver_number_to_code(year)
    code_to_num = {v: k for k, v in drv_map.items()}
    drv_num = code_to_num.get(driver)

    if drv_num is None:
        raise HTTPException(404, detail=f"Driver {driver} not found")

    rows = rdf[(rdf["driver_number"] == drv_num) & (rdf["lap_number"] == lap)]
    if rows.empty:
        raise HTTPException(404, detail=f"No radio for {driver} at lap {lap}")

    tx_path = _transcript_cache_root() / str(year) / slug / "transcripts.json"
    transcripts: dict = {}
    if tx_path.exists():
        try:
            with open(tx_path, encoding="utf-8") as f:
                transcripts = _json.load(f)
        except Exception:
            pass

    results = []
    for _, row in rows.iterrows():
        audio_key = str(row.get("audio_path", "")).replace("\\", "/")
        tx = transcripts.get(audio_key, {})
        results.append({
            "driver": driver,
            "lap": lap,
            "text": tx.get("text", "[no transcript available]"),
            "duration_s": tx.get("duration_s"),
            "audio_path": audio_key,
        })

    return {"messages": results}


# ---------------------------------------------------------------------------
# Simulation streaming endpoint \u2014 /api/v1/strategy/simulate
# ---------------------------------------------------------------------------


class SimulateRequest(BaseModel):
    """Inputs for a streamed race simulation run.

    Mirrors the ``SimConfig`` dataclass in the simulation service; we keep a
    Pydantic equivalent here so FastAPI can validate and document the payload
    without importing the service module at schema-generation time.
    """

    year: int = Field(2025, ge=2023, le=2025)
    gp: str
    driver: str
    team: str
    driver2: Optional[str] = None
    lap_range: Optional[tuple[int, int]] = None
    risk_tolerance: float = Field(0.5, ge=0.0, le=1.0)
    no_llm: bool = False
    provider: str = Field("lmstudio", pattern="^(lmstudio|openai)$")
    interval_s: float = Field(0.0, ge=0.0, le=10.0)


@router.post("/simulate", dependencies=[Depends(rate_limit("simulate", capacity=3, per_minute=3))])
def simulate(req: SimulateRequest):
    """Stream per-lap strategy decisions as Server-Sent Events.

    Each event is a JSON blob in the ``data: ...\\n\\n`` SSE frame format. The
    stream begins with a single ``start`` event, then emits one ``lap`` (or
    ``error``) event per processed lap, and closes with a ``summary``. A
    heartbeat comment is sent every 15 lap events so long runs survive proxy
    idle timeouts.
    """
    from backend.services.simulation import SimConfig, simulate_race

    def event_stream():
        config = SimConfig(**req.model_dump())
        lap_count = 0
        try:
            for event in simulate_race(config):
                yield f"data: {json.dumps(event, default=str)}\n\n"
                if event.get("type") == "lap":
                    lap_count += 1
                    if lap_count % 15 == 0:
                        yield ":\n\n"
        except Exception as exc:
            logger.error("Simulation stream failed: %s", exc, exc_info=True)
            err = {"type": "error", "data": {"lap": 0, "message": str(exc)}}
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
