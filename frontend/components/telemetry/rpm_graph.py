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


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>RPM</h3>",
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
    # Use mock data if no real data is available
    if telemetry_data is None or telemetry_data.empty:
        telemetry_data = _generate_mock_rpm_data(selected_drivers)

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


def _generate_mock_rpm_data(selected_drivers):
    """
    Generates mock RPM data for visualization testing.
    Simulates realistic F1 engine RPM patterns with gear changes.
    Sharp drops in RPM indicate gear shifts.
    """
    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Base RPM pattern following speed/gear changes
        # F1 engines typically run between 10,000-15,000 RPM
        rpm = 12000 + 2000 * np.sin(distance / 400) + \
            np.random.normal(0, 200, len(distance))

        # Add gear shift drops (sharp RPM decreases)
        # Gear shifts happen at various points around the circuit
        shift_points = [600, 900, 1300, 1900, 2200, 2800, 3100, 3900, 4400]

        for shift in shift_points:
            # RPM drops sharply during upshift, then climbs back up
            shift_effect = 2000 * np.exp(-((distance - shift) ** 2) / 5000)
            rpm -= shift_effect

        # Add corner effects (lower RPM in corners)
        corner_positions = [800, 1500, 2500, 3500, 4200]
        for corner in corner_positions:
            corner_effect = 1500 * np.exp(-((distance - corner) ** 2) / 30000)
            rpm -= corner_effect

        # Ensure realistic RPM range (10,000-15,000 RPM for modern F1)
        rpm = np.clip(rpm, 10000, 15000)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'rpm': rpm
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
