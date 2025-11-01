"""
Circuit Domination Component

This module provides the Circuit Domination section for the dashboard,
displaying the circuit visualization with microsectors colored by driver dominance.

Purpose:
    Show which driver was fastest in each microsector of the circuit,
    visualizing track dominance through color-coded segments.

Required data:
    - telemetry_data: GPS coordinates and timing data for each driver
    - selected_drivers: List of driver identifiers
    - color_palette: List of colors for each driver

Visualization:
    - Type: Circuit map with colored segments (25 microsectors)
    - Each segment colored by the driver who was fastest in that section
    - Uses official track lengths from track_data module

Public function:
    - render_circuit_domination_section(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_circuit_figure(data, drivers, colors) -> go.Figure
    - _generate_mock_circuit_data(drivers, colors) -> dict
    - _calculate_microsector_dominance(telemetry_data, drivers, num_sectors) -> list
"""

import streamlit as st
import plotly.graph_objects as go
import numpy as np
from app.styles import Color, TextColor


def render_circuit_domination_section(telemetry_data, selected_drivers, color_palette) -> None:
    """
    Render the Circuit Domination section with the circuit visualization.

    This function displays:
    - A horizontal separator
    - A centered title "CIRCUIT DOMINATION"
    - A circuit map colored by driver dominance in microsectors

    Args:
        telemetry_data: Telemetry data containing GPS coordinates and timing
        selected_drivers: List of selected driver identifiers
        color_palette: List of colors for each driver
    """
    # Horizontal separator
    st.markdown("---")

    # Render the section title
    _render_section_title()

    # TODO: Replace with FastF1 backend call
    # Example backend calls needed:
    # 1. session = fastf1.get_session(year, gp, session_type)
    # 2. session.load()
    # 3. For each driver:
    #    lap = session.laps.pick_driver(driver).pick_fastest()
    #    tel = lap.get_telemetry()
    # 4. Extract GPS coordinates: tel['X'], tel['Y']
    # 5. Get circuit rotation: session.get_circuit_info().rotation
    # 6. Apply rotation transform to coordinates
    # 7. Calculate cumulative distance and scale to official track length
    # 8. Compare driver speeds/times across microsectors

    # Use mock data if no real data is available
    if telemetry_data is None:
        circuit_data = _generate_mock_circuit_data(selected_drivers, color_palette)
    else:
        # TODO: Process real telemetry data
        circuit_data = _generate_mock_circuit_data(selected_drivers, color_palette)

    # Create and render the circuit figure with reduced size
    # Use columns to center and reduce width (50% of page width)
    _, center_container, _ = st.columns([1, 2, 1])

    with center_container:
        fig = _create_circuit_figure(circuit_data)
        st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """
    Render the centered section title.
    """
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT DOMINATION</h2>",
        unsafe_allow_html=True
    )


def _create_circuit_figure(circuit_data: dict) -> go.Figure:
    """
    Creates the Plotly figure for circuit visualization.

    Args:
        circuit_data: Dictionary containing 'x', 'y' coordinates and 'colors' for each segment

    Returns:
        go.Figure: Plotly figure with the circuit visualization
    """
    fig = go.Figure()

    x = circuit_data['x']
    y = circuit_data['y']
    colors = circuit_data['colors']

    # Add circuit segments with individual colors
    # Each segment represents a microsector colored by the fastest driver
    for i in range(len(x) - 1):
        fig.add_trace(go.Scatter(
            x=[x[i], x[i + 1]],
            y=[y[i], y[i + 1]],
            mode='lines',
            line=dict(color=colors[i], width=6),
            showlegend=False,
            hoverinfo='skip'
        ))

    # Configure layout
    fig.update_layout(
        template="plotly_dark",
        height=360,  # 60% of original 600px
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        xaxis=dict(
            showgrid=False,
            showticklabels=False,
            zeroline=False,
            scaleanchor="y",
            scaleratio=1
        ),
        yaxis=dict(
            showgrid=False,
            showticklabels=False,
            zeroline=False
        ),
        hovermode=False
    )

    return fig


def _generate_mock_circuit_data(selected_drivers: list, color_palette: list) -> dict:
    """
    Generates mock circuit data for visualization testing.
    Creates a realistic circuit shape divided into 25 microsectors,
    each colored by a randomly assigned driver.

    Args:
        selected_drivers: List of driver identifiers
        color_palette: List of colors for each driver

    Returns:
        dict: Contains 'x', 'y' coordinates and 'colors' for circuit segments
    """
    # TODO: Replace with actual GPS data processing
    # Real implementation will:
    # 1. Load GPS coordinates from FastF1 telemetry (X, Y in mm)
    # 2. Apply circuit-specific rotation angle
    # 3. Convert mm to meters
    # 4. Calculate cumulative distance
    # 5. Scale to official track length from OFFICIAL_TRACK_LENGTHS
    # 6. Divide into 25 microsectors
    # 7. Determine fastest driver per microsector
    # 8. Assign corresponding colors

    # Create a realistic circuit shape (approximates a typical F1 circuit)
    num_points = 200
    t = np.linspace(0, 2 * np.pi, num_points)

    # Create circuit shape using parametric equations
    # Combines circular and sinusoidal components for realistic track layout
    x = 100 * np.cos(t) + 30 * np.cos(3 * t) + 20 * np.sin(5 * t)
    y = 100 * np.sin(t) + 30 * np.sin(3 * t) + 15 * np.cos(4 * t)

    # Divide circuit into 25 microsectors
    num_microsectors = 25
    points_per_sector = num_points // num_microsectors

    # Assign colors based on "dominant" driver in each microsector
    # In real implementation, this will be based on actual speed/time comparison
    colors = []
    for i in range(num_points - 1):
        sector_idx = i // points_per_sector
        # Randomly assign driver for mock data (will be real comparison later)
        driver_idx = np.random.randint(0, len(color_palette))
        colors.append(color_palette[driver_idx])

    return {
        'x': x,
        'y': y,
        'colors': colors
    }
