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

    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']
    delta = comparison_data['delta']

    fig = _create_delta_figure(delta, pilot1, pilot2)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>DELTA TIME</h2>",
        unsafe_allow_html=True
    )


def _create_delta_figure(delta: List[float], pilot1: Dict, pilot2: Dict) -> go.Figure:
    """
    Create Plotly figure for delta time visualization.

    Shows time delta as two lines - one for each pilot with their respective colors.
    The faster driver (who finishes with positive delta) is shown as the horizontal reference line.

    Args:
        delta: Time differences at each point (seconds)
        pilot1: First driver's data including name, color, distance, lap_time
        pilot2: Second driver's data including name, color, distance, lap_time

    Returns:
        Plotly Figure with two lines
    """
    fig = go.Figure()

    # Determine who is faster based on actual lap times
    lap_time1 = pilot1.get('lap_time')
    lap_time2 = pilot2.get('lap_time')

    # If lap times available, use them. Otherwise fallback to final delta
    if lap_time1 is not None and lap_time2 is not None:
        pilot1_is_faster = lap_time1 < lap_time2
    else:
        # Fallback: use final delta (negative = pilot1 faster)
        final_delta = delta[-1] if delta else 0
        pilot1_is_faster = final_delta < 0

    if pilot1_is_faster:
        # Pilot1 is faster - pilot1 is horizontal reference at 0, pilot2 shows positive delta (slower)
        # Since delta = time1 - time2, and time1 < time2, delta will be negative
        # We need to invert to show pilot2 as positive (slower)
        inverted_delta = [-d for d in delta]

        fig.add_trace(go.Scatter(
            x=pilot1['distance'],
            y=[0] * len(pilot1['distance']),
            mode='lines',
            line=dict(color=pilot1['color'], width=2),
            name=pilot1['name'],
            hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
        ))

        fig.add_trace(go.Scatter(
            x=pilot2['distance'],
            y=inverted_delta,
            mode='lines',
            line=dict(color=pilot2['color'], width=2),
            name=pilot2['name'],
            hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
        ))
    else:
        # Pilot2 is faster - pilot2 is horizontal reference at 0, pilot1 shows positive delta (slower)
        # Since delta = time1 - time2, and time1 > time2, delta will be positive
        # Keep it as is to show pilot1 as positive (slower)
        inverted_delta = delta

        fig.add_trace(go.Scatter(
            x=pilot2['distance'],
            y=[0] * len(pilot2['distance']),
            mode='lines',
            line=dict(color=pilot2['color'], width=2),
            name=pilot2['name'],
            hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
        ))

        fig.add_trace(go.Scatter(
            x=pilot1['distance'],
            y=inverted_delta,
            mode='lines',
            line=dict(color=pilot1['color'], width=2),
            name=pilot1['name'],
            hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s<extra></extra>'
        ))

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
