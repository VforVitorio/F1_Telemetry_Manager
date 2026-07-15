from typing import Optional

import numpy as np
import pandas as pd
from backend.services.telemetry.telemetry_service import (
    get_available_drivers,
    get_available_gps,
    get_available_sessions,
    get_lap_telemetry,
    get_lap_times,
    get_telemetry_data_from_db,
)
from backend.services.telemetry.session_cache import prewarm_session
from backend.utils.laps_cache import get_laps_df
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

# NOTE (perf): these handlers are plain ``def`` (NOT ``async def``) on purpose.
# They call synchronous, CPU/IO-blocking FastF1 code; a ``def`` handler runs in
# Starlette's threadpool, so several telemetry requests fired by one selection
# (lap-times + N lap-telemetry + circuit-domination) run concurrently instead of
# serializing on the event loop — and a slow FastF1 parse no longer freezes the
# whole server. See session_cache.py for the parse-once half of the fix.


@router.get("/data")
def get_telemetry_data(
    year: int = Query(...),
    gp: str = Query(...),
    session: str = Query(...),
    drivers: str = Query(...)
):
    driver_list = drivers.split(",")
    data = get_telemetry_data_from_db(year, gp, session, driver_list)
    return data


@router.post("/prewarm", status_code=202)
def prewarm(
    background_tasks: BackgroundTasks,
    year: int = Query(...),
    gp: str = Query(...),
    session: str = Query(...),
):
    """Warm the FastF1 session cache for (year, gp, session) in the background.

    The frontend calls this when the user picks a session, so the ~2-15s parse
    starts while they choose drivers — by the time lap-times/telemetry fire, the
    session is already loaded and the charts fall in instead of hanging.
    Returns 202 immediately; the load runs after the response is sent.
    """
    background_tasks.add_task(prewarm_session, year, gp, session)
    return {"status": "prewarming", "year": year, "gp": gp, "session": session}


@router.get("/gps")
def get_gps(year: int = Query(..., description="Year of the season (e.g., 2024)")):
    """
    Get available Grand Prix events for a specific year.
    """
    gp_list = get_available_gps(year)
    return {"gps": gp_list}


@router.get("/sessions")
def get_sessions(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name")
):
    """
    Get available sessions for a specific Grand Prix.
    """
    session_list = get_available_sessions(year, gp)
    return {"sessions": session_list}


@router.get("/drivers")
def get_drivers(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(..., description="Session type (FP1, FP2, FP3, SQ, Q, S, R)")
):
    """
    Get available drivers for a specific session.
    """
    driver_list = get_available_drivers(year, gp, session)
    return {"drivers": driver_list}


@router.get(
    "/lap-times",
    operation_id="get_lap_times",
    summary="Lap-time series for one or more drivers (pace comparison chart)",
    description=(
        "Use this tool when the user wants a CHART of lap times across a "
        "stint or race — pace evolution, who was faster lap-by-lap, "
        "tyre-life effects on lap time.  Accepts one driver (single "
        "trace) or several comma-separated codes (overlay).  Returns the "
        "full lap-time list per driver; the frontend renders a Plotly "
        "line chart inline.  Prefer this over predict_pace for "
        "historical pace comparison; use predict_pace only when the user "
        "asks to FORECAST a future race lap."
    ),
)
def get_laps(
    year: int = Query(..., description="Season year (2023, 2024 or 2025)."),
    gp: str = Query(..., description="Grand Prix name (city/circuit form preferred, country names also accepted)."),
    session: str = Query(
        ...,
        description="Session code: R (race), Q (qualifying), S (sprint), SQ (sprint qualifying), FP1 / FP2 / FP3.  Default to R unless the user explicitly mentions another session.",
    ),
    drivers: str = Query(..., description="Comma-separated 3-letter driver codes, e.g. 'VER,HAM,LEC'.  Pass a single code for a single-driver trace."),
):
    """
    Get lap times for specified drivers in a session.
    """
    driver_list = drivers.split(",")
    lap_times = get_lap_times(year, gp, session, driver_list)
    return {"lap_times": lap_times}


@router.get(
    "/lap-telemetry",
    operation_id="get_telemetry",
    summary="Speed / throttle / brake trace for ONE driver on ONE lap",
    description=(
        "Use this tool when the user wants the telemetry of a SPECIFIC "
        "lap for a single driver — speed graph, throttle / brake / RPM "
        "trace, gear shifts, DRS activations.  Requires a concrete lap "
        "number (1-80).  Lap 1 typically has no data (formation lap) — "
        "do not default to 1; either pick a sensible mid-race lap or "
        "ask the user.  For comparing telemetry of two drivers use "
        "compare_drivers instead."
    ),
)
def get_lap_telemetry_endpoint(
    year: int = Query(..., description="Season year (2023, 2024 or 2025)."),
    gp: str = Query(..., description="Grand Prix name (city/circuit form preferred)."),
    session: str = Query(
        ...,
        description="Session code: R, Q, S, SQ, FP1, FP2, FP3.  Default R for race telemetry.",
    ),
    driver: str = Query(..., description="Driver — 3-letter code (VER, HAM, LEC, NOR, PIA, …)."),
    lap_number: int = Query(..., description="Lap number, integer between 2 and the race length.  Avoid lap 1 — usually no telemetry."),
):
    """
    Get telemetry data for a specific lap.

    Returns:
        Telemetry data including distance, speed, throttle, brake, rpm, gear, and drs
    """
    telemetry_data = get_lap_telemetry(year, gp, session, driver, lap_number)

    if not telemetry_data:
        raise HTTPException(
            status_code=404,
            detail=f"No telemetry data found for {driver} lap {lap_number} in {year} {gp} {session}"
        )

    return telemetry_data


# ---------------------------------------------------------------------------
# /race-data — full featured DataFrame from the pre-built parquet
# ---------------------------------------------------------------------------


def _compute_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """Compute GapToCarAhead / GapToCarBehind from cumulative lap times.

    For each lap, drivers are sorted by Position.  The cumulative sum of
    LapTime_s per driver approximates session elapsed time (the real Time
    column is dropped in N04).  The difference between adjacent positions
    gives the inter-car gap in seconds.
    """
    df = df.sort_values(["Driver", "LapNumber"])
    df["_cum_time"] = df.groupby("Driver")["LapTime_s"].cumsum()

    parts = []
    for _, lap_df in df.groupby("LapNumber"):
        lap_sorted = lap_df.sort_values("Position").copy()
        cum = lap_sorted["_cum_time"].values

        gap_ahead = np.full(len(cum), np.nan)
        gap_behind = np.full(len(cum), np.nan)

        if len(cum) > 1:
            gap_ahead[1:] = cum[1:] - cum[:-1]
            gap_behind[:-1] = cum[1:] - cum[:-1]

        lap_sorted["GapToCarAhead"] = np.abs(gap_ahead)
        lap_sorted["GapToCarBehind"] = np.abs(gap_behind)
        parts.append(lap_sorted)

    result = pd.concat(parts)
    result.drop(columns="_cum_time", inplace=True)
    return result


def _compute_gap_consistency(df: pd.DataFrame) -> pd.DataFrame:
    """Count consecutive laps each driver stays in the same gap window.

    Windows mirror the legacy logic:
      - ahead < 2s  → undercut_window
      - 2s ≤ ahead < 3.5s → overcut_window
      - else → out_of_range
    """
    def _win(gap):
        if pd.isna(gap):
            return "unknown"
        if gap < 2.0:
            return "close"
        if gap < 3.5:
            return "medium"
        return "far"

    df["_aw"] = df["GapToCarAhead"].apply(_win)
    df["_bw"] = df["GapToCarBehind"].apply(_win)
    df["consistent_gap_ahead_laps"] = 1
    df["consistent_gap_behind_laps"] = 1

    for driver in df["Driver"].unique():
        idxs = df.index[df["Driver"] == driver]
        drv = df.loc[idxs].sort_values("LapNumber")
        for i in range(1, len(drv)):
            cur, prev = drv.index[i], drv.index[i - 1]
            if drv.at[cur, "_aw"] == drv.at[prev, "_aw"]:
                df.at[cur, "consistent_gap_ahead_laps"] = (
                    df.at[prev, "consistent_gap_ahead_laps"] + 1
                )
            if drv.at[cur, "_bw"] == drv.at[prev, "_bw"]:
                df.at[cur, "consistent_gap_behind_laps"] = (
                    df.at[prev, "consistent_gap_behind_laps"] + 1
                )

    df.drop(columns=["_aw", "_bw"], inplace=True)
    return df


_RACE_DATA_COLS = [
    "Driver", "DriverNumber", "LapNumber", "Stint", "SpeedI1", "SpeedI2",
    "SpeedFL", "SpeedST", "Compound", "TyreLife", "FreshTyre", "Team",
    "Position", "CompoundID", "LapTime_s", "FuelLoad", "FuelAdjustedLapTime",
    "FuelAdjustedDegAbsolute", "FuelAdjustedDegPercent", "DegradationRate",
    "AirTemp", "TrackTemp", "GP_Name",
    "GapToCarAhead", "GapToCarBehind",
    "consistent_gap_ahead_laps", "consistent_gap_behind_laps",
]


@router.get(
    "/race-data",
    operation_id="get_race_data",
    summary="Full race overview — positions and lap times for a Grand Prix",
    description=(
        "Use this tool when the user wants a HIGH-LEVEL view of a race "
        "(position evolution lap-by-lap, multi-driver pace overview, "
        "stint-by-stint chart) rather than a single driver's telemetry "
        "or a head-to-head comparison.  Reads the pre-built featured "
        "parquet so it's fast and covers the whole field by default; "
        "pass driver codes to restrict.  Frontend renders position + "
        "lap-time subplots."
    ),
)
def get_race_data(
    year: int = Query(2025, description="Season year (2023, 2024 or 2025)."),
    gp: str = Query(..., description="Grand Prix name (city/circuit form preferred, country names also accepted)."),
    driver: Optional[str] = Query(None, description="Optional comma-separated 3-letter driver codes (e.g. 'VER,LEC').  Omit to get the whole field."),
):
    """Return the full featured DataFrame for a GP, ready for chart rendering."""
    df = get_laps_df(year)
    if df is None:
        raise HTTPException(404, detail=f"No parquet data for {year}")

    mask = df["GP_Name"] == gp
    if not mask.any():
        raise HTTPException(404, detail=f"GP '{gp}' not found in {year} data")

    subset = df[mask].copy()

    if driver:
        codes = [d.strip() for d in driver.split(",")]
        subset = subset[subset["Driver"].isin(codes)]
        if subset.empty:
            raise HTTPException(404, detail=f"Driver(s) {codes} not found in {gp} {year}")

    # Compute inter-driver gap columns from cumulative lap times
    if "LapTime_s" in subset.columns and "Position" in subset.columns:
        subset = _compute_gaps(subset)
        subset = _compute_gap_consistency(subset)

    # Add TyreAge alias expected by tire charts
    subset["TyreAge"] = subset["TyreLife"]

    # Keep only the columns the frontend needs
    cols = [c for c in _RACE_DATA_COLS + ["TyreAge"] if c in subset.columns]
    subset = subset[cols]

    # Sanitize for JSON: NaN/inf → null via pandas .to_json() which handles
    # numpy NaN natively (unlike .to_dict() + json.dumps which chokes on NaN)
    import json as _json

    subset = subset.replace([np.inf, -np.inf], np.nan)
    records = _json.loads(subset.to_json(orient="records"))

    return {
        "race_data": records,
        "count": len(subset),
    }
