"""
Comparison Service

Service for processing and comparing telemetry data between two drivers.
Handles coordinate optimization, telemetry synchronization, and delta calculations.
"""

from typing import Tuple, List, Dict
import numpy as np
import math
import logging

logger = logging.getLogger(__name__)


# ============ COORDINATE PROCESSING FUNCTIONS ============

def center_coordinates(x: List[float], y: List[float]) -> Tuple[List[float], List[float]]:
    """
    Center coordinate arrays around their mean values.

    Translates all coordinates so that the center of the track is at (0, 0).
    This is essential for rotation operations.

    Args:
        x: X coordinate values
        y: Y coordinate values

    Returns:
        Tuple of (centered_x, centered_y)
    """
    x_array = np.array(x)
    y_array = np.array(y)

    x_mean = np.mean(x_array)
    y_mean = np.mean(y_array)

    x_centered = x_array - x_mean
    y_centered = y_array - y_mean

    return x_centered.tolist(), y_centered.tolist()


def rotate_coordinates(x: List[float], y: List[float], angle_radians: float) -> Tuple[List[float], List[float]]:
    """
    Rotate coordinates by specified angle (in radians) around origin.

    Uses 2D rotation matrix:
    [x']   [cos(θ)  -sin(θ)]   [x]
    [y'] = [sin(θ)   cos(θ)] * [y]

    Args:
        x: X coordinate values
        y: Y coordinate values
        angle_radians: Rotation angle in radians

    Returns:
        Tuple of (rotated_x, rotated_y)
    """
    x_array = np.array(x)
    y_array = np.array(y)

    cos_angle = np.cos(angle_radians)
    sin_angle = np.sin(angle_radians)

    x_rotated = x_array * cos_angle - y_array * sin_angle
    y_rotated = x_array * sin_angle + y_array * cos_angle

    return x_rotated.tolist(), y_rotated.tolist()


def calculate_aspect_ratio(x: List[float], y: List[float]) -> float:
    """
    Calculate width-to-height aspect ratio of coordinate bounds.

    A higher ratio means the track is more horizontal (wider than tall),
    which generally provides better visualization.

    Args:
        x: X coordinate values
        y: Y coordinate values

    Returns:
        Aspect ratio (width/height)
    """
    x_array = np.array(x)
    y_array = np.array(y)

    width = np.ptp(x_array)  # Peak-to-peak (max - min)
    height = np.ptp(y_array)

    if height == 0:
        return float('inf')

    return width / height


def optimize_track_layout(x: List[float], y: List[float]) -> Tuple[List[float], List[float], int, float]:
    """
    Find optimal track orientation by maximizing aspect ratio through rotation.

    Tests different rotation angles (0-180 degrees) to find the orientation
    that maximizes the track's width-to-height ratio for better visualization.

    Args:
        x: Raw X coordinate values
        y: Raw Y coordinate values

    Returns:
        Tuple of (optimized_x, optimized_y, best_rotation_degrees, best_ratio)
    """
    x_centered, y_centered = center_coordinates(x, y)

    best_ratio = 0
    best_rotation = 0
    best_x, best_y = x_centered, y_centered

    for angle_deg in range(0, 180, 10):
        angle_rad = math.radians(angle_deg)
        x_rot, y_rot = rotate_coordinates(x_centered, y_centered, angle_rad)
        ratio = calculate_aspect_ratio(x_rot, y_rot)

        if ratio > best_ratio:
            best_ratio = ratio
            best_rotation = angle_deg
            best_x, best_y = x_rot, y_rot

    logger.info(
        f"Track optimized: {best_rotation}° rotation, ratio: {best_ratio:.2f}")
    return best_x, best_y, best_rotation, best_ratio


# ============ TELEMETRY SYNCHRONIZATION ============

def synchronize_telemetry(
    telem1: Dict,
    telem2: Dict,
    reference_x: List[float],
    reference_y: List[float],
    num_points: int = 1000
) -> Tuple[Dict, Dict]:
    """
    Synchronize telemetry from two drivers to have the same number of points.

    Uses interpolation to align data points along distance, ensuring both
    drivers have matching arrays for comparison and animation.
    Both drivers will share the same reference trajectory (x, y coordinates).

    Args:
        telem1: First driver's telemetry data (dict with 'distance', 'x', 'y', 'speed', etc.)
        telem2: Second driver's telemetry data
        reference_x: Reference X coordinates for both drivers (optimized circuit)
        reference_y: Reference Y coordinates for both drivers (optimized circuit)
        num_points: Number of interpolation points (default: 1000)

    Returns:
        Tuple of (synchronized_telem1, synchronized_telem2)
    """
    max_distance = max(telem1['distance'][-1], telem2['distance'][-1])
    common_distance = np.linspace(0, max_distance, num_points)

    # Both drivers share the same reference trajectory (x, y)
    # Only their telemetry data (speed, throttle, brake) differs
    sync_telem1 = {
        'distance': common_distance.tolist(),
        'x': reference_x,
        'y': reference_y,
        'speed': np.interp(common_distance, telem1['distance'], telem1['speed']).tolist(),
        'throttle': np.interp(common_distance, telem1['distance'], telem1['throttle']).tolist(),
        'brake': np.interp(common_distance, telem1['distance'], telem1['brake']).tolist(),
    }

    sync_telem2 = {
        'distance': common_distance.tolist(),
        'x': reference_x,
        'y': reference_y,
        'speed': np.interp(common_distance, telem2['distance'], telem2['speed']).tolist(),
        'throttle': np.interp(common_distance, telem2['distance'], telem2['throttle']).tolist(),
        'brake': np.interp(common_distance, telem2['distance'], telem2['brake']).tolist(),
    }

    return sync_telem1, sync_telem2


# ============ DELTA CALCULATION ============

def calculate_delta_time(telem1: Dict, telem2: Dict) -> List[float]:
    """
    Calculate time delta between two drivers at each point.

    Delta is calculated based on speed differences and accumulated over distance.
    Positive values = pilot1 ahead, negative = pilot2 ahead.

    Args:
        telem1: First driver's synchronized telemetry data
        telem2: Second driver's synchronized telemetry data

    Returns:
        List of delta values in seconds at each point
    """
    distance = np.array(telem1['distance'])
    speed1 = np.array(telem1['speed'])
    speed2 = np.array(telem2['speed'])

    delta_distance = np.diff(distance)

    epsilon = 1e-6
    time1 = delta_distance / (speed1[:-1] / 3.6 + epsilon)
    time2 = delta_distance / (speed2[:-1] / 3.6 + epsilon)

    time_diff = time1 - time2
    cumulative_delta = np.cumsum(time_diff)

    delta = np.insert(cumulative_delta, 0, 0.0)

    return delta.tolist()


# ============ MICROSECTOR ANALYSIS ============

def calculate_microsector_colors(
    sync_telem1: Dict,
    sync_telem2: Dict,
    driver1_color: str,
    driver2_color: str,
    num_microsectors: int = 25
) -> List[str]:
    """
    Calculate which driver was faster in each microsector.

    Divides the circuit into microsectors and determines which driver
    had the highest average speed in each sector. Returns a color for
    each point in the circuit based on microsector dominance.

    Args:
        sync_telem1: First driver's synchronized telemetry data
        sync_telem2: Second driver's synchronized telemetry data
        driver1_color: Hex color for first driver
        driver2_color: Hex color for second driver
        num_microsectors: Number of microsectors to divide circuit into

    Returns:
        List of hex color strings (one per circuit point)
    """
    num_points = len(sync_telem1['x'])
    points_per_sector = max(1, num_points // num_microsectors)

    logger.info(
        f"Calculating microsector colors: {num_microsectors} sectors, {points_per_sector} points per sector")

    # Calculate which driver dominated each microsector
    microsector_colors = []

    for sector_idx in range(num_microsectors):
        start_idx = sector_idx * points_per_sector
        end_idx = min(start_idx + points_per_sector, num_points)

        # Calculate average speed for each driver in this microsector
        speed1 = np.array(sync_telem1['speed'][start_idx:end_idx])
        speed2 = np.array(sync_telem2['speed'][start_idx:end_idx])

        if len(speed1) > 0 and len(speed2) > 0:
            avg_speed1 = np.mean(speed1)
            avg_speed2 = np.mean(speed2)

            # Color based on who was faster
            color = driver1_color if avg_speed1 > avg_speed2 else driver2_color
            microsector_colors.append(color)
        else:
            # Fallback to driver1 color if no data
            microsector_colors.append(driver1_color)

    logger.info(f"Microsector colors calculated: {len(microsector_colors)} sectors")

    # Assign the microsector color to all points in that microsector
    point_colors = []
    for i in range(num_points):
        microsector_idx = min(i // points_per_sector, num_microsectors - 1)
        point_colors.append(microsector_colors[microsector_idx])

    return point_colors


# ============ DATA PREPARATION FOR FRONTEND ============

def prepare_comparison_data(
    driver1_data: Dict,
    driver2_data: Dict,
    driver1_color: str,
    driver2_color: str
) -> Dict:
    """
    Prepare and structure comparison data for frontend rendering.

    Performs coordinate optimization, telemetry synchronization, microsector
    analysis, and delta calculation to create a complete dataset ready for
    visualization with both drivers following the same reference trajectory.

    Args:
        driver1_data: First driver's raw telemetry data
        driver2_data: Second driver's raw telemetry data
        driver1_color: Hex color for first driver
        driver2_color: Hex color for second driver

    Returns:
        Dictionary containing circuit (with microsector colors), pilot1, pilot2, delta, and metadata
    """
    # Optimize circuit layout using driver1's coordinates as reference
    optimized_x, optimized_y, rotation, ratio = optimize_track_layout(
        driver1_data['x'],
        driver1_data['y']
    )

    # Both drivers will use the same optimized reference trajectory
    # No need to rotate driver2's coordinates separately
    driver1_optimized = {**driver1_data, 'x': optimized_x, 'y': optimized_y}
    driver2_optimized = driver2_data  # Keep original data for interpolation

    # Synchronize telemetry using reference trajectory
    sync_telem1, sync_telem2 = synchronize_telemetry(
        driver1_optimized,
        driver2_optimized,
        reference_x=optimized_x,
        reference_y=optimized_y
    )

    # Calculate time delta between drivers
    delta = calculate_delta_time(sync_telem1, sync_telem2)

    # Calculate microsector colors based on speed dominance
    microsector_colors = calculate_microsector_colors(
        sync_telem1,
        sync_telem2,
        driver1_color,
        driver2_color
    )

    comparison_data = {
        'circuit': {
            'x': optimized_x,
            'y': optimized_y,
            'colors': microsector_colors  # Colors for each point
        },
        'pilot1': {
            **sync_telem1,
            'color': driver1_color,
            'name': driver1_data.get('name', 'Driver 1'),
            'lap': driver1_data.get('lap', 0)
        },
        'pilot2': {
            **sync_telem2,
            'color': driver2_color,
            'name': driver2_data.get('name', 'Driver 2'),
            'lap': driver2_data.get('lap', 0)
        },
        'delta': delta,
        'metadata': {
            'rotation': rotation,
            'aspect_ratio': ratio
        }
    }

    return comparison_data
