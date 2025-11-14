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
    Create Plotly figure with circuit animation.

    Args:
        comparison_data: Processed comparison data from backend

    Returns:
        Plotly Figure with frames and animation controls
    """
    circuit_x = comparison_data['circuit']['x']
    circuit_y = comparison_data['circuit']['y']
    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']

    fig = go.Figure()

    # Initial frame: circuit base + both markers at start position
    fig.add_trace(go.Scatter(
        x=circuit_x,
        y=circuit_y,
        mode='lines',
        line=dict(color='gray', width=4),
        name='Circuit',
        showlegend=False
    ))

    # Pilot 1 trail (initially empty)
    fig.add_trace(go.Scatter(
        x=[],
        y=[],
        mode='lines',
        line=dict(color=pilot1['color'], width=3),
        name=f"{pilot1['name']} Trail",
        showlegend=False
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
        name=pilot1['name']
    ))

    # Pilot 2 trail (initially empty)
    fig.add_trace(go.Scatter(
        x=[],
        y=[],
        mode='lines',
        line=dict(color=pilot2['color'], width=3),
        name=f"{pilot2['name']} Trail",
        showlegend=False
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
        name=pilot2['name']
    ))

    # Create animation frames
    frames = _create_animation_frames(pilot1, pilot2, circuit_x, circuit_y)
    fig.frames = frames

    # Configure layout
    _configure_layout(fig)

    return fig


def _create_animation_frames(pilot1: Dict, pilot2: Dict, circuit_x: List, circuit_y: List) -> List:
    """
    Create animation frames for both drivers.

    Each frame contains: circuit base, trail1, marker1, trail2, marker2.
    Trail length is limited to last 50 points for visual clarity.

    Args:
        pilot1: First driver's telemetry data
        pilot2: Second driver's telemetry data
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates

    Returns:
        List of plotly frames
    """
    frames = []
    num_points = len(pilot1['x'])
    trail_length = 50

    for i in range(num_points):
        # Calculate trail start index (last 50 points)
        trail_start = max(0, i - trail_length)

        frame = go.Frame(
            data=[
                # Circuit base (unchanged)
                go.Scatter(
                    x=circuit_x,
                    y=circuit_y,
                    mode='lines',
                    line=dict(color='gray', width=4)
                ),

                # Pilot 1 trail
                go.Scatter(
                    x=pilot1['x'][trail_start:i+1],
                    y=pilot1['y'][trail_start:i+1],
                    mode='lines',
                    line=dict(color=pilot1['color'], width=3)
                ),

                # Pilot 1 marker
                go.Scatter(
                    x=[pilot1['x'][i]],
                    y=[pilot1['y'][i]],
                    mode='markers',
                    marker=dict(
                        size=15,
                        color=pilot1['color'],
                        symbol='circle',
                        line=dict(color='white', width=2)
                    )
                ),

                # Pilot 2 trail
                go.Scatter(
                    x=pilot2['x'][trail_start:i+1],
                    y=pilot2['y'][trail_start:i+1],
                    mode='lines',
                    line=dict(color=pilot2['color'], width=3)
                ),

                # Pilot 2 marker
                go.Scatter(
                    x=[pilot2['x'][i]],
                    y=[pilot2['y'][i]],
                    mode='markers',
                    marker=dict(
                        size=15,
                        color=pilot2['color'],
                        symbol='circle',
                        line=dict(color='white', width=2)
                    )
                )
            ],
            name=str(i)
        )
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
