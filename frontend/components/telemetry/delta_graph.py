"""
Delta Graph Component

This component renders the Time Difference (Delta) graph between drivers.

Purpose:
    Display the accumulated time difference relative to the fastest driver at each
    point on the circuit. It helps identify where a driver gains or loses time.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'time'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart with filled area (go.Scatter with fill)
    - X axis: Distance on the circuit (meters)
    - Y axis: Time delta (seconds, relative to the fastest driver)
    - Negative values indicate faster than the reference
    - Positive values indicate slower than the reference

Public function:
    - render_delta_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _calculate_deltas(data, drivers) -> pd.DataFrame
    - _create_delta_figure(data, drivers, colors) -> go.Figure
"""

import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor, Font, FontSize

# TODO: When integrating backend, use fastf1.utils.delta_time() for accurate delta calculation
# from fastf1 import utils
# delta_time, ref_tel, compare_tel = utils.delta_time(reference_lap, compare_lap)


def render_delta_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the delta (time difference) graph for selected drivers
    """
    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # Use mock data if no real data is available
    if telemetry_data is None or telemetry_data.empty:
        telemetry_data = _generate_mock_delta_data(selected_drivers)

    delta_data = _calculate_deltas(telemetry_data, selected_drivers)
    fig = _create_delta_figure(delta_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>DELTA(s)</h3>",
        unsafe_allow_html=True
    )


def _calculate_deltas(telemetry_data, selected_drivers):
    """
    Calculates time delta for each driver relative to the fastest driver

    TODO: replace with fastf1.utils.delta_time() when backend is integrated.
    Currently performs manual calculation based on accumulated time
    """

    if telemetry_data is None or telemetry_data.empty:
        return pd.DataFrame()

    # Find fastes driver (reference) - driver with minimum final time

    reference_driver = None
    min_time = float("inf")

    for driver in selected_drivers:
        driver_data = telemetry_data[telemetry_data["driver"] == driver]
        if not driver_data.empty:
            final_time = driver_data["time"].max()
            if final_time < min_time:
                min_time = final_time
                reference_driver = driver
    # Calculate delta for each driver

    delta_data = []
    for driver in selected_drivers:
        driver_data = telemetry_data[telemetry_data['driver'] == driver].copy()
        ref_data = telemetry_data[telemetry_data['driver'] == reference_driver]

        # Interpolate reference time at same distance points
        # For now, simple calculation: delta = driver_time - reference_time
        driver_data['delta'] = driver_data['time'] - ref_data['time'].values
        delta_data.append(driver_data)

    return pd.concat(delta_data, ignore_index=True) if delta_data else pd.DataFrame()


def _create_delta_figure(delta_data, selected_drivers, color_palette):
    """Creates the Plotly figure for delta visualization with filled area"""
    fig = go.Figure()

    if delta_data.empty:
        return fig

    # Add a line trace with filled area for each driver
    for idx, driver in enumerate(selected_drivers):
        driver_data = delta_data[delta_data['driver'] == driver]

        if not driver_data.empty:
            fig.add_trace(go.Scatter(
                x=driver_data['distance'],
                y=driver_data['delta'],
                name=driver,
                line=dict(color=color_palette[idx], width=2),
                fill='tozeroy',
                fillcolor=f"rgba({int(color_palette[idx][1:3], 16)}, {int(color_palette[idx][3:5], 16)}, {int(color_palette[idx][5:7], 16)}, 0.3)",
                mode='lines'
            ))

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Time Delta (s)",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified'
    )

    # Add horizontal line at y=0 (reference)
    fig.add_hline(y=0, line_dash="dash", line_color="gray", opacity=0.5)

    return fig


def _generate_mock_delta_data(selected_drivers):
    """
    Generates mock telemetry data with time information for delta calculation.
    Simulates realistic F1 lap time progression with driver variations.
    """
    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for idx, driver in enumerate(selected_drivers):
        # Base time progression (cumulative time)
        # Slower drivers have slightly higher time values
        # Driver 1: 90s, Driver 2: 90.3s, Driver 3: 90.6s
        base_lap_time = 90.0 + (idx * 0.3)

        # Linear time progression with some variation
        time = np.linspace(0, base_lap_time, len(distance))

        # Add realistic time variations (some drivers faster in some sectors)
        time_variation = 0.1 * \
            np.sin(distance / 1000 + idx) + \
            np.random.normal(0, 0.02, len(distance))
        time += np.cumsum(time_variation)

        # Ensure monotonic increase (time only goes forward)
        time = np.maximum.accumulate(time)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'time': time
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
