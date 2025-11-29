"""
Comparison API Endpoints

Handles HTTP requests for telemetry comparison between two drivers.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict
import logging

from backend.services.comparison_service import prepare_comparison_data
from backend.services.telemetry_service import (
    fetch_lap_telemetry,
    get_highest_common_q_phase,
    get_fastest_lap_in_q_phase,
    extract_telemetry_from_lap,
    get_driver_qualifying_phases
)
from backend.core.driver_colors import get_driver_color
import fastf1

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comparison", tags=["comparison"])


@router.get("/compare")
async def compare_drivers(
    year: int = Query(..., description="Season year"),
    gp: str = Query(..., description="Grand Prix name"),
    session: str = Query(...,
                         description="Session type (FP1, FP2, FP3, SQ, Q, S, R)"),
    driver1: str = Query(...,
                         description="First driver abbreviation (e.g., VER)"),
    driver2: str = Query(...,
                         description="Second driver abbreviation (e.g., HAM)")
) -> Dict:
    """
    Compare telemetry between two drivers using their fastest laps.

    Fetches fastest lap telemetry data for both drivers, optimizes circuit layout,
    synchronizes data points, and calculates delta times and microsector dominance.

    Args:
        year: Season year
        gp: Grand Prix name
        session: Session type
        driver1: First driver abbreviation
        driver2: Second driver abbreviation

    Returns:
        Dictionary containing:
        - circuit: Optimized x, y coordinates with microsector colors
        - pilot1: Synchronized telemetry with color
        - pilot2: Synchronized telemetry with color
        - delta: Time differences at each point
        - metadata: Rotation angle and aspect ratio

    Raises:
        HTTPException: If session/driver data not found or no valid fastest lap available
    """
    try:
        logger.info(
            f"Comparing fastest laps: {driver1} vs {driver2} - {year} {gp} {session}")

        # Initialize metadata
        qualifying_phase = None
        warning_message = None

        # Special handling for Qualifying sessions
        if session == 'Q':
            logger.info("Qualifying session detected - using phase-specific logic")

            # Load session to access phase data
            fastf1_session = fastf1.get_session(year, gp, session)
            fastf1_session.load()

            # Get highest common qualifying phase
            highest_phase = get_highest_common_q_phase(
                driver1, driver2, fastf1_session)

            if highest_phase:
                # Both drivers share a common phase - use fastest lap from that phase
                logger.info(
                    f"Using fastest laps from {highest_phase} for both drivers")
                qualifying_phase = highest_phase

                lap1 = get_fastest_lap_in_q_phase(
                    driver1, highest_phase, fastf1_session)
                lap2 = get_fastest_lap_in_q_phase(
                    driver2, highest_phase, fastf1_session)

                driver1_data = extract_telemetry_from_lap(lap1, driver1)
                driver2_data = extract_telemetry_from_lap(lap2, driver2)

                # Get phases for info message
                driver1_phases = get_driver_qualifying_phases(
                    driver1, fastf1_session)
                driver2_phases = get_driver_qualifying_phases(
                    driver2, fastf1_session)

                # Add info message if there's a performance difference
                driver1_best = driver1_phases[0] if driver1_phases else 'Q1'
                driver2_best = driver2_phases[0] if driver2_phases else 'Q1'

                if driver1_best != driver2_best:
                    # There's a performance gap
                    warning_message = (
                        f"{driver1} progressed to {driver1_best}, "
                        f"{driver2} {'progressed to' if driver2_best != 'Q1' else 'eliminated in'} {driver2_best}"
                    )

            else:
                # No common phase - use overall fastest laps with warning
                logger.warning(
                    f"No common qualifying phase for {driver1} and {driver2}")

                driver1_phases = get_driver_qualifying_phases(
                    driver1, fastf1_session)
                driver2_phases = get_driver_qualifying_phases(
                    driver2, fastf1_session)

                driver1_data = fetch_lap_telemetry(
                    year, gp, session, driver1, use_fastest_lap=True)
                driver2_data = fetch_lap_telemetry(
                    year, gp, session, driver2, use_fastest_lap=True)

                warning_message = (
                    f"Drivers competed in different qualifying phases: "
                    f"{driver1} ({', '.join(driver1_phases) if driver1_phases else 'None'}) vs "
                    f"{driver2} ({', '.join(driver2_phases) if driver2_phases else 'None'}). "
                    f"Comparison uses overall fastest laps and may not reflect fair conditions."
                )

        else:
            # Non-qualifying sessions: use standard fastest lap logic
            driver1_data = fetch_lap_telemetry(
                year, gp, session, driver1, use_fastest_lap=True)
            driver2_data = fetch_lap_telemetry(
                year, gp, session, driver2, use_fastest_lap=True)

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

        # Add qualifying-specific metadata
        if session == 'Q':
            comparison_data['metadata']['qualifying_phase'] = qualifying_phase
            comparison_data['metadata']['warning'] = warning_message

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
