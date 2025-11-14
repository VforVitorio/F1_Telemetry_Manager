"""
Comparison API Endpoints

Handles HTTP requests for telemetry comparison between two drivers.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict
import logging

from backend.services.comparison_service import prepare_comparison_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comparison", tags=["comparison"])


@router.get("/compare")
async def compare_drivers(
    year: int = Query(...),
    gp: str = Query(...),
    session: str = Query(...),
    driver1: str = Query(...),
    driver2: str = Query(...),
    lap1: int = Query(...),
    lap2: int = Query(...)
) -> Dict:
    """
    Compare telemetry between two drivers.

    Returns optimized circuit coordinates, synchronized telemetry, and delta times.
    """
    pass
