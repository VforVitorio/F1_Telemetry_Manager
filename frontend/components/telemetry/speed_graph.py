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
from components.common.loading import render_loading_spinner
from components.common.ask_about_button import render_ask_about_button, SPEED_GRAPH_TEMPLATE


def render_speed_graph(telemetry_data_multi, selected_drivers, color_palette):
    """
    Renders the Speed graph for selected drivers.
    Shows telemetry data when laps are selected.

    Args:
        telemetry_data_multi: Dict with driver codes as keys and telemetry data as values
                             Format: {'VER': {...telemetry...}, 'LEC': {...telemetry...}}
        selected_drivers: List of driver codes
        color_palette: List of colors for each driver
    """
    # Add separator before the section
    st.markdown("---")

    # Convert multi-driver telemetry data to DataFrame format
    if telemetry_data_multi is not None and isinstance(telemetry_data_multi, dict) and telemetry_data_multi:
        df_list = []
        drivers_with_data = []
        colors_with_data = []

        for idx, driver in enumerate(selected_drivers):
            if driver in telemetry_data_multi:
                driver_telemetry = telemetry_data_multi[driver]

                # Check if we have the required data
                if 'distance' in driver_telemetry and 'speed' in driver_telemetry:
                    distance = driver_telemetry.get('distance', [])
                    speed = driver_telemetry.get('speed', [])

                    # Convert to DataFrame
                    df_data = pd.DataFrame({
                        'driver': [driver] * len(distance),
                        'distance': distance,
                        'speed': speed
                    })
                    df_list.append(df_data)
                    drivers_with_data.append(driver)
                    if idx < len(color_palette):
                        colors_with_data.append(color_palette[idx])

        if df_list:
            # Combine all driver data
            combined_df = pd.concat(df_list, ignore_index=True)
            fig = _create_speed_figure(
                combined_df, drivers_with_data, colors_with_data)
            _render_section_title_with_button(fig, drivers_with_data[0], telemetry_data_multi[drivers_with_data[0]])
            st.plotly_chart(fig, use_container_width=True)
        else:
            _render_section_title()
            render_loading_spinner()
    else:
        # Show loading spinner when no data is selected
        _render_section_title()
        render_loading_spinner()


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>SPEED (km/h) </h3>",
        unsafe_allow_html=True
    )


def _render_section_title_with_button(fig: go.Figure, driver: str, telemetry_data: dict) -> None:
    """Renders the section title with compact AI button"""
    col1, col2 = st.columns([0.95, 0.05])

    with col1:
        st.markdown(
            "<h3 style='text-align: center;'>SPEED (km/h) </h3>",
            unsafe_allow_html=True
        )

    with col2:
        # Get context from session state if available
        selected_lap = st.session_state.get('selected_lap', {})
        context = {
            "driver_name": driver,
            "session_type": selected_lap.get('session', 'Unknown'),
            "gp_name": selected_lap.get('gp', 'Unknown GP'),
            "year": str(selected_lap.get('year', '')),
            "team_name": "Unknown",  # TODO: Get from data
            "lap_number": str(selected_lap.get('lap_number', '')),
            "tyre_compound": "Unknown"  # TODO: Get from telemetry if available
        }

        render_ask_about_button(
            chart_fig=fig,
            chart_type="speed_graph",
            prompt_template=SPEED_GRAPH_TEMPLATE,
            context=context,
            compact=True,
            tooltip="Ask AI to analyze this speed data"
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
            hovertemplate='<b>%{fullData.name}</b><br>Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h<extra></extra>'
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
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified'  # Show all drivers' info at the same distance point
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
