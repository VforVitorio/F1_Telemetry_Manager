"""
Data selectors component for dashboard (Year, GP, Session, Drivers).
"""

import streamlit as st
from utils.data_loaders import load_gps_for_year, load_sessions_for_gp
from components.common.driver_colors import get_driver_color


def render_data_selectors():
    """
    Render the 4 data selectors (Year, GP, Session, Pilots).

    Returns:
        tuple: (selected_year, selected_gp, selected_session, selected_drivers, color_palette)
    """
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # Year selector - no default selection
        year_options = [None, 2024, 2023]
        selected_year = st.selectbox(
            "YEAR",
            options=year_options,
            index=0,
            format_func=lambda x: "-- Select Year --" if x is None else str(x)
        )

    with col2:
        # GP selector - only load if year is selected
        if selected_year is not None:
            gp_options = [None] + load_gps_for_year(selected_year)
        else:
            gp_options = [None]

        selected_gp = st.selectbox(
            "GP",
            options=gp_options,
            index=0,
            format_func=lambda x: "-- Select GP --" if x is None else x,
            disabled=selected_year is None
        )

        # Validate: China was not held in 2023
        if selected_year == 2023 and selected_gp == "Chinese Grand Prix":
            st.error(
                "⚠️ The Chinese Grand Prix was not held in the 2023 season. Please select another GP.")
            selected_gp = None

    with col3:
        # Session selector - only load if year and GP are selected
        if selected_year is not None and selected_gp is not None:
            session_options = [None] + \
                load_sessions_for_gp(selected_year, selected_gp)
        else:
            session_options = [None]

        selected_session = st.selectbox(
            "SESSION",
            options=session_options,
            index=0,
            format_func=lambda x: "-- Select Session --" if x is None else x,
            disabled=selected_year is None or selected_gp is None
        )

    with col4:
        # TODO: Replace with dynamic drivers based on selected year, GP, and session
        # drivers = fetch_drivers(selected_year, selected_gp, selected_session)
        # GET /api/v1/telemetry/drivers?year={year}&gp={gp}&session={session}

        # F1 2024 Complete driver lineup (24 drivers) - codes only
        driver_options = [
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
        ]

        selected_drivers = st.multiselect(
            "DRIVERS",
            options=driver_options,
            default=[],
            max_selections=3,
            disabled=selected_year is None or selected_gp is None or selected_session is None
        )

        # Get official team colors for selected drivers
        color_palette = [get_driver_color(code) for code in selected_drivers]

    return selected_year, selected_gp, selected_session, selected_drivers, color_palette
