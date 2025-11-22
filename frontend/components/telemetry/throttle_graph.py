"""
Throttle Graph Component

This component renders the Throttle graph for selected drivers.

Purpose:
    Show the throttle percentage applied by each driver along the circuit. It allows
    analyzing full-throttle zones, partial-throttle zones, and coasting sections.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'throttle'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Filled area chart (go.Scatter with fill='tozeroy')
    - X axis: Distance on the circuit (meters)
    - Y axis: Throttle (0-100%)
    - 100% = full throttle
    - 0% = no throttle
    - Filled area from 0 up to the throttle value

Public function:
    - render_throttle_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_throttle_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'Throttle' (0-100%)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor


def _render_section_title() -> None:
    """ Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'> THROTTLE (%)</h3>",
        unsafe_allow_html=True
    )


def render_throttle_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the throttle graph for selected drivers
    """

    # Adding separator before the section

    st.markdown("---")

    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example: telemetry_data = session.laps.pick_driver(driver).get_telemetry()
    # The telemetry data should include: Distance, Throttle columns
    # Throttle is a percentage value (0-100%)
    # Show empty graph if no real data is available
    if telemetry_data is None or telemetry_data.empty:
        import pandas as pd
        telemetry_data = pd.DataFrame(columns=['driver', 'distance', 'throttle'])

    fig = _create_throttle_figure(
        telemetry_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _create_throttle_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for throttle visualization with filled area"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add line trace with filled area for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data["driver"] == driver]

        if not driver_data.empty:
            # Create line chart showing throttle application
            fig.add_trace(
                go.Scatter(
                    # Distance along the circuit (from FastF1)
                    x=driver_data["distance"],
                    # Throttle percentage 0-100% (from FastF1)
                    y=driver_data["throttle"],
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    mode='lines',
                    hovertemplate='Distance: %{x:.0f}m<br>Throttle: %{y:.1f}%<extra></extra>'
                )
            )

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Throttle (%)",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode="x unified"  # Show all drivers' values when hovering
    )

    return fig


def _generate_mock_throttle_data(selected_drivers):
    """
    Generates mock throttle data for visualization testing.
    Simulates realistic F1 throttle patterns with full throttle zones and lifting zones.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'throttle'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Base throttle pattern: full throttle on straights, lift for corners
        # Create a realistic throttle profile
        throttle = 70 + 30 * np.sin(distance / 400) + \
            np.random.normal(0, 3, len(distance))

        # Add corner zones (throttle lifts)
        for corner in [800, 1500, 2500, 3500, 4200]:
            corner_effect = 80 * np.exp(-((distance - corner) ** 2) / 40000)
            throttle -= corner_effect

        # Ensure realistic throttle range (0-100%)
        throttle = np.clip(throttle, 0, 100)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'throttle': throttle
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
