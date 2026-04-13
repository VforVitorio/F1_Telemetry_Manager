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
from backend.utils.laps_cache import get_laps_df
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.get("/data")
async def get_telemetry_data(
    year: int = Query(...),
    gp: str = Query(...),
    session: str = Query(...),
    drivers: str = Query(...)
):
    driver_list = drivers.split(",")
    data = get_telemetry_data_from_db(year, gp, session, driver_list)
    return data


@router.get("/gps")
async def get_gps(year: int = Query(..., description="Year of the season (e.g., 2024)")):
    """
    Get available Grand Prix events for a specific year.
    """
    gp_list = get_available_gps(year)
    return {"gps": gp_list}


@router.get("/sessions")
async def get_sessions(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name")
):
    """
    Get available sessions for a specific Grand Prix.
    """
    session_list = get_available_sessions(year, gp)
    return {"sessions": session_list}


@router.get("/drivers")
async def get_drivers(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(..., description="Session type (FP1, FP2, FP3, SQ, Q, S, R)")
):
    """
    Get available drivers for a specific session.
    """
    driver_list = get_available_drivers(year, gp, session)
    return {"drivers": driver_list}


@router.get("/lap-times")
async def get_laps(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(..., description="Session type (FP1, FP2, FP3, SQ, Q, S, R)"),
    drivers: str = Query(..., description="Comma-separated driver codes")
):
    """
    Get lap times for specified drivers in a session.
    """
    driver_list = drivers.split(",")
    lap_times = get_lap_times(year, gp, session, driver_list)
    return {"lap_times": lap_times}


@router.get("/lap-telemetry")
async def get_lap_telemetry_endpoint(
    year: int = Query(..., description="Year of the season"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(..., description="Session type (FP1, FP2, FP3, SQ, Q, S, R)"),
    driver: str = Query(..., description="Driver code"),
    lap_number: int = Query(..., description="Lap number")
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


@router.get("/race-data")
def get_race_data(
    year: int = Query(2025, description="Season year"),
    gp: str = Query(..., description="GP name as it appears in the parquet"),
    driver: Optional[str] = Query(None, description="Comma-separated driver codes (optional)"),
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
