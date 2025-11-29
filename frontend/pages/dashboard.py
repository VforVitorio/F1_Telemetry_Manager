"""
Dashboard page - Lap Chart visualization.
Displays data selectors, lap time graphs, and control buttons.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

# Standard library imports
import streamlit as st
import importlib

# Project imports
from components.telemetry.circuit_domination import render_circuit_domination_section
from components.telemetry.speed_graph import render_speed_graph
from components.telemetry.delta_graph import render_delta_graph
from components.telemetry.throttle_graph import render_throttle_graph
from components.telemetry.brake_graph import render_brake_graph
from components.telemetry.rpm_graph import render_rmp_graph
from components.telemetry.gear_graph import render_gear_graph
from components.telemetry.drs_graph import render_drs_graph
from components.common.chart_styles import apply_telemetry_chart_styles
from components.common.link_button import render_link_button

# Dashboard-specific components
from components.dashboard.css_styles import render_custom_css, apply_driver_pill_colors
from components.dashboard.data_selectors import render_data_selectors
from components.dashboard.lap_graph import render_lap_graph, render_control_buttons

import services.telemetry_service
importlib.reload(services.telemetry_service)


def render_header():
    """
    Display page header.
    """
    st.markdown("<h1 style='text-align: center;'>F1 TELEMETRY MANAGER</h1>",
                unsafe_allow_html=True)
    st.markdown("---")


def render_dashboard():
    """
    Main dashboard rendering function.
    Orchestrates all dashboard components in sequence.
    """
    # Early return if navigating away to avoid unnecessary API calls and rendering
    if st.session_state.get('current_page') == 'comparison':
        return  # Don't render dashboard, let main.py handle routing

    render_custom_css()
    render_header()
    selected_year, selected_gp, selected_session, selected_drivers, color_palette = render_data_selectors()

    # Apply colors to driver pills based on selection (must be after selectors)
    apply_driver_pill_colors(selected_drivers)

    lap_times_data = render_lap_graph(selected_year, selected_gp,
                                       selected_session, selected_drivers, color_palette,
                                       render_buttons=True)

    # Apply purple border styling to all subsequent Plotly charts
    # (This won't affect the LAP CHART above, only charts rendered after this point)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    # NOTE: Auto-load of fastest laps has been disabled
    # Users must manually select laps to view telemetry graphs

    # Get telemetry data from session state if available
    # Use new multi-driver telemetry format
    telemetry_data_multi = st.session_state.get('telemetry_data_multi', None)

    # Always render telemetry graphs (they show spinner when no data)
    # Circuit Domination Section
    # Note: Circuit domination uses a single reference driver for now
    # We pass the first driver's telemetry if available
    first_driver_telemetry = None
    if telemetry_data_multi and selected_drivers:
        first_driver = selected_drivers[0]
        first_driver_telemetry = telemetry_data_multi.get(first_driver)

    render_circuit_domination_section(
        first_driver_telemetry,
        selected_drivers,
        color_palette,
        selected_year,
        selected_gp,
        selected_session
    )

    # Link button to comparison page
    st.markdown("---")
    render_link_button(
        text="If you want to compare the lap progress between your 2 selected drivers, click here",
        target_page="comparison",
        button_text="⚖️ GO TO COMPARISON"
    )

    # Other Graphs Section (stacked vertically)
    # These graphs will display telemetry data for all selected drivers
    # When telemetry_data_multi is None, graphs show their internal "waiting for data" spinner
    render_speed_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_delta_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_throttle_graph(telemetry_data_multi,
                          selected_drivers, color_palette)
    render_brake_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_rmp_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_gear_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_drs_graph(telemetry_data_multi, selected_drivers, color_palette)
