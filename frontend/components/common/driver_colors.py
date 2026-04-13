"""
Driver Colors Configuration

Year-aware color palette for F1 drivers based on their team colors.
Each driver gets the color of their team FOR THAT SEASON.
Covers 2023-2025 lineups.
"""

# -- Team base colors --
_RED_BULL = '#3671C6'
_RED_BULL_2 = '#1B3D8E'
_FERRARI = '#E8002D'
_FERRARI_2 = '#A30000'
_MERCEDES = '#27F4D2'
_MERCEDES_2 = '#6CD3BF'
_MCLAREN = '#FF8700'
_MCLAREN_2 = '#FFB347'
_ASTON = '#229971'
_ASTON_2 = '#2BA572'
_ALPINE_PINK = '#FF87BC'
_ALPINE_PINK_2 = '#FFC0E3'
_ALPINE_BLUE = '#0093CC'
_ALPINE_BLUE_2 = '#00B0F0'
_WILLIAMS = '#041E42'
_WILLIAMS_2 = '#64C4FF'
_RB = '#6692FF'
_RB_2 = '#4682B4'
_SAUBER = '#52E252'
_SAUBER_2 = '#00E701'
_HAAS = '#B6BABD'
_HAAS_2 = '#787878'

# -- Per-year driver → color mapping --
DRIVER_COLORS_BY_YEAR = {
    2025: {
        # Red Bull: VER + LAW
        'VER': _RED_BULL, 'LAW': _RED_BULL_2,
        # Ferrari: LEC + HAM
        'LEC': _FERRARI, 'HAM': _FERRARI_2,
        # Mercedes: RUS + ANT
        'RUS': _MERCEDES, 'ANT': _MERCEDES_2,
        # McLaren: NOR + PIA
        'NOR': _MCLAREN, 'PIA': _MCLAREN_2,
        # Aston Martin: ALO + STR
        'ALO': _ASTON, 'STR': _ASTON_2,
        # Alpine: GAS + DOO
        'GAS': _ALPINE_BLUE, 'DOO': _ALPINE_BLUE_2,
        # Williams: ALB + SAI
        'ALB': _WILLIAMS_2, 'SAI': _WILLIAMS,
        # Racing Bulls: TSU + HAD
        'TSU': _RB, 'HAD': _RB_2,
        # Sauber: HUL + BOR
        'HUL': _SAUBER, 'BOR': _SAUBER_2,
        # Haas: OCO + BEA
        'OCO': _HAAS, 'BEA': _HAAS_2,
    },
    2024: {
        # Red Bull: VER + PER
        'VER': _RED_BULL, 'PER': _RED_BULL_2,
        # Ferrari: LEC + SAI
        'LEC': _FERRARI, 'SAI': _FERRARI_2,
        # Mercedes: HAM + RUS
        'HAM': _MERCEDES, 'RUS': _MERCEDES_2,
        # McLaren: NOR + PIA
        'NOR': _MCLAREN, 'PIA': _MCLAREN_2,
        # Aston Martin: ALO + STR
        'ALO': _ASTON, 'STR': _ASTON_2,
        # Alpine: GAS + OCO
        'GAS': _ALPINE_PINK, 'OCO': _ALPINE_PINK_2,
        # Williams: ALB + SAR (+ COL mid-season)
        'ALB': _WILLIAMS_2, 'SAR': _WILLIAMS, 'COL': _WILLIAMS,
        # RB: TSU + RIC (+ LAW mid-season)
        'TSU': _RB, 'RIC': '#F5F5F5', 'LAW': _RB_2,
        # Sauber: BOT + ZHO
        'BOT': _SAUBER, 'ZHO': _SAUBER_2,
        # Haas: MAG + HUL (+ BEA sub)
        'MAG': _HAAS_2, 'HUL': _HAAS, 'BEA': _HAAS,
    },
    2023: {
        # Red Bull: VER + PER
        'VER': _RED_BULL, 'PER': _RED_BULL_2,
        # Ferrari: LEC + SAI
        'LEC': _FERRARI, 'SAI': _FERRARI_2,
        # Mercedes: HAM + RUS
        'HAM': _MERCEDES, 'RUS': _MERCEDES_2,
        # McLaren: NOR + PIA
        'NOR': _MCLAREN, 'PIA': _MCLAREN_2,
        # Aston Martin: ALO + STR
        'ALO': _ASTON, 'STR': _ASTON_2,
        # Alpine: GAS + OCO
        'GAS': _ALPINE_PINK, 'OCO': _ALPINE_PINK_2,
        # Williams: ALB + SAR
        'ALB': _WILLIAMS_2, 'SAR': _WILLIAMS,
        # AlphaTauri/RB: TSU + RIC (+ LAW sub)
        'TSU': _RB, 'RIC': '#F5F5F5', 'LAW': _RB_2,
        # Sauber: BOT + ZHO
        'BOT': _SAUBER, 'ZHO': _SAUBER_2,
        # Haas: MAG + HUL
        'MAG': _HAAS_2, 'HUL': _HAAS,
    },
}

# Flat fallback (defaults to 2025 colors)
DRIVER_COLORS = DRIVER_COLORS_BY_YEAR[2025]


def get_driver_color(driver_code: str, default: str = '#A259F7', year: int = None) -> str:
    """Get the team color for a driver in a specific season.

    Args:
        driver_code: Three-letter driver code (e.g., 'VER', 'HAM').
        default: Fallback color if driver not found.
        year: Season year. If None, uses the flat 2025 fallback.

    Returns:
        Hex color string for the driver's team that season.
    """
    code = driver_code.upper()
    if year and year in DRIVER_COLORS_BY_YEAR:
        return DRIVER_COLORS_BY_YEAR[year].get(code, default)
    return DRIVER_COLORS.get(code, default)


def get_driver_colors_for_list(driver_codes: list, year: int = None) -> list:
    """Get colors for a list of drivers in a specific season."""
    return [get_driver_color(code, year=year) for code in driver_codes]
