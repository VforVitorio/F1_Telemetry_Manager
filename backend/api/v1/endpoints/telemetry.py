from fastapi import APIRouter, Query
from backend.services.telemetry.telemetry_service import (
    get_telemetry_data_from_db,
    get_available_gps,
    get_available_sessions,
    get_available_drivers,
    get_lap_times
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
    session: str = Query(..., description="Session type (FP1, FP2, FP3, Q, R)")
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
    session: str = Query(..., description="Session type (FP1, FP2, FP3, Q, R)"),
    drivers: str = Query(..., description="Comma-separated driver codes")
):
    """
    Get lap times for specified drivers in a session.
    """
    driver_list = drivers.split(",")
    lap_times = get_lap_times(year, gp, session, driver_list)
    return {"lap_times": lap_times}