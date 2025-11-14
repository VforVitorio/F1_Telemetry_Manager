"""
Circuit Comparison Component

Renders animated circuit visualization with two drivers (markers and trails).
"""

import streamlit as st
import plotly.graph_objects as go
from typing import Dict, List
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def render_circuit_comparison(comparison_data: Dict) -> None:
    """
    Render circuit with animated comparison between two drivers.

    Shows circuit base in gray with two animated markers (cars) and their
    trails, each colored by driver. Includes play/pause animation controls.

    Args:
        comparison_data: Dictionary with circuit, pilot1, pilot2, delta data
    """
    _render_section_title()

    if comparison_data is None:
        render_loading_spinner()
        return

    fig = _create_circuit_animation(comparison_data)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT COMPARISON</h2>",
        unsafe_allow_html=True
    )


def _create_circuit_animation(comparison_data: Dict) -> go.Figure:
    """
    Create Plotly figure with circuit animation using colored microsectors.

    The circuit is rendered as individual segments that progressively change
    color as drivers pass through them, showing which driver was faster in
    each microsector.

    Args:
        comparison_data: Processed comparison data from backend

    Returns:
        Plotly Figure with frames and animation controls
    """
    circuit_x = comparison_data['circuit']['x']
    circuit_y = comparison_data['circuit']['y']
    microsector_colors = comparison_data['circuit']['colors']
    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']

    fig = go.Figure()

    # Add individual circuit segments (initially all gray)
    num_segments = len(circuit_x) - 1
    for i in range(num_segments):
        fig.add_trace(go.Scatter(
            x=[circuit_x[i], circuit_x[i + 1]],
            y=[circuit_y[i], circuit_y[i + 1]],
            mode='lines',
            line=dict(color='gray', width=4),
            showlegend=False,
            hoverinfo='skip'
        ))

    # Pilot 1 trail (initially empty)
    fig.add_trace(go.Scatter(
        x=[],
        y=[],
        mode='lines',
        line=dict(color=pilot1['color'], width=3),
        name=f"{pilot1['name']} (Lap {pilot1.get('lap', '?')})",
        showlegend=True
    ))

    # Pilot 1 marker
    fig.add_trace(go.Scatter(
        x=[pilot1['x'][0]],
        y=[pilot1['y'][0]],
        mode='markers',
        marker=dict(
            size=15,
            color=pilot1['color'],
            symbol='circle',
            line=dict(color='white', width=2)
        ),
        showlegend=False,
        hoverinfo='skip'
    ))

    # Pilot 2 trail (initially empty)
    fig.add_trace(go.Scatter(
        x=[],
        y=[],
        mode='lines',
        line=dict(color=pilot2['color'], width=3),
        name=f"{pilot2['name']} (Lap {pilot2.get('lap', '?')})",
        showlegend=True
    ))

    # Pilot 2 marker
    fig.add_trace(go.Scatter(
        x=[pilot2['x'][0]],
        y=[pilot2['y'][0]],
        mode='markers',
        marker=dict(
            size=15,
            color=pilot2['color'],
            symbol='circle',
            line=dict(color='white', width=2)
        ),
        showlegend=False,
        hoverinfo='skip'
    ))

    # Create animation frames
    frames = _create_animation_frames(
        pilot1, pilot2, circuit_x, circuit_y, microsector_colors)
    fig.frames = frames

    # Configure layout
    _configure_layout(fig)

    return fig


def _create_circuit_segment_traces(
    circuit_x: List,
    circuit_y: List,
    microsector_colors: List,
    current_position: int
) -> List[go.Scatter]:
    """
    Create circuit segment traces with progressive coloring.

    Segments before current position get their microsector color,
    segments after remain gray.

    Args:
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates
        microsector_colors: Color for each point (from backend)
        current_position: Current animation position index

    Returns:
        List of Scatter traces for circuit segments
    """
    segment_traces = []
    num_segments = len(circuit_x) - 1

    for seg_idx in range(num_segments):
        # Segments up to current position get their microsector color
        if seg_idx <= current_position:
            color = microsector_colors[seg_idx]
        else:
            # Future segments remain gray
            color = 'gray'

        segment_traces.append(go.Scatter(
            x=[circuit_x[seg_idx], circuit_x[seg_idx + 1]],
            y=[circuit_y[seg_idx], circuit_y[seg_idx + 1]],
            mode='lines',
            line=dict(color=color, width=4),
            showlegend=False,
            hoverinfo='skip'
        ))

    return segment_traces


def _create_trail_trace(pilot_x: List, pilot_y: List, color: str, position: int, trail_length: int = 50) -> go.Scatter:
    """
    Create trail trace for a single driver.

    Args:
        pilot_x: Driver's X coordinates
        pilot_y: Driver's Y coordinates
        color: Driver's color
        position: Current position index
        trail_length: Number of points to show in trail

    Returns:
        Scatter trace for trail
    """
    trail_start = max(0, position - trail_length)
    return go.Scatter(
        x=pilot_x[trail_start:position + 1],
        y=pilot_y[trail_start:position + 1],
        mode='lines',
        line=dict(color=color, width=3),
        showlegend=False,
        hoverinfo='skip'
    )


def _create_marker_trace(pilot_x: List, pilot_y: List, color: str, position: int) -> go.Scatter:
    """
    Create marker trace for a single driver.

    Args:
        pilot_x: Driver's X coordinates
        pilot_y: Driver's Y coordinates
        color: Driver's color
        position: Current position index

    Returns:
        Scatter trace for marker
    """
    return go.Scatter(
        x=[pilot_x[position]],
        y=[pilot_y[position]],
        mode='markers',
        marker=dict(
            size=15,
            color=color,
            symbol='circle',
            line=dict(color='white', width=2)
        ),
        showlegend=False,
        hoverinfo='skip'
    )


def _create_animation_frames(
    pilot1: Dict,
    pilot2: Dict,
    circuit_x: List,
    circuit_y: List,
    microsector_colors: List
) -> List:
    """
    Create animation frames with progressive microsector coloring.

    Each frame updates:
    - Circuit segments (colored based on current position)
    - Both driver trails (last 50 points)
    - Both driver markers (current position)

    Args:
        pilot1: First driver's telemetry data
        pilot2: Second driver's telemetry data
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates
        microsector_colors: Color for each circuit point

    Returns:
        List of plotly frames
    """
    frames = []
    num_points = len(pilot1['x'])
    trail_length = 50

    for i in range(num_points):
        # Build frame data: circuit segments + trails + markers
        frame_data = []

        # Add all circuit segments with progressive coloring
        frame_data.extend(_create_circuit_segment_traces(
            circuit_x, circuit_y, microsector_colors, i))

        # Add pilot 1 trail and marker
        frame_data.append(_create_trail_trace(
            pilot1['x'], pilot1['y'], pilot1['color'], i, trail_length))
        frame_data.append(_create_marker_trace(
            pilot1['x'], pilot1['y'], pilot1['color'], i))

        # Add pilot 2 trail and marker
        frame_data.append(_create_trail_trace(
            pilot2['x'], pilot2['y'], pilot2['color'], i, trail_length))
        frame_data.append(_create_marker_trace(
            pilot2['x'], pilot2['y'], pilot2['color'], i))

        frame = go.Frame(data=frame_data, name=str(i))
        frames.append(frame)

    return frames


def _configure_layout(fig: go.Figure) -> None:
    """
    Configure figure layout with dark theme and animation controls.

    Sets up plotly_dark template, aspect ratio 1:1, animation buttons,
    and legend positioning.
    """
    fig.update_layout(
        template="plotly_dark",
        height=500,
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
        hovermode=False,
        showlegend=True,
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01,
            bgcolor="rgba(0,0,0,0.7)",
            bordercolor="white",
            borderwidth=1
        ),
        updatemenus=[{
            'type': 'buttons',
            'buttons': [
                {
                    'label': '▶ Play',
                    'method': 'animate',
                    'args': [None, {
                        'frame': {'duration': 50, 'redraw': True},
                        'fromcurrent': True,
                        'mode': 'immediate'
                    }]
                },
                {
                    'label': '⏸ Pause',
                    'method': 'animate',
                    'args': [[None], {
                        'frame': {'duration': 0, 'redraw': False},
                        'mode': 'immediate',
                        'transition': {'duration': 0}
                    }]
                }
            ],
            'direction': 'left',
            'pad': {'r': 10, 't': 10},
            'showactive': False,
            'x': 0.1,
            'xanchor': 'left',
            'y': 0,
            'yanchor': 'top'
        }]
    )
