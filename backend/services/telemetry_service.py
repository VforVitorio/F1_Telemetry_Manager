"""
Telemetry Service

This module provides business logic for fetching and processing F1 telemetry data
using the FastF1 API. It handles GPS coordinate processing, circuit rotation,
microsector calculation, and driver comparison.
"""

import numpy as np
import fastf1
from typing import Dict, List, Tuple
import logging
import os
import warnings

# Suppress specific FastF1/pandas warnings
warnings.filterwarnings('ignore', message='.*fill_value.*')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable FastF1 cache to avoid re-downloading data
cache_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'cache')
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir)
logger.info(f"FastF1 cache enabled at: {cache_dir}")

# Official track lengths in meters (imported from frontend for consistency)
OFFICIAL_TRACK_LENGTHS = {
    'Belgium': 7004,      # Spa-Francorchamps
    'Monaco': 3337,       # Circuit de Monaco
    'Italy': 5793,        # Monza
    'Bahrain': 5412,      # Bahrain International Circuit
    'Spain': 4675,        # Circuit de Barcelona-Catalunya
    'Austria': 4318,      # Red Bull Ring
    'Britain': 5891,      # Silverstone
    'Hungary': 4381,      # Hungaroring
    'Netherlands': 4259,  # Circuit Zandvoort
    'Singapore': 5063,    # Marina Bay Street Circuit
    'Japan': 5807,        # Suzuka International Racing Course
    'Qatar': 5380,        # Lusail International Circuit
    'United States': 5513,  # Circuit of the Americas
    'Mexico': 4304,       # Autódromo Hermanos Rodríguez
    'Brazil': 4309,       # Interlagos
    'Las Vegas': 6201,    # Las Vegas Strip Circuit
    'Abu Dhabi': 5281,    # Yas Marina Circuit
    'Australia': 5278,    # Albert Park
    'Saudi Arabia': 6174,  # Jeddah Corniche Circuit
    'Miami': 5412,        # Miami International Autodrome
    'Emilia Romagna': 4909,  # Imola
    'Canada': 4361,       # Circuit Gilles Villeneuve
    'Azerbaijan': 6003,   # Baku City Circuit
    'China': 5451,        # Shanghai International Circuit
}


def get_circuit_domination_data(
    year: int,
    gp: str,
    session_type: str,
    drivers: List[str]
) -> Dict:
    """
    Get circuit domination data for the specified session and drivers.

    This function loads FastF1 telemetry data, processes GPS coordinates,
    divides the circuit into microsectors, and determines which driver
    was fastest in each microsector.

    Args:
        year: Racing season year (e.g., 2024)
        gp: Grand Prix name (e.g., 'Spain', 'Belgium')
        session_type: Session type ('FP1', 'FP2', 'FP3', 'Q', 'R')
        drivers: List of driver codes (e.g., ['VER', 'LEC', 'HAM'])

    Returns:
        Dictionary containing:
            - x: List of x coordinates (meters)
            - y: List of y coordinates (meters)
            - colors: List of hex colors for each segment
            - drivers: Dictionary mapping driver codes to their colors

    Raises:
        ValueError: If session not found, no laps available, or invalid GP
        Exception: For other FastF1 errors
    """
    logger.info(f"Loading session: {year} {gp} {session_type}")

    # Load session
    try:
        logger.info(f"Requesting session from FastF1: {year} {gp} {session_type}")
        session = fastf1.get_session(year, gp, session_type)
        logger.info("Loading session data (this may take time on first run)...")
        session.load()
        logger.info("Session loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load session: {e}", exc_info=True)
        raise ValueError(f"Session not found or failed to load: {year} {gp} {session_type}. Error: {str(e)}")

    # Get circuit info for rotation
    circuit_info = session.get_circuit_info()
    rotation_angle = getattr(circuit_info, 'rotation', 0)
    logger.info(f"Circuit rotation: {rotation_angle}°")

    # Get official track length
    track_length = OFFICIAL_TRACK_LENGTHS.get(gp)
    if not track_length:
        logger.warning(f"No official track length for {gp}, using calculated length")

    # Process telemetry for each driver
    driver_telemetry = {}

    for driver in drivers:
        try:
            # Get fastest lap for this driver
            driver_laps = session.laps.pick_drivers([driver])
            if driver_laps.empty:
                logger.warning(f"No laps found for driver {driver}")
                continue

            fastest_lap = driver_laps.pick_fastest()
            logger.info(f"Fastest lap for {driver}: {fastest_lap['LapTime']}")

            telemetry = fastest_lap.get_telemetry()
            logger.info(f"Telemetry shape for {driver}: {len(telemetry)} points")

            # Extract and clean GPS data
            if 'X' not in telemetry.columns or 'Y' not in telemetry.columns:
                logger.error(f"GPS data not available in telemetry for {driver}")
                continue

            mask = ~np.isnan(telemetry['X']) & ~np.isnan(telemetry['Y'])
            x_orig = telemetry['X'][mask].to_numpy()
            y_orig = telemetry['Y'][mask].to_numpy()
            speed = telemetry['Speed'][mask].to_numpy()

            if len(x_orig) == 0:
                logger.warning(f"No valid GPS data for driver {driver}")
                continue

            logger.info(f"Valid GPS points for {driver}: {len(x_orig)}")

            # Apply rotation
            x_rot, y_rot = _apply_rotation(x_orig, y_orig, rotation_angle)

            # Convert mm to meters
            x_m = x_rot / 1000
            y_m = y_rot / 1000

            # Calculate cumulative distance
            cumulative_distance = _calculate_cumulative_distance(x_m, y_m)

            # Scale to official track length if available
            if track_length:
                scale_factor = track_length / cumulative_distance[-1]
                cumulative_distance *= scale_factor

            driver_telemetry[driver] = {
                'x': x_m,
                'y': y_m,
                'speed': speed,
                'distance': cumulative_distance
            }

            logger.info(f"Processed telemetry for {driver}: {len(x_m)} points")

        except Exception as e:
            logger.error(f"Failed to process driver {driver}: {e}")
            continue

    if not driver_telemetry:
        raise ValueError("No valid telemetry data found for any driver")

    # Use the first driver's coordinates as reference (all circuits should align)
    reference_driver = drivers[0]
    x_circuit = driver_telemetry[reference_driver]['x']
    y_circuit = driver_telemetry[reference_driver]['y']

    # Calculate microsector dominance
    num_microsectors = 25
    segment_colors = _calculate_microsector_dominance(
        driver_telemetry,
        drivers,
        num_microsectors,
        len(x_circuit)
    )

    return {
        'x': x_circuit.tolist(),
        'y': y_circuit.tolist(),
        'colors': segment_colors
    }


def _apply_rotation(x: np.ndarray, y: np.ndarray, angle_deg: float) -> Tuple[np.ndarray, np.ndarray]:
    """
    Apply rotation transformation to coordinates.

    Args:
        x: X coordinates
        y: Y coordinates
        angle_deg: Rotation angle in degrees

    Returns:
        Tuple of (rotated_x, rotated_y)
    """
    angle_rad = np.radians(angle_deg)
    cos_a = np.cos(angle_rad)
    sin_a = np.sin(angle_rad)

    x_rot = x * cos_a - y * sin_a
    y_rot = x * sin_a + y * cos_a

    return x_rot, y_rot


def _calculate_cumulative_distance(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Calculate cumulative distance along the track.

    Args:
        x: X coordinates in meters
        y: Y coordinates in meters

    Returns:
        Array of cumulative distances
    """
    distances = np.sqrt(np.diff(x)**2 + np.diff(y)**2)
    cumulative = np.insert(np.cumsum(distances), 0, 0)
    return cumulative


def _calculate_microsector_dominance(
    driver_telemetry: Dict,
    drivers: List[str],
    num_microsectors: int,
    num_points: int
) -> List[str]:
    """
    Calculate which driver was fastest in each microsector.

    Args:
        driver_telemetry: Dictionary of telemetry data per driver
        drivers: List of driver codes
        num_microsectors: Number of microsectors to divide circuit into
        num_points: Total number of GPS points

    Returns:
        List of hex color strings for each segment
    """
    # Driver color palette (purple, blue, green)
    color_palette = {
        0: '#A259F7',  # Purple
        1: '#00B4D8',  # Blue
        2: '#43FF64',  # Green
    }

    points_per_sector = num_points // num_microsectors
    colors = []

    for i in range(num_points - 1):
        microsector_idx = i // points_per_sector

        # Find fastest driver at this point
        max_speed = -1
        fastest_driver_idx = 0

        for driver_idx, driver in enumerate(drivers):
            if driver not in driver_telemetry:
                continue

            # Get speed at this point (with bounds checking)
            tel = driver_telemetry[driver]
            if i < len(tel['speed']):
                speed = tel['speed'][i]
                if speed > max_speed:
                    max_speed = speed
                    fastest_driver_idx = driver_idx

        # Assign color based on fastest driver
        color = color_palette.get(fastest_driver_idx, color_palette[0])
        colors.append(color)

    return colors
