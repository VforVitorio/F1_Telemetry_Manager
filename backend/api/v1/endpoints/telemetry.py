from fastapi import APIRouter, Query
from backend.services.telemetry.telemetry_service import get_telemetry_data_from_db
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