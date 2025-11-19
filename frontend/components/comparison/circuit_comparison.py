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

    # Render lap times info box
    _render_lap_times_info(comparison_data)

    fig = _create_circuit_animation(comparison_data)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>LAP ANIMATION</h2>",
        unsafe_allow_html=True
    )


def _render_lap_times_info(comparison_data: Dict) -> None:
    """
    Render lap times information box with styled container.

    Shows both drivers' lap times and the winner with time difference.

    Args:
        comparison_data: Dictionary with pilot1, pilot2, and lap_time data
    """
    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']

    # Get lap times (in seconds)
    lap_time1 = pilot1.get('lap_time')
    lap_time2 = pilot2.get('lap_time')

    if lap_time1 is None or lap_time2 is None:
        return  # Don't show if lap times not available

    # Convert seconds to minutes:seconds.milliseconds format
    def format_lap_time(seconds: float) -> str:
        minutes = int(seconds // 60)
        remaining_seconds = seconds % 60
        secs = int(remaining_seconds)
        millis = int((remaining_seconds - secs) * 1000)
        return f"{minutes}:{secs:02d}.{millis:03d}"

    # Determine winner and time difference
    time_diff = abs(lap_time1 - lap_time2)
    if lap_time1 < lap_time2:
        winner_name = pilot1['name']
        winner_text = f"{winner_name} finished first by {time_diff:.3f} seconds"
    elif lap_time2 < lap_time1:
        winner_name = pilot2['name']
        winner_text = f"{winner_name} finished first by {time_diff:.3f} seconds"
    else:
        winner_text = "Both drivers finished with identical times"

    # Format lap times
    time1_formatted = format_lap_time(lap_time1)
    time2_formatted = format_lap_time(lap_time2)

    # Determine winner color
    winner_color = pilot1['color'] if lap_time1 < lap_time2 else pilot2['color']

    # Inject dynamic CSS for driver colors
    st.markdown(
        f"""
        <style>
        .driver1-name {{
            color: {pilot1['color']} !important;
        }}
        .driver2-name {{
            color: {pilot2['color']} !important;
        }}
        .driver1-time {{
            color: {pilot1['color']} !important;
        }}
        .driver2-time {{
            color: {pilot2['color']} !important;
        }}
        .winner-name {{
            color: {winner_color} !important;
        }}
        </style>
        """,
        unsafe_allow_html=True
    )

    # Render styled container with class-based colored driver names and times
    st.markdown(
        f"""
        <div class="lap-times-container">
            <p class="lap-time-text"><strong class="driver1-name">{pilot1['name']}</strong> - <span class="driver1-time">{time1_formatted}</span></p>
            <p class="lap-time-text"><strong class="driver2-name">{pilot2['name']}</strong> - <span class="driver2-time">{time2_formatted}</span></p>
            <p class="winner-text"><strong class="winner-name">{winner_name}</strong> finished first by {time_diff:.3f} seconds</p>
        </div>
        <style>
        .lap-times-container {{
            width: 100%;
            padding: 20px 30px;
            background: linear-gradient(135deg, rgba(167, 139, 250, 0.1) 0%, rgba(162, 89, 247, 0.1) 100%);
            border: 2px solid #a78bfa;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
            text-align: center;
            margin: 20px auto;
            max-width: 800px;
            transition: all 0.3s ease;
        }}
        .lap-times-container:hover {{
            box-shadow: 0 6px 16px rgba(167, 139, 250, 0.5);
            border-color: #A259F7;
        }}
        .lap-time-text {{
            color: #d1d5db;
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            font-weight: 400;
            margin: 8px 0;
            letter-spacing: 0.3px;
            line-height: 1.6;
        }}
        .winner-text {{
            color: #a78bfa;
            font-family: 'Inter', sans-serif;
            font-size: 18px;
            font-weight: 600;
            margin: 15px 0 5px 0;
            letter-spacing: 0.5px;
            line-height: 1.6;
        }}
        </style>
        """,
        unsafe_allow_html=True
    )


def _create_circuit_animation(comparison_data: Dict) -> go.Figure:
    """
    Create Plotly figure with circuit animation using colored microsectors.

    The circuit is rendered as 25 microsectors that progressively change
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

    # Calculate microsector boundaries (25 microsectors)
    num_points = len(circuit_x)
    num_microsectors = 25
    microsector_indices = _calculate_microsector_indices(
        num_points, num_microsectors)

    # IMPORTANT: Order must match frames order exactly!
    # Layer 1: Microsectors (background - circuit base)
    for microsector_idx in range(num_microsectors):
        start_idx, end_idx = microsector_indices[microsector_idx]
        fig.add_trace(_create_microsector_trace(
            circuit_x, circuit_y, start_idx, end_idx, 'gray'))

    # Layer 2: Trails (middle - always visible above circuit)

    # Pilot 1 trail (initially showing first point)
    fig.add_trace(go.Scatter(
        x=[pilot1['x'][0]],
        y=[pilot1['y'][0]],
        mode='lines',
        line=dict(color=pilot1['color'], width=3),
        name=f"{pilot1['name']} (Lap {pilot1.get('lap', '?')})",
        showlegend=True
    ))

    # Pilot 2 trail (initially showing first point)
    fig.add_trace(go.Scatter(
        x=[pilot2['x'][0]],
        y=[pilot2['y'][0]],
        mode='lines',
        line=dict(color=pilot2['color'], width=3),
        name=f"{pilot2['name']} (Lap {pilot2.get('lap', '?')})",
        showlegend=True
    ))

    # Layer 3: Markers (top - always visible)

    # Pilot 1 marker (circle)
    fig.add_trace(go.Scatter(
        x=[pilot1['x'][0]],
        y=[pilot1['y'][0]],
        mode='markers',
        marker=dict(
            size=14,
            color=pilot1['color'],
            symbol='circle',
            line=dict(color='white', width=2)
        ),
        showlegend=False,
        hoverinfo='skip'
    ))

    # Pilot 2 marker (circle)
    fig.add_trace(go.Scatter(
        x=[pilot2['x'][0]],
        y=[pilot2['y'][0]],
        mode='markers',
        marker=dict(
            size=14,
            color=pilot2['color'],
            symbol='circle',
            line=dict(color='white', width=2)
        ),
        showlegend=False,
        hoverinfo='skip'
    ))

    # Create animation frames
    frames = _create_animation_frames(
        pilot1, pilot2, circuit_x, circuit_y, microsector_colors, microsector_indices)
    fig.frames = frames

    # Configure layout with fixed axis ranges
    _configure_layout(fig, circuit_x, circuit_y, pilot1, pilot2)

    return fig


def _calculate_microsector_indices(num_points: int, num_microsectors: int) -> List[tuple]:
    """
    Calculate start and end indices for each microsector.

    Args:
        num_points: Total number of circuit points
        num_microsectors: Number of microsectors to divide circuit into (25)

    Returns:
        List of tuples (start_idx, end_idx) for each microsector
    """
    points_per_sector = num_points // num_microsectors
    microsector_indices = []

    for sector_idx in range(num_microsectors):
        start_idx = sector_idx * points_per_sector
        # Last microsector extends to end of circuit
        end_idx = num_points if sector_idx == num_microsectors - \
            1 else (sector_idx + 1) * points_per_sector
        microsector_indices.append((start_idx, end_idx))

    return microsector_indices


def _create_microsector_trace(
    circuit_x: List,
    circuit_y: List,
    start_idx: int,
    end_idx: int,
    color: str
) -> go.Scatter:
    """
    Create a single trace for a microsector.

    Args:
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates
        start_idx: Start index for this microsector
        end_idx: End index for this microsector
        color: Color for this microsector

    Returns:
        Scatter trace for the microsector
    """
    return go.Scatter(
        x=circuit_x[start_idx:end_idx],
        y=circuit_y[start_idx:end_idx],
        mode='lines',
        line=dict(color=color, width=10),
        showlegend=False,
        hoverinfo='skip'
    )


def _create_microsector_traces(
    circuit_x: List,
    circuit_y: List,
    microsector_colors: List,
    microsector_indices: List[tuple],
    current_position: int
) -> List[go.Scatter]:
    """
    Create microsector traces with progressive coloring.

    Microsectors before current position get their speed-dominance color,
    microsectors after remain gray.

    Args:
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates
        microsector_colors: Color for each point (from backend)
        microsector_indices: List of (start_idx, end_idx) tuples for each microsector
        current_position: Current animation position index

    Returns:
        List of Scatter traces for all microsectors
    """
    microsector_traces = []
    num_microsectors = len(microsector_indices)

    for microsector_idx in range(num_microsectors):
        start_idx, end_idx = microsector_indices[microsector_idx]

        # Check if this microsector has been completely passed
        if current_position >= end_idx:
            # Use the color from the first point in this microsector
            color = microsector_colors[start_idx]
        else:
            # Unpassed microsectors remain gray
            color = 'gray'

        microsector_traces.append(_create_microsector_trace(
            circuit_x, circuit_y, start_idx, end_idx, color))

    return microsector_traces


def _create_trail_trace(pilot_x: List, pilot_y: List, color: str, position: int, name: str, trail_length: int = 50) -> go.Scatter:
    """
    Create trail trace for a single driver.

    Shows the last N points of the driver's path (trail effect).

    Args:
        pilot_x: Driver's X coordinates
        pilot_y: Driver's Y coordinates
        color: Driver's color
        position: Current position index
        name: Pilot name for legend (must match initial trace name)
        trail_length: Number of points to show in trail (default: 50)

    Returns:
        Scatter trace for trail
    """
    trail_start = max(0, position - trail_length)
    return go.Scatter(
        x=pilot_x[trail_start:position + 1],
        y=pilot_y[trail_start:position + 1],
        mode='lines',
        line=dict(color=color, width=3),
        name=name,
        showlegend=True,  # Keep legend visible during animation
        hoverinfo='skip'
    )


def _create_marker_trace(pilot_x: List, pilot_y: List, color: str, position: int, symbol: str = 'circle') -> go.Scatter:
    """
    Create marker trace for a single driver.

    Args:
        pilot_x: Driver's X coordinates
        pilot_y: Driver's Y coordinates
        color: Driver's color
        position: Current position index
        symbol: Marker symbol ('circle', 'square', etc.)

    Returns:
        Scatter trace for marker
    """
    return go.Scatter(
        x=[pilot_x[position]],
        y=[pilot_y[position]],
        mode='markers',
        marker=dict(
            size=14,
            color=color,
            symbol=symbol,
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
    microsector_colors: List,
    microsector_indices: List[tuple]
) -> List:
    """
    Create animation frames with progressive microsector coloring.

    Each frame updates:
    - Circuit microsectors (25 total, colored based on current position)
    - Both driver trails (last 50 points)
    - Both driver markers (current position)

    Args:
        pilot1: First driver's telemetry data
        pilot2: Second driver's telemetry data
        circuit_x: Circuit X coordinates
        circuit_y: Circuit Y coordinates
        microsector_colors: Color for each circuit point
        microsector_indices: List of (start_idx, end_idx) for each microsector

    Returns:
        List of plotly frames (29 traces per frame = 25 microsectors + 2 trails + 2 markers)
    """
    frames = []
    num_points = len(pilot1['x'])
    trail_length = 50

    for i in range(num_points):
        # Build frame data: microsectors → trails → markers (order matters for visibility)
        frame_data = []

        # Add microsectors first (background - circuit base)
        frame_data.extend(_create_microsector_traces(
            circuit_x, circuit_y, microsector_colors, microsector_indices, i))

        # Add trails (middle layer - always visible above circuit)
        # Pass pilot names to maintain legend visibility (same name as initial traces)
        frame_data.append(_create_trail_trace(
            pilot1['x'], pilot1['y'], pilot1['color'], i,
            f"{pilot1['name']} (Lap {pilot1.get('lap', '?')})", trail_length))
        frame_data.append(_create_trail_trace(
            pilot2['x'], pilot2['y'], pilot2['color'], i,
            f"{pilot2['name']} (Lap {pilot2.get('lap', '?')})", trail_length))

        # Add markers last (top layer - always visible)
        frame_data.append(_create_marker_trace(
            pilot1['x'], pilot1['y'], pilot1['color'], i, symbol='circle'))
        frame_data.append(_create_marker_trace(
            pilot2['x'], pilot2['y'], pilot2['color'], i, symbol='circle'))

        frame = go.Frame(data=frame_data, name=str(i))
        frames.append(frame)

    return frames


def _configure_layout(fig: go.Figure, circuit_x: List, circuit_y: List, pilot1: Dict, pilot2: Dict) -> None:
    """
    Configure figure layout with dark theme, fixed axis ranges, and animation controls.

    Sets up plotly_dark template, aspect ratio 1:1, fixed axes to prevent zoom/movement,
    centered animation buttons, and legend positioning.

    Args:
        fig: Plotly figure to configure
        circuit_x: Circuit X coordinates (for axis range calculation)
        circuit_y: Circuit Y coordinates (for axis range calculation)
        pilot1: Pilot 1 data (for axis range calculation)
        pilot2: Pilot 2 data (for axis range calculation)
    """
    # Calculate fixed axis ranges from all data to prevent auto-scaling
    all_x = circuit_x + pilot1['x'] + pilot2['x']
    all_y = circuit_y + pilot1['y'] + pilot2['y']

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)

    # Add 10% padding for zoomed out view
    x_padding = (x_max - x_min) * 0.10
    y_padding = (y_max - y_min) * 0.10

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
            scaleratio=1,
            # Fixed range (no auto-scaling)
            range=[x_min - x_padding, x_max + x_padding],
            fixedrange=True  # Disable zoom/pan
        ),
        yaxis=dict(
            showgrid=False,
            showticklabels=False,
            zeroline=False,
            # Fixed range (no auto-scaling)
            range=[y_min - y_padding, y_max + y_padding],
            fixedrange=True  # Disable zoom/pan
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
                        'frame': {'duration': 120, 'redraw': True},
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
