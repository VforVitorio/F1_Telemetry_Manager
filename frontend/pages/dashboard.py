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
import plotly.graph_objects as go

# Project imports
from app.styles import GLOBAL_CSS, Color, TextColor
from components.telemetry.circuit_analysis import render_circuit_analysis_section
from components.telemetry.speed_graph import render_speed_graph
from components.telemetry.delta_graph import render_delta_graph
from components.common.chart_styles import apply_telemetry_chart_styles
# TODO: Import telemetry service when backend is ready
# from services.telemetry_service import fetch_available_years, fetch_gps, fetch_sessions, fetch_drivers, fetch_lap_data


def render_custom_css():
    """
    Apply custom CSS for multiselect driver pills with colors.
    """
    st.markdown("""
        <style>
        /* First selected driver - Purple */
        div[data-baseweb="tag"] {
            background-color: #A259F7 !important;
            color: white !important;
        }
        /* Second selected driver - Blue */
        div[data-baseweb="tag"]:nth-of-type(2) {
            background-color: #00B4D8 !important;
        }
        /* Third selected driver - Green */
        div[data-baseweb="tag"]:nth-of-type(3) {
            background-color: #43FF64 !important;
            color: black !important;
        }
        </style>
    """, unsafe_allow_html=True)


def render_header():
    """
    Display page header.
    """
    st.markdown("<h1 style='text-align: center;'>F1 TELEMETRY MANAGER</h1>",
                unsafe_allow_html=True)
    st.markdown("---")


def render_data_selectors():
    """
    Render the 4 data selectors (Year, GP, Session, Pilots).

    Returns:
        tuple: (selected_year, selected_gp, selected_session, selected_drivers, color_palette)
    """
    # TODO: Replace hardcoded data with backend calls
    # years = fetch_available_years()  # GET /api/v1/telemetry/years
    # Use cached data if available to avoid repeated API calls

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # TODO: Replace with dynamic years from backend
        # selected_year = st.selectbox("YEAR", options=years, index=0)
        selected_year = st.selectbox(
            "YEAR",
            options=[2024, 2023, 2022, 2021, 2020],
            index=0
        )

    with col2:
        # TODO: Replace with dynamic GPs based on selected year
        # gps = fetch_gps(selected_year)  # GET /api/v1/telemetry/gps?year={year}
        # selected_gp = st.selectbox("GP", options=gps, index=0)
        selected_gp = st.selectbox(
            "GP",
            options=["Bahrain", "Saudi Arabia", "Australia", "Japan", "China"],
            index=0
        )

    with col3:
        # TODO: Replace with dynamic sessions based on selected year and GP
        # sessions = fetch_sessions(selected_year, selected_gp)  # GET /api/v1/telemetry/sessions?year={year}&gp={gp}
        # selected_session = st.selectbox("SESSION", options=sessions, index=0)
        selected_session = st.selectbox(
            "SESSION",
            options=["FP1", "FP2", "FP3", "Q", "R"],
            index=4
        )

    with col4:
        # Driver multiselect with color palette
        color_palette = ['#A259F7', '#00B4D8', '#43FF64']

        # TODO: Replace with dynamic drivers based on selected year, GP, and session
        # drivers = fetch_drivers(selected_year, selected_gp, selected_session)
        # GET /api/v1/telemetry/drivers?year={year}&gp={gp}&session={session}
        # driver_options = [f"Driver {d['number']} - {d['name']}" for d in drivers]
        driver_options = ["Driver 1", "Driver 44",
                          "Driver 55", "Driver 63", "Driver 16"]

        selected_drivers = st.multiselect(
            "DRIVERS",
            options=driver_options,
            default=["Driver 44"],
            max_selections=3
        )

    return selected_year, selected_gp, selected_session, selected_drivers, color_palette


def render_lap_graph(selected_drivers, color_palette):
    """
    Display lap time graph with Plotly.

    Args:
        selected_drivers (list): List of selected driver identifiers
        color_palette (list): List of colors for each driver
    """
    st.markdown("<h2 style='text-align: center;'>LAP CHART</h2>",
                unsafe_allow_html=True)

    # TODO: Fetch real lap data from backend
    # lap_data = fetch_lap_data(selected_year, selected_gp, selected_session, selected_drivers)
    # GET /api/v1/telemetry/laps?year={year}&gp={gp}&session={session}&drivers={drivers}

    # Create empty Plotly figure (placeholder)
    fig = go.Figure()

    # TODO: Replace placeholder data with real lap times from backend
    # for idx, driver in enumerate(selected_drivers):
    #     driver_data = lap_data[lap_data['driver'] == driver]
    #     fig.add_trace(go.Scatter(
    #         x=driver_data['lap_number'],
    #         y=driver_data['lap_time'],
    #         mode='lines+markers',
    #         name=driver,
    #         line=dict(color=color_palette[idx % len(color_palette)], width=2),
    #         marker=dict(size=6)
    #     ))

    # Add placeholder data for visualization
    fig.add_trace(go.Scatter(
        x=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        y=[92.5, 91.8, 91.2, 90.9, 91.5, 90.7, 91.1, 90.8, 91.3, 90.6],
        mode='lines+markers',
        name='Driver 44',
        line=dict(color=color_palette[0], width=2),
        marker=dict(size=6)
    ))

    # Configure layout
    fig.update_layout(
        xaxis_title="time",
        yaxis_title="lap time",
        template="plotly_dark",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        showlegend=True
    )

    st.plotly_chart(fig, use_container_width=True)


def render_control_buttons():
    """
    Display control buttons below the graph.
    """
    btn_col1, btn_col2, btn_col3 = st.columns(3)

    with btn_col1:
        # TODO: Implement fastest lap selection logic
        # When clicked, highlight the fastest lap on the graph and update visualization
        show_fastest = st.button(
            "CLICK TO SELECT FASTEST LAP", use_container_width=True)
        # if show_fastest:
        #     fastest_lap = lap_data['lap_time'].idxmin()
        #     # Update graph to highlight fastest lap

    with btn_col2:
        # TODO: Implement outliers detection and display logic
        # Use statistical methods (e.g., IQR, Z-score) to identify outliers
        show_outliers = st.button("SHOW OUTLIERS", use_container_width=True)
        # if show_outliers:
        #     outliers = detect_outliers(lap_data)
        #     # Update graph to show/hide outliers

    with btn_col3:
        # TODO: Implement invalid laps filtering logic
        # Invalid laps = laps with PitIn/PitOut, yellow flags, etc.
        show_invalid = st.button("SHOW INVALID LAPS", use_container_width=True)
        # if show_invalid:
        #     invalid_laps = lap_data[lap_data['is_valid'] == False]
        #     # Update graph to show/hide invalid laps


def render_dashboard():
    """
    Main dashboard rendering function.
    Orchestrates all dashboard components in sequence.
    """
    render_custom_css()
    render_header()
    selected_year, selected_gp, selected_session, selected_drivers, color_palette = render_data_selectors()
    render_lap_graph(selected_drivers, color_palette)
    render_control_buttons()

    # Apply purple border styling to all subsequent Plotly charts
    # (This won't affect the LAP CHART above, only charts rendered after this point)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    # Circuit Analysis Section
    render_circuit_analysis_section()

    # TODO: Fetch telemetry data from backend
    # telemetry_data = fetch_telemetry_data(selected_year, selected_gp, selected_session, selected_drivers)
    telemetry_data = None  # Placeholder until backend is ready

    # Other Graphs Section (stacked vertically)
    render_speed_graph(telemetry_data, selected_drivers, color_palette)
    render_delta_graph(telemetry_data, selected_drivers, color_palette)
