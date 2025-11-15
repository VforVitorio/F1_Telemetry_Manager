"""
Driver Colors Configuration

Centralized color palette for F1 2024 drivers based on their team colors.
Each driver has a unique color that contrasts well with dark backgrounds.
"""

# Official F1 2024 Driver Colors
DRIVER_COLORS = {
    # Red Bull Racing (Blue)
    'VER': '#0600EF',  # Verstappen - Azul brillante
    'PER': '#3671C6',  # Pérez - Azul medio

    # Ferrari (Red)
    'LEC': '#DC0000',  # Leclerc - Rojo Ferrari brillante
    'SAI': '#FF6B6B',  # Sainz - Rojo coral/salmón

    # Mercedes (Silver)
    'HAM': '#C0C0C0',  # Hamilton - Plateado brillante
    'RUS': '#E8E8E8',  # Russell - Plateado claro

    # McLaren (Papaya Orange)
    'NOR': '#FF8700',  # Norris - Naranja McLaren
    'PIA': '#FFB347',  # Piastri - Naranja claro

    # Aston Martin (British Racing Green)
    'ALO': '#00665F',  # Alonso - Verde oscuro Aston
    'STR': '#2BA572',  # Stroll - Verde medio

    # Alpine (Pink)
    'GAS': '#FF87BC',  # Gasly - Rosa Alpine brillante
    'OCO': '#FFC0E3',  # Ocon - Rosa claro

    # Williams (Dark Blue)
    'ALB': '#041E42',  # Albon - Azul marino oscuro
    'SAR': '#1B4F91',  # Sargeant - Azul medio
    'COL': '#2E6DB5',  # Colapinto - Azul intermedio

    # RB/AlphaTauri (White/Silver)
    'TSU': '#FFFFFF',  # Tsunoda - Blanco puro
    'RIC': '#F5F5F5',  # Ricciardo - Blanco humo
    'LAW': '#DCDCDC',  # Lawson - Gris muy claro

    # Kick Sauber (Green)
    'BOT': '#52E252',  # Bottas - Verde brillante
    'ZHO': '#90EE90',  # Zhou - Verde lima claro

    # Haas (Grey)
    'MAG': '#787878',  # Magnussen - Gris medio
    'HUL': '#A8A8A8',  # Hülkenberg - Gris claro
    'BEA': '#959595',  # Bearman - Gris intermedio (Haas)

    # Reserve/Test Drivers
    'DOO': '#FFB0D3',  # Doohan - Rosa pastel (Alpine reserve)
}


def get_driver_color(driver_code: str, default: str = '#A259F7') -> str:
    """
    Get the color for a specific driver.

    Args:
        driver_code: Three-letter driver code (e.g., 'VER', 'HAM')
        default: Default color to return if driver not found (default: purple)

    Returns:
        Hex color string for the driver

    Example:
        >>> get_driver_color('VER')
        '#0600EF'
        >>> get_driver_color('HAM')
        '#C0C0C0'
        >>> get_driver_color('XXX')
        '#A259F7'
    """
    return DRIVER_COLORS.get(driver_code.upper(), default)


def get_driver_colors_for_list(driver_codes: list) -> list:
    """
    Get colors for a list of drivers.

    Args:
        driver_codes: List of driver codes

    Returns:
        List of hex color strings

    Example:
        >>> get_driver_colors_for_list(['VER', 'HAM', 'LEC'])
        ['#0600EF', '#C0C0C0', '#DC0000']
    """
    return [get_driver_color(code) for code in driver_codes]
