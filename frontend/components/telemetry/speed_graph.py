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
from app.styles import Color, TextColor, Font, FontSize


def render_speed_graph(telemety_data, selected_drivers, color_palette):
    """
    Renders the Speed graph for selected drivers
    """
    _render_section_title()
    fig = _create_speed_figure(telemety_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>1: SPEED</h3>",
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
            line=dict(color=color_palette[idx], width=2),
            mode='lines'
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
