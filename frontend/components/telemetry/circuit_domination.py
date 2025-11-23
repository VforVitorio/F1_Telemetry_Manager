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
    - _create_circuit_figure(data) -> go.Figure
"""

import streamlit as st
import plotly.graph_objects as go
from app.styles import Color, TextColor
from services.telemetry_service import TelemetryService
from components.common.loading import render_loading_spinner
from components.common.ask_about_button import render_ask_about_button, CIRCUIT_DOMINATION_TEMPLATE


@st.cache_data(ttl=600)  # Cache for 10 minutes
def _fetch_circuit_domination_cached(year: int, gp: str, session: str, drivers_tuple: tuple):
    """
    Cached wrapper for circuit domination API call.
    Uses tuple for drivers because lists aren't hashable for caching.
    """
    return TelemetryService.get_circuit_domination(
        year=year,
        gp=gp,
        session=session,
        drivers=list(drivers_tuple)
    )


def render_circuit_domination_section(
    telemetry_data,
    selected_drivers,
    color_palette,
    year: int,
    gp: str,
    session: str
) -> None:
    """
    Render the Circuit Domination section with the circuit visualization.

    This function displays:
    - A horizontal separator
    - A centered title "CIRCUIT DOMINATION"
    - A circuit map colored by driver dominance in microsectors

    Args:
        telemetry_data: Telemetry data containing GPS coordinates and timing (legacy param)
        selected_drivers: List of selected driver identifiers
        color_palette: List of colors for each driver
        year: Racing season year
        gp: Grand Prix name
        session: Session type (FP1, FP2, FP3, Q, R)
    """
    # Horizontal separator
    st.markdown("---")

    # Check if all required data is selected
    if (year is None or gp is None or session is None or
        not selected_drivers or len(selected_drivers) < 2):
        # Render the section title
        _render_section_title()
        # Show loading spinner waiting for data selection
        render_loading_spinner()
        return

    # Fetch real data from backend API (cached to avoid reloading on page reruns)
    with st.spinner("Loading circuit domination data..."):
        success, circuit_data, error = _fetch_circuit_domination_cached(
            year=year,
            gp=gp,
            session=session,
            drivers_tuple=tuple(sorted(selected_drivers))  # Convert to sorted tuple for caching
        )

    if success and circuit_data:
        # Create the circuit figure
        fig = _create_circuit_figure(circuit_data)

        # Use columns to center and reduce width (50% of page width)
        _, center_container, _ = st.columns([1, 2, 1])

        with center_container:
            # Render title with AI button inside the centered container
            _render_section_title_with_button(
                fig=fig,
                circuit_data=circuit_data,
                year=year,
                gp=gp,
                session=session
            )
            st.plotly_chart(fig, use_container_width=True)
    else:
        # Render the section title
        _render_section_title()
        # Show error message
        st.error(f"❌ Failed to load circuit data: {error}")


def _render_section_title() -> None:
    """
    Render the centered section title.
    """
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT DOMINATION</h2>",
        unsafe_allow_html=True
    )


def _render_section_title_with_button(
    fig: go.Figure,
    circuit_data: dict,
    year: int,
    gp: str,
    session: str
) -> None:
    """
    Render section title with compact AI button.
    """
    col1, col2 = st.columns([0.97, 0.03])

    with col1:
        st.markdown(
            "<h2 style='text-align: center;'>CIRCUIT DOMINATION</h2>",
            unsafe_allow_html=True
        )

    with col2:
        # Extract driver information
        drivers = circuit_data.get('drivers', [])
        drivers_list = "\n".join([f"- {d['driver']}" for d in drivers])

        context = {
            "session_type": session,
            "gp_name": gp,
            "year": str(year),
            "drivers_list": drivers_list
        }

        render_ask_about_button(
            chart_fig=fig,
            chart_type="circuit_domination",
            prompt_template=CIRCUIT_DOMINATION_TEMPLATE,
            context=context,
            compact=True,
            tooltip="Ask AI to analyze circuit domination"
        )


def _create_circuit_figure(circuit_data: dict) -> go.Figure:
    """
    Creates the Plotly figure for circuit visualization.

    Args:
        circuit_data: Dictionary containing 'x', 'y' coordinates, 'colors' for each segment,
                     and 'drivers' metadata for legend

    Returns:
        go.Figure: Plotly figure with the circuit visualization
    """
    fig = go.Figure()

    x = circuit_data['x']
    y = circuit_data['y']
    colors = circuit_data['colors']
    drivers = circuit_data.get('drivers', [])

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

    # Add invisible traces for legend (one per driver)
    for driver_info in drivers:
        fig.add_trace(go.Scatter(
            x=[None],
            y=[None],
            mode='lines',
            line=dict(color=driver_info['color'], width=4),
            name=driver_info['driver'],
            showlegend=True
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
        hovermode=False,
        showlegend=True,
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01,
            bgcolor="rgba(0,0,0,0.5)",
            bordercolor=TextColor.PRIMARY,
            borderwidth=1
        )
    )

    return fig
