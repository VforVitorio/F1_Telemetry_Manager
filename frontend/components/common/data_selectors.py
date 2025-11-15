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


def render_comparison_data_selectors() -> Tuple[int, str, str, str, str]:
    """
    Render data selectors for comparison page (2 drivers, fastest laps only).

    Displays year, GP, session selectors, followed by two driver selectors.
    Only fastest laps will be compared.

    Returns:
        Tuple of (year, gp, session, driver1, driver2)
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

    col_driver1, col_driver2 = st.columns(2)

    with col_driver1:
        st.markdown("<h3 style='text-align: center;'>DRIVER 1</h3>",
                    unsafe_allow_html=True)
        driver1 = _render_driver_selector(
            year, gp, session, "Driver 1", "driver1_selector")

    with col_driver2:
        st.markdown("<h3 style='text-align: center;'>DRIVER 2</h3>",
                    unsafe_allow_html=True)
        driver2 = _render_driver_selector(
            year, gp, session, "Driver 2", "driver2_selector")

    return year, gp, session, driver1, driver2


def _render_year_selector() -> int:
    """
    Render year dropdown selector.

    Returns:
        Selected year as integer
    """
    # TODO: Replace with dynamic years from backend
    # years = fetch_available_years()  # GET /api/v1/telemetry/years
    year = st.selectbox(
        "YEAR",
        options=[2024, 2023, 2022, 2021, 2020],
        index=0,
        key="comparison_year_selector"
    )
    return year


def _render_gp_selector(year: int) -> str:
    """
    Render GP dropdown selector based on selected year.

    Args:
        year: Selected season year

    Returns:
        Selected GP name as string
    """
    # TODO: Replace with dynamic GPs based on selected year
    # gps = fetch_gps(year)  # GET /api/v1/telemetry/gps?year={year}
    gp = st.selectbox(
        "GP",
        options=["Bahrain", "Saudi Arabia", "Australia",
                 "Japan", "China", "Miami", "Monaco"],
        index=0,
        key="comparison_gp_selector"
    )
    return gp


def _render_session_selector(year: int, gp: str) -> str:
    """
    Render session dropdown selector based on selected year and GP.

    Args:
        year: Selected season year
        gp: Selected Grand Prix name

    Returns:
        Selected session type as string
    """
    # TODO: Replace with dynamic sessions based on selected year and GP
    # sessions = fetch_sessions(year, gp)  # GET /api/v1/telemetry/sessions?year={year}&gp={gp}
    session = st.selectbox(
        "SESSION",
        options=["FP1", "FP2", "FP3", "Q", "R"],
        index=4,
        key="comparison_session_selector"
    )
    return session


def _render_driver_selector(year: int, gp: str, session: str, label: str, key: str) -> str:
    """
    Render single driver dropdown selector.

    Args:
        year: Selected season year
        gp: Selected Grand Prix name
        session: Selected session type
        label: Label for the selector
        key: Unique key for the Streamlit widget

    Returns:
        Selected driver abbreviation as string
    """
    # TODO: Replace with dynamic drivers based on selected year, GP, and session
    # drivers = fetch_drivers(year, gp, session)
    # GET /api/v1/telemetry/drivers?year={year}&gp={gp}&session={session}

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
        index=0,
        key=key
    )
    return driver
