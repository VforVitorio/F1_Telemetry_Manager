"""
Brake Graph Component

This component renders the Brake graph for selected drivers.

Purpose:
    Show each driver's braking zones across the circuit. It helps identify
    brake points, braking intensity, and compare braking techniques between drivers.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'brake'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Filled area chart (go.Scatter with fill='tozeroy')
    - X axis: Distance on the circuit (meters)
    - Y axis: Brake (0-100% or boolean 0/1 depending on FastF1 data)
    - Filled area indicates zones where brakes are applied
    - Height indicates braking intensity

Public function:
    - render_brake_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_brake_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'Brake' (boolean or 0-100%)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def _render_section_title() -> None:
    """
    Renders the section title
    """
    st.markdown(
        "<h3 style='text-align: center;'> BRAKE (%) </h3>",
        unsafe_allow_html=True
    )


def render_brake_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the brake graph for selected drivers
    """

    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, Brake columns
    # Brake can be boolean (0/1) or percentage (0-100%) depending on FastF1 data

    # Show loading spinner if no data is available
    if telemetry_data is None or telemetry_data.empty:
        render_loading_spinner()
        return

    fig = _create_brake_figure(telemetry_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _create_brake_figure(telemetry_data, selected_drivers, color_palette):
    """
    Creates the Plotly figure for brake visualization with filled area
    """

    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add a line trace with filled area for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data["driver"] == driver]

        if not driver_data.empty:
            # Create filled area chart showing braking zones
            # Fill from 0 to brake value to visualize where and how hard drivers brake
            fig.add_trace(
                go.Scatter(
                    x=driver_data["distance"],  # Distance along the circuit (from FastF1)
                    y=driver_data["brake"],      # Brake input: boolean (0/1) or percentage (0-100%) (from FastF1)
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    fill="tozeroy",  # Fill area from zero to the brake line
                    # Convert hex color to rgba with transparency for filled area
                    fillcolor=f"rgba({int(color_palette[idx][1:3], 16)}, {int(color_palette[idx][3:5], 16)}, {int(color_palette[idx][5:7], 16)}, 0.3)",
                    mode='lines'
                )
            )

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Brake",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified'  # Show all drivers' values when hovering
    )

    return fig
