"""
Synchronized Comparison Animation Component

Combines circuit animation with telemetry graphs in synchronized subplots.
All graphs animate progressively in sync with car position on circuit.
"""

import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, List
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner


def render_synchronized_comparison_animation(comparison_data: Dict) -> None:
    """
    Render synchronized animation with circuit and telemetry graphs.

    Layout:
    ┌────────────────────┬──────────────┬──────────────┐
    │                    │    DELTA     │    SPEED     │
    │    CIRCUIT         ├──────────────┼──────────────┤
    │   ANIMATION        │    BRAKE     │   THROTTLE   │
    │                    │              │              │
    └────────────────────┴──────────────┴──────────────┘

    Args:
        comparison_data: Dictionary with circuit, pilot1, pilot2, delta data
    """
    _render_section_title()

    if comparison_data is None:
        render_loading_spinner()
        return

    # Render lap times info box
    render_lap_times_info(comparison_data)

    # Render animation figure
    render_animation_figure(comparison_data)


def render_lap_times_info(comparison_data: Dict) -> None:
    """
    Render lap times information boxes (public function for use with spinner).

    Shows both drivers' lap times, winner, and qualifying phase info if present.

    Args:
        comparison_data: Dictionary with pilot1, pilot2, and metadata
    """
    _render_lap_times_info(comparison_data)


def render_animation_figure(comparison_data: Dict) -> None:
    """
    Create and render the synchronized animation figure (public function for use with spinner).

    This is the heavy operation that generates all animation frames.

    Args:
        comparison_data: Dictionary with circuit, pilot1, pilot2, delta data
    """
    fig = _create_synchronized_figure(comparison_data)
    st.plotly_chart(fig, use_container_width=True)


def _render_section_title() -> None:
    """Render centered section title."""
    st.markdown(
        "<h2 style='text-align: center;'>SYNCHRONIZED TELEMETRY ANALYSIS</h2>",
        unsafe_allow_html=True
    )


def _render_lap_times_info(comparison_data: Dict) -> None:
    """
    Render lap times information box with styled container.

    Reused from circuit_comparison component.
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
    elif lap_time2 < lap_time1:
        winner_name = pilot2['name']
    else:
        winner_name = "Both drivers"

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

    # Render styled container
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

    # Display qualifying phase info if present
    metadata = comparison_data.get('metadata', {})
    warning = metadata.get('warning')
    qualifying_phase = metadata.get('qualifying_phase')

    if qualifying_phase:
        # Show green success message for qualifying comparisons
        st.markdown(
            f"""
            <div class="qualifying-success-container">
                <p class="success-icon">✓</p>
                <p class="success-text">Comparing fastest laps from <strong>{qualifying_phase}</strong></p>
            </div>
            <style>
            .qualifying-success-container {{
                width: 100%;
                padding: 12px 25px;
                background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%);
                border: 2px solid #22c55e;
                border-radius: 10px;
                box-shadow: 0 3px 10px rgba(34, 197, 94, 0.25);
                text-align: center;
                margin: 15px auto;
                max-width: 800px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }}
            .success-icon {{
                font-size: 20px;
                color: #22c55e;
                margin: 0;
                font-weight: bold;
            }}
            .success-text {{
                color: #22c55e;
                font-family: 'Inter', sans-serif;
                font-size: 14px;
                font-weight: 500;
                margin: 0;
                letter-spacing: 0.3px;
                line-height: 1.5;
            }}
            </style>
            """,
            unsafe_allow_html=True
        )

        # Show yellow warning if there's a performance gap
        if warning:
            st.markdown(
                f"""
                <div class="qualifying-warning-container">
                    <p class="warning-icon">⚠️</p>
                    <p class="warning-text">{warning}</p>
                </div>
                <style>
                .qualifying-warning-container {{
                    width: 100%;
                    padding: 15px 25px;
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%);
                    border: 2px solid #fbbf24;
                    border-radius: 10px;
                    box-shadow: 0 3px 10px rgba(251, 191, 36, 0.25);
                    text-align: center;
                    margin: 10px auto 15px auto;
                    max-width: 800px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }}
                .warning-icon {{
                    font-size: 24px;
                    margin: 0;
                }}
                .warning-text {{
                    color: #fbbf24;
                    font-family: 'Inter', sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    margin: 0;
                    letter-spacing: 0.3px;
                    line-height: 1.5;
                    text-align: center;
                }}
                </style>
                """,
                unsafe_allow_html=True
            )


def _create_synchronized_figure(comparison_data: Dict) -> go.Figure:
    """
    Create Plotly figure with synchronized subplots.

    Creates a subplot layout with:
    - Circuit animation (left side, 2 rows)
    - Delta time graph (top right)
    - Speed graph (top far right)
    - Brake graph (bottom right)
    - Throttle graph (bottom far right)

    All subplots animate in sync with progressive data painting.

    Args:
        comparison_data: Processed comparison data from backend

    Returns:
        Plotly Figure with synchronized frames and animation controls
    """
    # Create subplot layout
    fig = make_subplots(
        rows=2, cols=3,
        specs=[
            [{'rowspan': 2}, {}, {}],  # Circuit (2 rows), Delta, Speed
            [None, {}, {}]              # -, Brake, Throttle
        ],
        subplot_titles=('Circuit Animation', 'Delta Time', 'Speed',
                       'Brake Pressure', 'Throttle'),
        horizontal_spacing=0.08,
        vertical_spacing=0.15,  # Increased spacing between rows
        column_widths=[0.50, 0.25, 0.25],  # Original layout
        row_heights=[0.5, 0.5]
    )

    # Extract data
    circuit_x = comparison_data['circuit']['x']
    circuit_y = comparison_data['circuit']['y']
    microsector_colors = comparison_data['circuit']['colors']
    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']
    delta = comparison_data['delta']

    # Calculate microsector boundaries for circuit
    num_points = len(circuit_x)
    num_microsectors = 25
    microsector_indices = _calculate_microsector_indices(num_points, num_microsectors)

    # Add initial traces for all subplots
    _add_circuit_traces(fig, circuit_x, circuit_y, microsector_indices, pilot1, pilot2)
    _add_delta_traces(fig, pilot1, pilot2)
    _add_speed_traces(fig, pilot1, pilot2)
    _add_brake_traces(fig, pilot1, pilot2)
    _add_throttle_traces(fig, pilot1, pilot2)

    # Create synchronized animation frames
    frames = _create_synchronized_frames(
        comparison_data, microsector_indices, num_microsectors
    )
    fig.frames = frames

    # Configure layout (pass num_points for slider)
    _configure_synchronized_layout(fig, circuit_x, circuit_y, pilot1, pilot2, delta, num_points)

    return fig


def _calculate_microsector_indices(num_points: int, num_microsectors: int) -> List[tuple]:
    """Calculate start and end indices for each microsector."""
    points_per_sector = num_points // num_microsectors
    microsector_indices = []

    for sector_idx in range(num_microsectors):
        start_idx = sector_idx * points_per_sector
        end_idx = num_points if sector_idx == num_microsectors - 1 else (sector_idx + 1) * points_per_sector
        microsector_indices.append((start_idx, end_idx))

    return microsector_indices


def _add_circuit_traces(
    fig: go.Figure,
    circuit_x: List,
    circuit_y: List,
    microsector_indices: List[tuple],
    pilot1: Dict,
    pilot2: Dict
) -> None:
    """Add initial circuit traces (microsectors, trails, markers) to subplot."""
    # Add microsectors (initially gray)
    for microsector_idx in range(len(microsector_indices)):
        start_idx, end_idx = microsector_indices[microsector_idx]
        fig.add_trace(
            go.Scatter(
                x=circuit_x[start_idx:end_idx],
                y=circuit_y[start_idx:end_idx],
                mode='lines',
                line=dict(color='gray', width=10),
                showlegend=False,
                hoverinfo='skip'
            ),
            row=1, col=1
        )

    # Add trails
    fig.add_trace(
        go.Scatter(
            x=[pilot1['x'][0]],
            y=[pilot1['y'][0]],
            mode='lines',
            line=dict(color=pilot1['color'], width=3),
            name=f"{pilot1['name']} (Lap {pilot1.get('lap', '?')})",
            showlegend=True
        ),
        row=1, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=[pilot2['x'][0]],
            y=[pilot2['y'][0]],
            mode='lines',
            line=dict(color=pilot2['color'], width=3),
            name=f"{pilot2['name']} (Lap {pilot2.get('lap', '?')})",
            showlegend=True
        ),
        row=1, col=1
    )

    # Add markers
    fig.add_trace(
        go.Scatter(
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
        ),
        row=1, col=1
    )

    fig.add_trace(
        go.Scatter(
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
        ),
        row=1, col=1
    )


def _add_delta_traces(fig: go.Figure, pilot1: Dict, pilot2: Dict) -> None:
    """Add initial delta time traces to subplot."""
    # Determine who is faster
    lap_time1 = pilot1.get('lap_time')
    lap_time2 = pilot2.get('lap_time')

    if lap_time1 is not None and lap_time2 is not None:
        pilot1_is_faster = lap_time1 < lap_time2
    else:
        pilot1_is_faster = True

    # Add initial traces (will be updated by frames)
    if pilot1_is_faster:
        fig.add_trace(
            go.Scatter(
                x=[pilot1['distance'][0]],
                y=[0],
                mode='lines',
                line=dict(color=pilot1['color'], width=2),
                name=pilot1['name'],
                showlegend=False
            ),
            row=1, col=2
        )

        fig.add_trace(
            go.Scatter(
                x=[pilot2['distance'][0]],
                y=[0],
                mode='lines',
                line=dict(color=pilot2['color'], width=2),
                name=pilot2['name'],
                showlegend=False
            ),
            row=1, col=2
        )
    else:
        fig.add_trace(
            go.Scatter(
                x=[pilot2['distance'][0]],
                y=[0],
                mode='lines',
                line=dict(color=pilot2['color'], width=2),
                name=pilot2['name'],
                showlegend=False
            ),
            row=1, col=2
        )

        fig.add_trace(
            go.Scatter(
                x=[pilot1['distance'][0]],
                y=[0],
                mode='lines',
                line=dict(color=pilot1['color'], width=2),
                name=pilot1['name'],
                showlegend=False
            ),
            row=1, col=2
        )


def _add_speed_traces(fig: go.Figure, pilot1: Dict, pilot2: Dict) -> None:
    """Add initial speed traces to subplot."""
    fig.add_trace(
        go.Scatter(
            x=[pilot1['distance'][0]],
            y=[pilot1['speed'][0]],
            mode='lines',
            line=dict(color=pilot1['color'], width=2),
            name=pilot1['name'],
            showlegend=False
        ),
        row=1, col=3
    )

    fig.add_trace(
        go.Scatter(
            x=[pilot2['distance'][0]],
            y=[pilot2['speed'][0]],
            mode='lines',
            line=dict(color=pilot2['color'], width=2),
            name=pilot2['name'],
            showlegend=False
        ),
        row=1, col=3
    )


def _add_brake_traces(fig: go.Figure, pilot1: Dict, pilot2: Dict) -> None:
    """Add initial brake traces to subplot."""
    fig.add_trace(
        go.Scatter(
            x=[pilot1['distance'][0]],
            y=[pilot1['brake'][0]],
            mode='lines',
            line=dict(color=pilot1['color'], width=2),
            name=pilot1['name'],
            showlegend=False
        ),
        row=2, col=2
    )

    fig.add_trace(
        go.Scatter(
            x=[pilot2['distance'][0]],
            y=[pilot2['brake'][0]],
            mode='lines',
            line=dict(color=pilot2['color'], width=2),
            name=pilot2['name'],
            showlegend=False
        ),
        row=2, col=2
    )


def _add_throttle_traces(fig: go.Figure, pilot1: Dict, pilot2: Dict) -> None:
    """Add initial throttle traces to subplot."""
    fig.add_trace(
        go.Scatter(
            x=[pilot1['distance'][0]],
            y=[pilot1['throttle'][0]],
            mode='lines',
            line=dict(color=pilot1['color'], width=2),
            name=pilot1['name'],
            showlegend=False
        ),
        row=2, col=3
    )

    fig.add_trace(
        go.Scatter(
            x=[pilot2['distance'][0]],
            y=[pilot2['throttle'][0]],
            mode='lines',
            line=dict(color=pilot2['color'], width=2),
            name=pilot2['name'],
            showlegend=False
        ),
        row=2, col=3
    )


def _create_synchronized_frames(
    comparison_data: Dict,
    microsector_indices: List[tuple],
    num_microsectors: int
) -> List:
    """
    Create synchronized animation frames for all subplots.

    Each frame updates:
    - Circuit: microsectors, trails, markers
    - Delta: progressive line up to current position
    - Speed: progressive lines up to current position
    - Brake: progressive lines up to current position
    - Throttle: progressive lines up to current position

    Args:
        comparison_data: Full comparison data
        microsector_indices: Circuit microsector boundaries
        num_microsectors: Number of microsectors

    Returns:
        List of plotly frames
    """
    circuit_x = comparison_data['circuit']['x']
    circuit_y = comparison_data['circuit']['y']
    microsector_colors = comparison_data['circuit']['colors']
    pilot1 = comparison_data['pilot1']
    pilot2 = comparison_data['pilot2']
    delta = comparison_data['delta']

    # Determine who is faster for delta graph
    lap_time1 = pilot1.get('lap_time')
    lap_time2 = pilot2.get('lap_time')

    if lap_time1 is not None and lap_time2 is not None:
        pilot1_is_faster = lap_time1 < lap_time2
    else:
        pilot1_is_faster = True

    frames = []
    num_points = len(pilot1['x'])
    trail_length = 50

    for i in range(num_points):
        frame_data = []

        # === CIRCUIT SUBPLOT (row=1, col=1) ===
        # Microsectors
        for microsector_idx in range(num_microsectors):
            start_idx, end_idx = microsector_indices[microsector_idx]
            color = microsector_colors[start_idx] if i >= end_idx else 'gray'

            frame_data.append(
                go.Scatter(
                    x=circuit_x[start_idx:end_idx],
                    y=circuit_y[start_idx:end_idx],
                    mode='lines',
                    line=dict(color=color, width=10),
                    showlegend=False,
                    hoverinfo='skip'
                )
            )

        # Trails
        trail_start = max(0, i - trail_length)
        frame_data.append(
            go.Scatter(
                x=pilot1['x'][trail_start:i + 1],
                y=pilot1['y'][trail_start:i + 1],
                mode='lines',
                line=dict(color=pilot1['color'], width=3),
                name=f"{pilot1['name']} (Lap {pilot1.get('lap', '?')})",
                showlegend=True,
                hoverinfo='skip'
            )
        )

        frame_data.append(
            go.Scatter(
                x=pilot2['x'][trail_start:i + 1],
                y=pilot2['y'][trail_start:i + 1],
                mode='lines',
                line=dict(color=pilot2['color'], width=3),
                name=f"{pilot2['name']} (Lap {pilot2.get('lap', '?')})",
                showlegend=True,
                hoverinfo='skip'
            )
        )

        # Markers
        frame_data.append(
            go.Scatter(
                x=[pilot1['x'][i]],
                y=[pilot1['y'][i]],
                mode='markers',
                marker=dict(
                    size=14,
                    color=pilot1['color'],
                    symbol='circle',
                    line=dict(color='white', width=2)
                ),
                showlegend=False,
                hoverinfo='skip'
            )
        )

        frame_data.append(
            go.Scatter(
                x=[pilot2['x'][i]],
                y=[pilot2['y'][i]],
                mode='markers',
                marker=dict(
                    size=14,
                    color=pilot2['color'],
                    symbol='circle',
                    line=dict(color='white', width=2)
                ),
                showlegend=False,
                hoverinfo='skip'
            )
        )

        # === DELTA SUBPLOT (row=1, col=2) ===
        if pilot1_is_faster:
            inverted_delta = [-d for d in delta[:i + 1]]

            frame_data.append(
                go.Scatter(
                    x=pilot1['distance'][:i + 1],
                    y=[0] * (i + 1),
                    mode='lines',
                    line=dict(color=pilot1['color'], width=2),
                    name=pilot1['name'],
                    showlegend=False,
                    hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s'
                )
            )

            frame_data.append(
                go.Scatter(
                    x=pilot2['distance'][:i + 1],
                    y=inverted_delta,
                    mode='lines',
                    line=dict(color=pilot2['color'], width=2),
                    name=pilot2['name'],
                    showlegend=False,
                    hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s'
                )
            )
        else:
            frame_data.append(
                go.Scatter(
                    x=pilot2['distance'][:i + 1],
                    y=[0] * (i + 1),
                    mode='lines',
                    line=dict(color=pilot2['color'], width=2),
                    name=pilot2['name'],
                    showlegend=False,
                    hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s'
                )
            )

            frame_data.append(
                go.Scatter(
                    x=pilot1['distance'][:i + 1],
                    y=delta[:i + 1],
                    mode='lines',
                    line=dict(color=pilot1['color'], width=2),
                    name=pilot1['name'],
                    showlegend=False,
                    hovertemplate='Distance: %{x:.0f}m<br>Delta: %{y:.3f}s'
                )
            )

        # === SPEED SUBPLOT (row=1, col=3) ===
        frame_data.append(
            go.Scatter(
                x=pilot1['distance'][:i + 1],
                y=pilot1['speed'][:i + 1],
                mode='lines',
                line=dict(color=pilot1['color'], width=2),
                name=pilot1['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h'
            )
        )

        frame_data.append(
            go.Scatter(
                x=pilot2['distance'][:i + 1],
                y=pilot2['speed'][:i + 1],
                mode='lines',
                line=dict(color=pilot2['color'], width=2),
                name=pilot2['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Speed: %{y:.1f} km/h'
            )
        )

        # === BRAKE SUBPLOT (row=2, col=2) ===
        frame_data.append(
            go.Scatter(
                x=pilot1['distance'][:i + 1],
                y=pilot1['brake'][:i + 1],
                mode='lines',
                line=dict(color=pilot1['color'], width=2),
                name=pilot1['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Brake: %{y:.1f}%'
            )
        )

        frame_data.append(
            go.Scatter(
                x=pilot2['distance'][:i + 1],
                y=pilot2['brake'][:i + 1],
                mode='lines',
                line=dict(color=pilot2['color'], width=2),
                name=pilot2['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Brake: %{y:.1f}%'
            )
        )

        # === THROTTLE SUBPLOT (row=2, col=3) ===
        frame_data.append(
            go.Scatter(
                x=pilot1['distance'][:i + 1],
                y=pilot1['throttle'][:i + 1],
                mode='lines',
                line=dict(color=pilot1['color'], width=2),
                name=pilot1['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Throttle: %{y:.1f}%'
            )
        )

        frame_data.append(
            go.Scatter(
                x=pilot2['distance'][:i + 1],
                y=pilot2['throttle'][:i + 1],
                mode='lines',
                line=dict(color=pilot2['color'], width=2),
                name=pilot2['name'],
                showlegend=False,
                hovertemplate='Distance: %{x:.0f}m<br>Throttle: %{y:.1f}%'
            )
        )

        frame = go.Frame(data=frame_data, name=str(i))
        frames.append(frame)

    return frames


def _configure_synchronized_layout(
    fig: go.Figure,
    circuit_x: List,
    circuit_y: List,
    pilot1: Dict,
    pilot2: Dict,
    delta: List,
    num_points: int
) -> None:
    """Configure layout for synchronized figure with all subplots and slider."""
    # Calculate axis ranges
    all_x = circuit_x + pilot1['x'] + pilot2['x']
    all_y = circuit_y + pilot1['y'] + pilot2['y']

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)

    x_padding = (x_max - x_min) * 0.10
    y_padding = (y_max - y_min) * 0.10

    max_distance = max(pilot1['distance'])
    max_speed = max(max(pilot1['speed']), max(pilot2['speed']))

    # Calculate delta range dynamically based on who is faster
    max_delta = max(delta)

    # Determine who is faster to calculate proper range
    lap_time1 = pilot1.get('lap_time')
    lap_time2 = pilot2.get('lap_time')
    pilot1_is_faster = lap_time1 < lap_time2 if lap_time1 and lap_time2 else True

    if pilot1_is_faster:
        # pilot2 shows NEGATIVE values (inverted delta below y=0)
        # Give most space below y=0 (110%), small space above (10%)
        delta_min_range = -(max_delta * 1.10)
        delta_max_range = max_delta * 0.10
    else:
        # pilot1 shows POSITIVE values (original delta above y=0)
        # Give most space above y=0 (110%), small space below (10%)
        delta_min_range = -(max_delta * 0.10)
        delta_max_range = max_delta * 1.10

    # Update layout
    fig.update_layout(
        template="plotly_dark",
        height=850,  # Increased height for slider space
        margin=dict(l=40, r=40, t=60, b=100),  # Increased bottom margin for slider
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified',  # Show all traces on hover
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
                },
                {
                    'label': '⟲ Reload',
                    'method': 'animate',
                    'args': [['0'], {
                        'frame': {'duration': 0, 'redraw': True},
                        'mode': 'immediate',
                        'transition': {'duration': 0}
                    }]
                }
            ],
            'direction': 'left',
            'pad': {'r': 10, 't': 10},
            'showactive': False,
            'x': 0.05,
            'xanchor': 'left',
            'y': 0,
            'yanchor': 'top'
        }],
        sliders=[{
            'active': 0,
            'yanchor': 'top',
            'y': -0.08,  # Moved slider further down
            'xanchor': 'left',
            'x': 0.05,
            'currentvalue': {
                'prefix': 'Frame: ',
                'visible': True,
                'xanchor': 'center',
                'font': {'size': 14, 'color': TextColor.PRIMARY}
            },
            'transition': {'duration': 0},
            'pad': {'b': 10, 't': 50},
            'len': 0.9,
            'steps': [
                {
                    'args': [[str(i)], {
                        'frame': {'duration': 0, 'redraw': True},
                        'mode': 'immediate',
                        'transition': {'duration': 0}
                    }],
                    'method': 'animate',
                    'label': str(i) if i % 50 == 0 else ''  # Show label every 50 frames
                }
                for i in range(num_points)
            ]
        }]
    )

    # Configure circuit subplot (row=1, col=1)
    fig.update_xaxes(
        showgrid=False,
        showticklabels=False,
        zeroline=False,
        scaleanchor="y",
        scaleratio=1,
        range=[x_min - x_padding, x_max + x_padding],
        fixedrange=True,
        row=1, col=1
    )

    fig.update_yaxes(
        showgrid=False,
        showticklabels=False,
        zeroline=False,
        range=[y_min - y_padding, y_max + y_padding],
        fixedrange=True,
        row=1, col=1
    )

    # Configure delta subplot (row=1, col=2)
    fig.update_xaxes(
        title="Distance (m)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, max_distance],
        row=1, col=2
    )

    fig.update_yaxes(
        title="Delta (s)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        zeroline=True,
        zerolinecolor='gray',
        zerolinewidth=2,
        range=[delta_min_range, delta_max_range],  # Fixed range
        row=1, col=2
    )

    # Configure speed subplot (row=1, col=3)
    fig.update_xaxes(
        title="Distance (m)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, max_distance],
        row=1, col=3
    )

    fig.update_yaxes(
        title="Speed (km/h)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, max_speed * 1.05],
        row=1, col=3
    )

    # Configure brake subplot (row=2, col=2)
    fig.update_xaxes(
        title="Distance (m)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, max_distance],
        row=2, col=2
    )

    fig.update_yaxes(
        title="Brake (%)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, 105],
        row=2, col=2
    )

    # Configure throttle subplot (row=2, col=3)
    fig.update_xaxes(
        title="Distance (m)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, max_distance],
        row=2, col=3
    )

    fig.update_yaxes(
        title="Throttle (%)",
        showgrid=True,
        gridcolor='rgba(128, 128, 128, 0.2)',
        range=[0, 105],
        row=2, col=3
    )
