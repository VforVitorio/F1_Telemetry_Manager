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
    Renders the brake graph for selected drivers.
    Shows telemetry data when a lap is selected.
    """
    st.markdown("---")
    _render_section_title()

    # Convert telemetry_data to DataFrame format if it's a dict from the API
    if telemetry_data is not None and isinstance(telemetry_data, dict):
        # Check if we have the required data
        if 'distance' in telemetry_data and 'brake' in telemetry_data:
            driver = telemetry_data.get('driver', 'Unknown')
            distance = telemetry_data.get('distance', [])
            brake = telemetry_data.get('brake', [])

            # Convert to DataFrame
            df_data = pd.DataFrame({
                'driver': [driver] * len(distance),
                'distance': distance,
                'brake': brake
            })

            # Get driver color
            from components.common.driver_colors import get_driver_color
            driver_color = get_driver_color(driver)

            fig = _create_brake_figure(df_data, [driver], [driver_color])
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("👆 Select a lap using the lap selector above to view brake telemetry")
    else:
        # Show empty state
        st.info("👆 Select a lap using the lap selector above to view brake telemetry")


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
            # Create line chart showing braking zones
            fig.add_trace(
                go.Scatter(
                    # Distance along the circuit (from FastF1)
                    x=driver_data["distance"],
                    # Brake input: boolean (0/1) or percentage (0-100%) (from FastF1)
                    y=driver_data["brake"],
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    mode='lines',
                    hovertemplate='Distance: %{x:.0f}m<br>Brake: %{y:.1f}%<extra></extra>'
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


def _generate_mock_brake_data(selected_drivers):
    """
    Generates mock brake data for visualization testing.
    Simulates realistic F1 braking patterns with brake zones before corners.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'brake'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Initialize brake as mostly zero (no braking on straights)
        brake = np.zeros(len(distance)) + np.random.normal(0, 1, len(distance))

        # Add braking zones before corners
        # Braking happens just before the corner positions
        for corner in [800, 1500, 2500, 3500, 4200]:
            # Brake zone starts ~100m before corner and peaks at corner entry
            brake_zone = 100 * \
                np.exp(-((distance - (corner - 50)) ** 2) / 3000)
            brake += brake_zone

        # Ensure realistic brake range (0-100%)
        brake = np.clip(brake, 0, 100)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'brake': brake
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
