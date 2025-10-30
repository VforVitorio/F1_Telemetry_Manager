"""
RPM Graph Component

This component renders the Engine RPM graph for selected drivers.

Purpose:
    Show each driver's engine revolutions per minute across the circuit. It helps
    identify areas where RPM peaks occur, gear changes, and engine management techniques.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'rpm'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart (go.Scatter)
    - X axis: Distance on the circuit (meters)
    - Y axis: RPM (revolutions per minute)
    - Typically between 10,000 - 15,000 RPM for modern F1 engines
    - Sharp drops usually indicate gear changes

Public function:
    - render_rpm_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_rpm_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'RPM' (revolutions per minute)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>5: RPM</h3>",
        unsafe_allow_html=True
    )


def render_rmp_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the RPM graph for selected drivers
    """

    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, RPM columns
    # RPM is engine revolutions per minute (typically 10,000-15,000 for F1)

    # Show loading spinner if no data is available
    if telemetry_data is None or telemetry_data.empty:
        render_loading_spinner()
        return

    fig = _create_rpm_figure(telemetry_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _create_rpm_figure(telemetry_data, selected_drivers, color_palette):
    """
    Creates the Plotly figure for RPM visualization
    """

    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add a line trace for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data["driver"] == driver]

        if not driver_data.empty:
            # Create line chart showing engine RPM across the circuit
            # Sharp drops in RPM typically indicate gear changes
            fig.add_trace(
                go.Scatter(
                    x=driver_data["distance"],  # Distance along the circuit (from FastF1)
                    y=driver_data["rpm"],        # Engine RPM (from FastF1, typically 10k-15k)
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    mode="lines"
                )
            )

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="RPM",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified'  # Show all drivers' values when hovering
    )

    return fig
