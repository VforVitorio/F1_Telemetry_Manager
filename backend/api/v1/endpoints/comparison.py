"""
Comparison API Endpoints

Handles HTTP requests for telemetry comparison between two drivers.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict
import logging

from backend.services.comparison_service import prepare_comparison_data
from backend.services.telemetry_service import fetch_lap_telemetry
from backend.core.driver_colors import get_driver_color

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comparison", tags=["comparison"])


@router.get("/compare")
async def compare_drivers(
    year: int = Query(..., description="Season year"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(...,
                         description="Session type (FP1, FP2, FP3, Q, R)"),
    driver1: str = Query(...,
                         description="First driver abbreviation (e.g., VER)"),
    driver2: str = Query(...,
                         description="Second driver abbreviation (e.g., HAM)"),
    lap1: int = Query(..., description="Lap number for first driver"),
    lap2: int = Query(..., description="Lap number for second driver")
) -> Dict:
    """
    Compare telemetry between two drivers.

    Fetches telemetry data for specified laps, optimizes circuit layout,
    synchronizes data points, and calculates delta times.

    Args:
        year: Season year
        gp: Grand Prix name
        session: Session type
        driver1: First driver abbreviation
        driver2: Second driver abbreviation
        lap1: Lap number for first driver
        lap2: Lap number for second driver

    Returns:
        Dictionary containing:
        - circuit: Optimized x, y coordinates
        - pilot1: Synchronized telemetry with color
        - pilot2: Synchronized telemetry with color
        - delta: Time differences at each point
        - metadata: Rotation angle and aspect ratio

    Raises:
        HTTPException: If session/driver/lap data not found
    """
    try:
        logger.info(
            f"Comparing {driver1} lap {lap1} vs {driver2} lap {lap2} - {year} {gp} {session}")

        # Fetch telemetry data from FastF1
        driver1_data = fetch_lap_telemetry(year, gp, session, driver1, lap1)
        driver2_data = fetch_lap_telemetry(year, gp, session, driver2, lap2)

        logger.info(
            f"Fetched telemetry: {driver1} ({len(driver1_data['x'])} points), {driver2} ({len(driver2_data['x'])} points)")

        # Assign colors based on driver's team (F1 2024 official colors)
        driver1_color = get_driver_color(driver1)
        driver2_color = get_driver_color(driver2)

        # Process comparison data
        comparison_data = prepare_comparison_data(
            driver1_data=driver1_data,
            driver2_data=driver2_data,
            driver1_color=driver1_color,
            driver2_color=driver2_color
        )

        logger.info(f"Comparison data prepared successfully")
        return comparison_data

    except ValueError as e:
        # Handle expected errors from telemetry service (session/driver/lap not found)
        logger.warning(f"ValueError: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing drivers: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal error processing comparison: {str(e)}"
        )
