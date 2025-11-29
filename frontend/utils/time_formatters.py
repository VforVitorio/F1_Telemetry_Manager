"""
Time formatting utilities for lap times and telemetry data.
"""


def format_laptime_axis(seconds):
    """
    Convert seconds to MM:SS format for axis labels.

    Args:
        seconds (float): Time in seconds

    Returns:
        str: Formatted time string (e.g., "1:23")
    """
    minutes = int(seconds // 60)
    remaining_seconds = int(seconds % 60)
    return f"{minutes}:{remaining_seconds:02d}"


def get_tyre_emoji(compound: str) -> str:
    """
    Get emoji representation for tyre compound.

    Args:
        compound: Tyre compound name (soft, medium, hard, intermediate, wet)

    Returns:
        Emoji string
    """
    compound_lower = compound.lower() if compound else 'unknown'

    emoji_map = {
        'soft': '🔴',      # Red circle for soft
        'medium': '🟡',    # Yellow circle for medium
        'hard': '⚪',      # White circle for hard
        'intermediate': '🟢',  # Green circle for intermediate
        'inter': '🟢',     # Alternative name
        'wet': '🔵'        # Blue circle for wet
    }

    return emoji_map.get(compound_lower, '⚫')  # Black circle for unknown
