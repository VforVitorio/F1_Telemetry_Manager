"""
DRS Graph Component

This component renders the DRS (Drag Reduction System) graph for selected drivers.

Purpose:
    Show the areas where each driver activates DRS (reducing aerodynamic drag). It
    helps identify circuit DRS zones and compare DRS usage between drivers.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'drs'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Area chart or horizontal bars (go.Scatter with fill or go.Bar)
    - X axis: Distance on the circuit (meters)
    - Y axis: DRS state (0 = closed, >0 or 1 = open)
    - FastF1 values:
      * 0-7: DRS closed
      * 8-14: DRS open
    - Can be binarized: 0 = closed, 1 = open
    - Filled area indicates zones with active DRS

Public function:
    - render_drs_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _process_drs_data(data) -> pd.DataFrame
    - _create_drs_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'DRS' (0-7=closed, 8-14=open, binarize to 0/1)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor, Font, FontSize
from components.common.loading import render_loading_spinner


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>7: DRS</h3>",
        unsafe_allow_html=True
    )


def _process_drs_data(telemetry_data):
    """
    Processes DRS data by binarizing values

    FastF1 DRS values: 0-7 = closed, 8-14 = open
    Converts to: 0 = closed, 1 = open
    """
    processed_data = telemetry_data.copy()
    processed_data['drs'] = (processed_data['drs'] >= 8).astype(int)
    return processed_data


def render_drs_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the DRS graph for selected drivers
    """
    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, DRS columns
    # DRS values from FastF1: 0-7 = closed, 8-14 = open (binarized to 0/1)

    # Show loading spinner if no data is available
    if telemetry_data is None or telemetry_data.empty:
        render_loading_spinner()
        return

    processed_data = _process_drs_data(telemetry_data)
    fig = _create_drs_figure(processed_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _create_drs_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for DRS visualization with filled area"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add a line trace with filled area for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data['driver'] == driver]

        if not driver_data.empty:
            # Create filled area chart showing DRS activation zones
            # Fill indicates where DRS is active (open)
            fig.add_trace(go.Scatter(
                x=driver_data['distance'],  # Distance along the circuit (from FastF1)
                y=driver_data['drs'],        # DRS state: 0 = closed, 1 = open (processed from FastF1)
                name=driver,
                line=dict(color=color_palette[idx], width=2),
                fill='tozeroy',  # Fill area from zero to the line
                # Convert hex color to rgba with transparency for filled area
                fillcolor=f"rgba({int(color_palette[idx][1:3], 16)}, {int(color_palette[idx][3:5], 16)}, {int(color_palette[idx][5:7], 16)}, 0.3)",
                mode='lines'
            ))

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="DRS State",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified',  # Show all drivers' values when hovering
        yaxis=dict(
            tickmode='array',
            tickvals=[0, 1],
            ticktext=['Closed', 'Open']  # Human-readable labels for DRS states
        )
    )

    return fig
