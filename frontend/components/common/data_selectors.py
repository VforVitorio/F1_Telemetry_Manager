"""
Data Selectors Component

Reusable component for Year, GP, Session, and Drivers selection.
Used in dashboard and comparison pages.
"""

import streamlit as st
from typing import Tuple, List, Optional


def render_comparison_data_selectors() -> Tuple[int, str, str, str, str, int, int]:
    """
    Render data selectors for comparison page (2 drivers, 2 laps).

    Displays year, GP, session selectors, followed by two driver selectors
    and their corresponding lap number inputs.

    Returns:
        Tuple of (year, gp, session, driver1, driver2, lap1, lap2)
    """
    col1, col2, col3 = st.columns(3)

    with col1:
        year = _render_year_selector()

    with col2:
        gp = _render_gp_selector(year)

    with col3:
        session = _render_session_selector(year, gp)

    st.markdown("---")

    col_driver1, col_driver2 = st.columns(2)

    with col_driver1:
        st.markdown("<h3 style='text-align: center;'>DRIVER 1</h3>",
                    unsafe_allow_html=True)
        driver1 = _render_driver_selector(
            year, gp, session, "Driver 1", "driver1_selector")
        lap1 = _render_lap_selector(driver1, "Lap Number", "lap1_input")

    with col_driver2:
        st.markdown("<h3 style='text-align: center;'>DRIVER 2</h3>",
                    unsafe_allow_html=True)
        driver2 = _render_driver_selector(
            year, gp, session, "Driver 2", "driver2_selector")
        lap2 = _render_lap_selector(driver2, "Lap Number", "lap2_input")

    return year, gp, session, driver1, driver2, lap1, lap2


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
    driver = st.selectbox(
        label,
        options=["VER", "HAM", "LEC", "NOR", "PER",
                 "SAI", "RUS", "ALO", "OCO", "GAS"],
        index=0,
        key=key
    )
    return driver


def _render_lap_selector(driver: str, label: str, key: str) -> int:
    """
    Render lap number input field.

    Args:
        driver: Selected driver abbreviation
        label: Label for the input field
        key: Unique key for the Streamlit widget

    Returns:
        Selected lap number as integer
    """
    # TODO: Replace with dynamic lap range based on driver's available laps
    # max_lap = fetch_driver_max_lap(year, gp, session, driver)
    lap = st.number_input(
        label,
        min_value=1,
        max_value=100,
        value=1,
        step=1,
        key=key
    )
    return lap
