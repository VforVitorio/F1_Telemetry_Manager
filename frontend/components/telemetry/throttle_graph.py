"""
Throttle Graph Component

This component renders the Throttle graph for selected drivers.

Purpose:
    Show the throttle percentage applied by each driver along the circuit. It allows
    analyzing full-throttle zones, partial-throttle zones, and coasting sections.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'throttle'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Filled area chart (go.Scatter with fill='tozeroy')
    - X axis: Distance on the circuit (meters)
    - Y axis: Throttle (0-100%)
    - 100% = full throttle
    - 0% = no throttle
    - Filled area from 0 up to the throttle value

Public function:
    - render_throttle_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_throttle_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'Throttle' (0-100%)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner
from components.common.ask_about_button import render_ask_about_button, TELEMETRY_TEMPLATE


def _render_section_title() -> None:
    """ Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'> THROTTLE (%)</h3>",
        unsafe_allow_html=True
    )


def _render_section_title_with_button(fig: go.Figure, driver: str, graph_type: str) -> None:
    """Renders the section title with compact AI button"""
    col1, col2 = st.columns([0.95, 0.05])

    with col1:
        st.markdown(
            "<h3 style='text-align: center;'> THROTTLE (%)</h3>",
            unsafe_allow_html=True
        )

    with col2:
        selected_lap = st.session_state.get('selected_lap', {})
        context = {
            "graph_type": graph_type,
            "driver_name": driver,
            "session_type": selected_lap.get('session', 'Unknown'),
            "gp_name": selected_lap.get('gp', 'Unknown GP'),
            "year": str(selected_lap.get('year', '')),
            "lap_number": str(selected_lap.get('lap_number', ''))
        }

        render_ask_about_button(
            chart_fig=fig,
            chart_type=f"{graph_type}_graph",
            prompt_template=TELEMETRY_TEMPLATE,
            context=context,
            compact=True,
            tooltip=f"Ask AI to analyze {graph_type} data"
        )


def render_throttle_graph(telemetry_data, selected_drivers, color_palette):
    """
    Renders the throttle graph for selected drivers.
    Shows telemetry data when a lap is selected.
    """
    st.markdown("---")

    # Convert telemetry_data to DataFrame format if it's a dict from the API
    if telemetry_data is not None and isinstance(telemetry_data, dict):
        # Check if we have the required data
        if 'distance' in telemetry_data and 'throttle' in telemetry_data:
            driver = telemetry_data.get('driver', 'Unknown')
            distance = telemetry_data.get('distance', [])
            throttle = telemetry_data.get('throttle', [])

            # Convert to DataFrame
            df_data = pd.DataFrame({
                'driver': [driver] * len(distance),
                'distance': distance,
                'throttle': throttle
            })

            # Get driver color
            from components.common.driver_colors import get_driver_color
            driver_color = get_driver_color(driver)

            # Create figure
            fig = _create_throttle_figure(df_data, [driver], [driver_color])

            # Render title with compact AI button
            _render_section_title_with_button(fig, driver, "throttle")

            # Display figure
            st.plotly_chart(fig, use_container_width=True)
        else:
            _render_section_title()
            render_loading_spinner()
    else:
        # Show loading spinner when no data is selected
        _render_section_title()
        render_loading_spinner()


def _create_throttle_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for throttle visualization with filled area"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add line trace with filled area for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data["driver"] == driver]

        if not driver_data.empty:
            # Create line chart showing throttle application
            fig.add_trace(
                go.Scatter(
                    # Distance along the circuit (from FastF1)
                    x=driver_data["distance"],
                    # Throttle percentage 0-100% (from FastF1)
                    y=driver_data["throttle"],
                    name=driver,
                    line=dict(color=color_palette[idx], width=2),
                    mode='lines',
                    hovertemplate='Distance: %{x:.0f}m<br>Throttle: %{y:.1f}%<extra></extra>'
                )
            )

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Throttle (%)",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode="x unified"  # Show all drivers' values when hovering
    )

    return fig


def _generate_mock_throttle_data(selected_drivers):
    """
    Generates mock throttle data for visualization testing.
    Simulates realistic F1 throttle patterns with full throttle zones and lifting zones.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'throttle'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Base throttle pattern: full throttle on straights, lift for corners
        # Create a realistic throttle profile
        throttle = 70 + 30 * np.sin(distance / 400) + \
            np.random.normal(0, 3, len(distance))

        # Add corner zones (throttle lifts)
        for corner in [800, 1500, 2500, 3500, 4200]:
            corner_effect = 80 * np.exp(-((distance - corner) ** 2) / 40000)
            throttle -= corner_effect

        # Ensure realistic throttle range (0-100%)
        throttle = np.clip(throttle, 0, 100)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'throttle': throttle
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
