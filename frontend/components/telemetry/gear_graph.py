"""
Gear Graph Component

This component renders the Gear graph for selected drivers.

Purpose:
    Show the gear used by each driver at each point on the circuit. It allows
    comparing gear selection between drivers and identifying differences in driving technique.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'gear'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Step/stairstep chart (go.Scatter with line_shape='hv' or 'vh')
    - X axis: Distance on the circuit (meters)
    - Y axis: Gear number (1-8)
    - Discrete values: 1, 2, 3, 4, 5, 6, 7, 8
    - Horizontal lines with vertical transitions (step plot)

Public function:
    - render_gear_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_gear_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'nGear' (gear number 1-8)
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
        "<h3 style='text-align: center;'>6: GEAR</h3>",
        unsafe_allow_html=True
    )


def render_gear_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the gear graph for selected drivers
    """
    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, nGear columns
    # nGear is the gear number: 1-8 (discrete values)

    # Show loading spinner if no data is available
    if telemetry_data is None or telemetry_data.empty:
        render_loading_spinner()
        return

    fig = _create_gear_figure(telemetry_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _create_gear_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for gear visualization with step plot"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add a step line trace for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data['driver'] == driver]

        if not driver_data.empty:
            # Create step plot showing gear selection across the circuit
            # 'hv' shape creates horizontal-then-vertical steps (stairstep pattern)
            fig.add_trace(go.Scatter(
                x=driver_data['distance'],  # Distance along the circuit (from FastF1)
                y=driver_data['gear'],       # Gear number: 1-8 (from FastF1 nGear column)
                name=driver,
                line=dict(color=color_palette[idx], width=2, shape='hv'),  # Step plot
                mode='lines'
            ))

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Gear",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified',  # Show all drivers' values when hovering
        yaxis=dict(
            tickmode='linear',  # Show every gear number
            tick0=1,            # Start at gear 1
            dtick=1             # Show ticks for each gear (1, 2, 3, ...)
        )
    )

    return fig
