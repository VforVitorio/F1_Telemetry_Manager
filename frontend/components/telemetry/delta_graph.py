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
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner

# TODO: When integrating backend, use fastf1.utils.delta_time() for accurate delta calculation
# from fastf1 import utils
# delta_time, ref_tel, compare_tel = utils.delta_time(reference_lap, compare_lap)


def render_delta_graph(telemetry_data_multi, selected_drivers, color_palette):
    """
    Renders the delta (time difference) graph for selected drivers.
    Compares time deltas relative to the fastest driver.

    Args:
        telemetry_data_multi: Dict with driver codes as keys and telemetry data as values
        selected_drivers: List of driver codes
        color_palette: List of colors for each driver
    """
    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # Convert multi-driver telemetry data to DataFrame format
    if telemetry_data_multi is not None and isinstance(telemetry_data_multi, dict) and telemetry_data_multi:
        # Check if we have at least 2 drivers for comparison
        if len(telemetry_data_multi) < 2:
            st.info("👆 Delta comparison requires at least 2 drivers' telemetry. Select and load multiple drivers.")
            return

        df_list = []
        drivers_with_data = []
        colors_with_data = []

        for idx, driver in enumerate(selected_drivers):
            if driver in telemetry_data_multi:
                driver_telemetry = telemetry_data_multi[driver]

                # Check if we have the required data (time and distance)
                if 'distance' in driver_telemetry and 'time' in driver_telemetry:
                    distance = driver_telemetry.get('distance', [])
                    time = driver_telemetry.get('time', [])

                    # Convert to DataFrame
                    df_data = pd.DataFrame({
                        'driver': [driver] * len(distance),
                        'distance': distance,
                        'time': time
                    })
                    df_list.append(df_data)
                    drivers_with_data.append(driver)
                    if idx < len(color_palette):
                        colors_with_data.append(color_palette[idx])

        if df_list and len(df_list) >= 2:
            # Combine all driver data
            combined_df = pd.concat(df_list, ignore_index=True)

            # Calculate deltas relative to fastest driver
            delta_df = _calculate_deltas(combined_df, drivers_with_data)

            if not delta_df.empty:
                fig = _create_delta_figure(delta_df, drivers_with_data, colors_with_data)
                st.plotly_chart(fig, use_container_width=True)
            else:
                render_loading_spinner()
        else:
            st.info("👆 Delta comparison requires at least 2 drivers with valid telemetry data.")
    else:
        # Show loading spinner when no data is selected
        render_loading_spinner()


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>DELTA (s)</h3>",
        unsafe_allow_html=True
    )


def _calculate_deltas(telemetry_data, selected_drivers):
    """
    Calculates time delta for each driver relative to the fastest driver

    Uses interpolation to align data points by distance before calculating deltas.
    """

    if telemetry_data is None or telemetry_data.empty:
        return pd.DataFrame()

    # Find fastest driver (reference) - driver with minimum final time
    reference_driver = None
    min_time = float("inf")

    for driver in selected_drivers:
        driver_data = telemetry_data[telemetry_data["driver"] == driver]
        if not driver_data.empty:
            final_time = driver_data["time"].max()
            if final_time < min_time:
                min_time = final_time
                reference_driver = driver

    if reference_driver is None:
        return pd.DataFrame()

    # Get reference driver data
    ref_data = telemetry_data[telemetry_data['driver'] == reference_driver].copy()
    ref_data = ref_data.sort_values('distance')

    # Calculate delta for each driver
    delta_data = []
    for driver in selected_drivers:
        driver_data = telemetry_data[telemetry_data['driver'] == driver].copy()
        driver_data = driver_data.sort_values('distance')

        if driver_data.empty:
            continue

        # Interpolate reference time at driver's distance points
        ref_time_interpolated = np.interp(
            driver_data['distance'],
            ref_data['distance'],
            ref_data['time']
        )

        # Calculate delta
        driver_data['delta'] = driver_data['time'] - ref_time_interpolated
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
                mode='lines',
                hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
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
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'time'])

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
