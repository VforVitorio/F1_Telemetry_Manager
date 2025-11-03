"""
Circuit Domination Endpoint

Provides REST API endpoint for fetching circuit domination data.
Returns processed GPS coordinates and microsector colors for visualization.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.services.telemetry_service import get_circuit_domination_data
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/circuit-domination", tags=["telemetry"])


@router.get("")
async def get_circuit_domination(
    year: int = Query(..., ge=2018, le=2030, description="Racing season year"),
    gp: str = Query(..., min_length=1, description="Grand Prix name (e.g., 'Spain', 'Belgium')"),
    session: str = Query(..., regex="^(FP1|FP2|FP3|Q|R|S|SQ)$", description="Session type"),
    drivers: str = Query(..., description="Comma-separated driver codes (e.g., 'VER,LEC,HAM')")
):
    """
    Get circuit domination visualization data.

    Returns GPS coordinates and colors for each microsector based on
    which driver was fastest in that section of the track.

    **Parameters:**
    - **year**: Racing season year (2018-2030)
    - **gp**: Grand Prix name (must match FastF1 naming)
    - **session**: Session type (FP1, FP2, FP3, Q, R, S, SQ)
    - **drivers**: Comma-separated driver codes (max 3)

    **Returns:**
    ```json
    {
        "x": [100.5, 101.2, ...],
        "y": [50.3, 51.1, ...],
        "colors": ["#A259F7", "#00B4D8", ...]
    }
    ```

    **Example:**
    ```
    GET /api/v1/circuit-domination?year=2024&gp=Spain&session=Q&drivers=VER,LEC
    ```
    """
    # Parse and validate drivers
    driver_list = [d.strip().upper() for d in drivers.split(',')]

    if len(driver_list) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one driver must be specified"
        )

    if len(driver_list) > 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum 3 drivers allowed"
        )

    # Validate driver code format (3 uppercase letters)
    for driver in driver_list:
        if len(driver) != 3 or not driver.isalpha():
            raise HTTPException(
                status_code=400,
                detail=f"Invalid driver code: {driver}. Must be 3 letters (e.g., 'VER', 'HAM')"
            )

    try:
        logger.info(f"Fetching circuit domination: {year} {gp} {session} {driver_list}")

        # Call service to get data
        data = get_circuit_domination_data(
            year=year,
            gp=gp,
            session_type=session,
            drivers=driver_list
        )

        return data

    except ValueError as e:
        # Handle expected errors (session not found, no laps, etc.)
        logger.warning(f"ValueError: {e}")
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error while processing telemetry data: {str(e)}"
        )
