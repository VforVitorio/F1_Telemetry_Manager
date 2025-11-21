"""
Data Selectors Component

Reusable component for Year, GP, Session, and Drivers selection.
Used in dashboard and comparison pages.
"""

import streamlit as st
from typing import Tuple, List, Optional
from components.common.driver_colors import DRIVER_COLORS


def _inject_driver_colors_css():
    """
    Inject custom CSS to color driver options in selectboxes.
    """
    # Generate CSS rules for each driver
    css_rules = []
    for driver_code, color in DRIVER_COLORS.items():
        css_rules.append(f"""
        option[value="{driver_code}"] {{
            color: {color} !important;
            font-weight: bold;
        }}
        """)

    css = f"""
    <style>
    /* Color driver options in selectboxes */
    {' '.join(css_rules)}

    /* Style selectbox to show driver colors */
    div[data-baseweb="select"] span {{
        font-weight: 600;
    }}
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)


def render_comparison_data_selectors() -> Tuple[Optional[int], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Render data selectors for comparison page (2 drivers, fastest laps only).

    Displays year, GP, session selectors, followed by a multiselect for choosing 2 drivers.
    Only fastest laps will be compared.

    Returns:
        Tuple of (year, gp, session, driver1, driver2), any can be None if not selected
    """
    # Inject CSS to color driver names
    _inject_driver_colors_css()

    col1, col2, col3 = st.columns(3)

    with col1:
        year = _render_year_selector()

    with col2:
        gp = _render_gp_selector(year)

    with col3:
        session = _render_session_selector(year, gp)

    st.markdown("---")

    # Info message about fastest laps
    st.info("🏁 Only fastest laps will be compared for each driver")

    # Title outside columns so it doesn't wrap
    st.markdown("<h3 style='text-align: center;'>SELECT 2 DRIVERS</h3>",
                unsafe_allow_html=True)

    # Center column for driver multiselect (narrower)
    col_left, col_center, col_right = st.columns([2, 1, 2])

    with col_center:
        # F1 2024 Complete driver lineup (24 drivers)
        selected_drivers = st.multiselect(
            "Drivers",
            options=[
                "VER", "PER",  # Red Bull
                "LEC", "SAI",  # Ferrari
                "HAM", "RUS",  # Mercedes
                "NOR", "PIA",  # McLaren
                "ALO", "STR",  # Aston Martin
                "GAS", "OCO",  # Alpine
                "ALB", "COL", "SAR",  # Williams
                "TSU", "RIC", "LAW",  # RB
                "BOT", "ZHO",  # Sauber
                "MAG", "HUL", "BEA",  # Haas
                "DOO",  # Reserve/Test
            ],
            max_selections=2,
            placeholder="Select exactly 2 drivers to compare",
            key="comparison_drivers_multiselect",
            label_visibility="collapsed"
        )

    # Extract driver1 and driver2 from the multiselect
    driver1 = selected_drivers[0] if len(selected_drivers) > 0 else None
    driver2 = selected_drivers[1] if len(selected_drivers) > 1 else None

    return year, gp, session, driver1, driver2


def _render_year_selector() -> Optional[int]:
    """
    Render year dropdown selector with placeholder.

    Returns:
        Selected year as integer or None if not selected
    """
    # TODO: Replace with dynamic years from backend
    # years = fetch_available_years()  # GET /api/v1/telemetry/years
    year = st.selectbox(
        "YEAR",
        options=[2024, 2023],
        index=None,
        placeholder="Select Season",
        key="comparison_year_selector"
    )
    return year


def _render_gp_selector(year: Optional[int]) -> Optional[str]:
    """
    Render GP dropdown selector based on selected year.

    Args:
        year: Selected season year (can be None)

    Returns:
        Selected GP name as string or None if not selected
    """
    # TODO: Replace with dynamic GPs from backend using FastF1's get_event_schedule()
    # Example backend implementation:
    #   - Backend endpoint: GET /api/v1/telemetry/gps?year={year}
    #   - Uses: fastf1.get_event_schedule(year) to get all events dynamically
    #   - Returns list of GP names and validates availability per season
    # Frontend would call: gps = fetch_gps(year)

    # Full 2024 F1 Calendar (in chronological order) - HARDCODED for now
    gp = st.selectbox(
        "GP",
        options=[
            "Bahrain",           # Sakhir
            "Saudi Arabia",      # Jeddah Street Circuit
            "Australia",         # Albert Park (Melbourne)
            "Japan",             # Suzuka
            "China",             # Shanghai International Circuit
            "Miami",             # Miami International Autodrome
            "Emilia Romagna",    # Imola
            "Monaco",            # Circuit de Monaco
            "Canada",            # Circuit Gilles Villeneuve (Montreal)
            "Spain",             # Circuit de Barcelona-Catalunya
            "Austria",           # Red Bull Ring (Spielberg)
            "Britain",           # Silverstone
            "Hungary",           # Hungaroring (Budapest)
            "Belgium",           # Spa-Francorchamps
            "Netherlands",       # Circuit Zandvoort
            "Italy",             # Monza
            "Azerbaijan",        # Baku City Circuit
            "Singapore",         # Marina Bay Street Circuit
            "United States",     # Circuit of the Americas (COTA, Austin)
            "Mexico",            # Autódromo Hermanos Rodríguez (Ciudad de México)
            "Brazil",            # Autódromo José Carlos Pace (Interlagos, São Paulo)
            "Las Vegas",         # Las Vegas Strip Circuit
            "Qatar",             # Lusail International Circuit
            "Abu Dhabi",         # Yas Marina
        ],
        index=None,
        placeholder="Select GP",
        key="comparison_gp_selector"
    )

    # Validate: China was not held in 2023
    if year == 2023 and gp == "China":
        st.error("⚠️ The Chinese Grand Prix was not held in the 2023 season. Please select another GP.")
        return None

    return gp


def _render_session_selector(year: Optional[int], gp: Optional[str]) -> Optional[str]:
    """
    Render session dropdown selector based on selected year and GP.

    Args:
        year: Selected season year (can be None)
        gp: Selected Grand Prix name (can be None)

    Returns:
        Selected session type as string or None if not selected
    """
    # TODO: Replace with dynamic sessions based on selected year and GP
    # sessions = fetch_sessions(year, gp)  # GET /api/v1/telemetry/sessions?year={year}&gp={gp}
    session = st.selectbox(
        "SESSION",
        options=["FP1", "FP2", "FP3", "Q", "R"],
        index=None,
        placeholder="Select Session",
        key="comparison_session_selector"
    )
    return session


def _render_driver_selector(year: Optional[int], gp: Optional[str], session: Optional[str], label: str, key: str) -> Optional[str]:
    """
    Render single driver dropdown selector with placeholder.

    Args:
        year: Selected season year (can be None)
        gp: Selected Grand Prix name (can be None)
        session: Selected session type (can be None)
        label: Label for the selector
        key: Unique key for the Streamlit widget

    Returns:
        Selected driver abbreviation as string or None if not selected
    """
    # TODO: Replace with dynamic drivers based on selected year, GP, and session
    # drivers = fetch_drivers(year, gp, session)
    # GET /api/v1/telemetry/drivers?year={year}&gp={gp}&session={session}

    # Determine placeholder based on which driver selector this is
    placeholder = "Select First Driver" if "driver1" in key else "Select Second Driver"

    # F1 2024 Complete driver lineup (24 drivers)
    driver = st.selectbox(
        label,
        options=[
            "VER", "PER",  # Red Bull
            "LEC", "SAI",  # Ferrari
            "HAM", "RUS",  # Mercedes
            "NOR", "PIA",  # McLaren
            "ALO", "STR",  # Aston Martin
            "GAS", "OCO",  # Alpine
            "ALB", "COL", "SAR",  # Williams
            "TSU", "RIC", "LAW",  # RB
            "BOT", "ZHO",  # Sauber
            "MAG", "HUL", "BEA",  # Haas
            "DOO",  # Reserve/Test
        ],
        index=None,
        placeholder=placeholder,
        key=key
    )
    return driver
