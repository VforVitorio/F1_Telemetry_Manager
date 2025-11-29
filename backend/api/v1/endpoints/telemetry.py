from fastapi import APIRouter, Query, HTTPException
from backend.services.telemetry.telemetry_service import (
    get_telemetry_data_from_db,
    get_available_gps,
    get_available_sessions,
    get_available_drivers,
    get_lap_times,
    get_lap_telemetry
)

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