"""
Speed Graph Component

This component renders the Speed graph for selected drivers.

Purpose:
    Show each driver's speed along the circuit, allowing comparison of
    where each driver reaches higher speeds and in which sections they lose speed.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'speed'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart (go.Scatter)
    - X axis: Distance on the circuit (meters)
    - Y axis: Speed (km/h)
    - One colored line per selected driver

Public function:
    - render_speed_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_speed_figure(data, drivers, colors) -> go.Figure
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor


def render_speed_graph(telemety_data, selected_drivers, color_palette):
    """
    Renders the Speed graph for selected drivers
    """
    # Add separator before the section
    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, Speed columns
    # Show empty graph if no real data is available
    if telemety_data is None or (hasattr(telemety_data, 'empty') and telemety_data.empty):
        import pandas as pd
        telemety_data = pd.DataFrame(columns=['driver', 'distance', 'speed'])

    fig = _create_speed_figure(telemety_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>SPEED (km/h) </h3>",
        unsafe_allow_html=True
    )


def _create_speed_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for speed visualization"""
    fig = go.Figure()

    # Add a line trace for each driver
    for idx, driver in enumerate(selected_drivers):
        driver_data = telemetry_data[telemetry_data['driver'] == driver]

        fig.add_trace(go.Scatter(
            x=driver_data['distance'],
            y=driver_data['speed'],
            name=driver,
            line=dict(color=color_palette[idx % len(color_palette)], width=2),
            mode='lines',
            hovertemplate='Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h<extra></extra>'
        ))

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Speed (km/h)",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY)
    )

    return fig


def _generate_mock_speed_data(selected_drivers):
    """
    Generates mock speed data for visualization testing.
    Simulates realistic F1 speed patterns with straights and corners.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'speed'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Base speed pattern: fast straights + slow corners
        # Create a realistic speed profile with multiple straights and corners
        speed = 200 + 80 * np.sin(distance / 500) + \
            np.random.normal(0, 5, len(distance))

        # Add corner zones (speed drops)
        for corner in [800, 1500, 2500, 3500, 4200]:
            corner_effect = 60 * np.exp(-((distance - corner) ** 2) / 50000)
            speed -= corner_effect

        # Ensure realistic speed range (80-330 km/h)
        speed = np.clip(speed, 80, 330)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'speed': speed
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
