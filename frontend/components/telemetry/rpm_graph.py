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
        "<h3 style='text-align: center;'>RPM</h3>",
        unsafe_allow_html=True
    )


def render_rmp_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the RPM graph for selected drivers.
    Shows telemetry data when a lap is selected.
    """
    st.markdown("---")
    _render_section_title()

    # Convert telemetry_data to DataFrame format if it's a dict from the API
    if telemetry_data is not None and isinstance(telemetry_data, dict):
        # Check if we have the required data
        if 'distance' in telemetry_data and 'rpm' in telemetry_data:
            driver = telemetry_data.get('driver', 'Unknown')
            distance = telemetry_data.get('distance', [])
            rpm = telemetry_data.get('rpm', [])

            # Convert to DataFrame
            df_data = pd.DataFrame({
                'driver': [driver] * len(distance),
                'distance': distance,
                'rpm': rpm
            })

            # Get driver color
            from components.common.driver_colors import get_driver_color
            driver_color = get_driver_color(driver)

            fig = _create_rpm_figure(df_data, [driver], [driver_color])
            st.plotly_chart(fig, use_container_width=True)
        else:
            render_loading_spinner()
    else:
        # Show loading spinner when no data is selected
        render_loading_spinner()


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
                    # Distance along the circuit (from FastF1)
                    x=driver_data["distance"],
                    # Engine RPM (from FastF1, typically 10k-15k)
                    y=driver_data["rpm"],
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    mode="lines",
                    hovertemplate='Distance: %{x:.0f}m<br>RPM: %{y:.0f}<extra></extra>'
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
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'rpm'])

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
