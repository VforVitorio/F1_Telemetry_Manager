"""
Delta Time Graph Component

Displays time difference between two drivers throughout the lap.
"""

import streamlit as st
import plotly.graph_objects as go
from typing import Dict, List
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def render_delta_time_graph(comparison_data: Dict) -> None:
    """
    Render delta time graph with colored area.

    Shows cumulative time difference between drivers across the lap.
    Positive delta = pilot1 ahead, negative = pilot2 ahead.

    Args:
        comparison_data: Dictionary with delta data
    """
    _render_section_title()

    if comparison_data is None:
        render_loading_spinner()
        return

    delta = comparison_data['delta']
    distance = comparison_data['pilot1']['distance']
    pilot1_name = comparison_data['pilot1']['name']
    pilot2_name = comparison_data['pilot2']['name']

    fig = _create_delta_figure(delta, distance, pilot1_name, pilot2_name)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>DELTA TIME</h2>",
        unsafe_allow_html=True
    )


def _create_delta_figure(delta: List[float], distance: List[float], pilot1_name: str, pilot2_name: str) -> go.Figure:
    """
    Create Plotly figure for delta time visualization.

    Uses filled area chart with color indicating which driver is ahead.
    Green area = pilot1 ahead, red area = pilot2 ahead.

    Args:
        delta: Time differences at each point (seconds)
        distance: Distance array (meters)
        pilot1_name: First driver name
        pilot2_name: Second driver name

    Returns:
        Plotly Figure with colored area chart
    """
    fig = go.Figure()

    # Add delta line (simple line, no fill)
    fig.add_trace(go.Scatter(
        x=distance,
        y=delta,
        mode='lines',
        line=dict(color='white', width=2),
        name='Time Delta',
        hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
    ))

    # Add zero reference line (horizontal)
    fig.add_hline(
        y=0,
        line_dash="dash",
        line_color="gray",
        line_width=1,
        annotation_text="Even",
        annotation_position="right"
    )

    # Configure layout
    fig.update_layout(
        template="plotly_dark",
        height=400,
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
            title="Time Delta (s)",
            showgrid=True,
            gridcolor='rgba(128, 128, 128, 0.2)',
            zeroline=True,
            zerolinecolor='gray',
            zerolinewidth=2
        ),
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
        hovermode='x unified'
    )

    return fig
