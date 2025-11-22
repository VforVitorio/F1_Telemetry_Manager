"""
Speed Comparison Graph Component

Displays speed comparison between two drivers throughout the lap.
"""

import streamlit as st
import plotly.graph_objects as go
from typing import Dict
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def render_speed_comparison_graph(comparison_data: Dict) -> None:
    """
    Render speed comparison graph for both drivers.

    Args:
        comparison_data: Dictionary with pilot1 and pilot2 speed data
    """
    _render_section_title()

    if comparison_data is None:
        render_loading_spinner()
        return

    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']

    fig = _create_speed_figure(pilot1, pilot2)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>SPEED COMPARISON</h2>",
        unsafe_allow_html=True
    )


def _create_speed_figure(pilot1: Dict, pilot2: Dict) -> go.Figure:
    """
    Create Plotly figure for speed comparison.

    Args:
        pilot1: First driver's telemetry data
        pilot2: Second driver's telemetry data

    Returns:
        Plotly Figure with two speed lines
    """
    fig = go.Figure()

    # Pilot 1 speed line
    fig.add_trace(go.Scatter(
        x=pilot1['distance'],
        y=pilot1['speed'],
        mode='lines',
        line=dict(color=pilot1['color'], width=2),
        name=pilot1['name'],
        hovertemplate='Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h<extra></extra>'
    ))

    # Pilot 2 speed line
    fig.add_trace(go.Scatter(
        x=pilot2['distance'],
        y=pilot2['speed'],
        mode='lines',
        line=dict(color=pilot2['color'], width=2),
        name=pilot2['name'],
        hovertemplate='Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h<extra></extra>'
    ))

    # Configure layout
    fig.update_layout(
        template="plotly_dark",
        height=350,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        xaxis=dict(
            title="Distance (m)",
            showgrid=True,
            gridcolor='rgba(128, 128, 128, 0.2)'
        ),
        yaxis=dict(
            title="Speed (km/h)",
            showgrid=True,
            gridcolor='rgba(128, 128, 128, 0.2)'
        ),
        showlegend=True,
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="right",
            x=0.99,
            bgcolor="rgba(0,0,0,0.7)",
            bordercolor="white",
            borderwidth=1
        ),
        hovermode='x unified'
    )

    return fig
