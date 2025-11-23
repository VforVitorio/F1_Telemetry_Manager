"""
Gear Graph Component

This component renders the Gear graph for selected drivers.

Purpose:
    Show the gear used by each driver at each point on the circuit. It allows
    comparing gear selection between drivers and identifying differences in driving technique.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'gear'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Step/stairstep chart (go.Scatter with line_shape='hv' or 'vh')
    - X axis: Distance on the circuit (meters)
    - Y axis: Gear number (1-8)
    - Discrete values: 1, 2, 3, 4, 5, 6, 7, 8
    - Horizontal lines with vertical transitions (step plot)

Public function:
    - render_gear_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_gear_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'nGear' (gear number 1-8)
"""

import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor
from components.common.loading import render_loading_spinner
from components.common.ask_about_button import render_ask_about_button, TELEMETRY_TEMPLATE


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>GEAR</h3>",
        unsafe_allow_html=True
    )


def _render_section_title_with_button(fig: go.Figure, driver: str, graph_type: str) -> None:
    """Renders the section title with compact AI button"""
    col1, col2 = st.columns([0.95, 0.05])

    with col1:
        st.markdown(
            "<h3 style='text-align: center;'>GEAR</h3>",
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


def render_gear_graph(telemetry_data_multi, selected_drivers, color_palette):
    """
    Renders the gear graph for selected drivers.
    Shows telemetry data when laps are selected.

    Args:
        telemetry_data_multi: Dict with driver codes as keys and telemetry data as values
        selected_drivers: List of driver codes
        color_palette: List of colors for each driver
    """
    st.markdown("---")
    _render_section_title()

    # Convert multi-driver telemetry data to DataFrame format
    if telemetry_data_multi is not None and isinstance(telemetry_data_multi, dict) and telemetry_data_multi:
        df_list = []
        drivers_with_data = []
        colors_with_data = []

        for idx, driver in enumerate(selected_drivers):
            if driver in telemetry_data_multi:
                driver_telemetry = telemetry_data_multi[driver]

                # Check if we have the required data
                if 'distance' in driver_telemetry and 'gear' in driver_telemetry:
                    distance = driver_telemetry.get('distance', [])
                    gear = driver_telemetry.get('gear', [])

                    # Convert to DataFrame
                    df_data = pd.DataFrame({
                        'driver': [driver] * len(distance),
                        'distance': distance,
                        'gear': gear
                    })
                    df_list.append(df_data)
                    drivers_with_data.append(driver)
                    if idx < len(color_palette):
                        colors_with_data.append(color_palette[idx])

        if df_list:
            # Combine all driver data
            combined_df = pd.concat(df_list, ignore_index=True)
            fig = _create_gear_figure(
                combined_df, drivers_with_data, colors_with_data)
            st.plotly_chart(fig, use_container_width=True)
        else:
            _render_section_title()
            render_loading_spinner()
    else:
        # Show loading spinner when no data is selected
        _render_section_title()
        render_loading_spinner()


def _create_gear_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for gear visualization with step plot"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Add a step line trace for each driver
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data['driver'] == driver]

        if not driver_data.empty:
            # Create step plot showing gear selection across the circuit
            # 'hv' shape creates horizontal-then-vertical steps (stairstep pattern)
            fig.add_trace(go.Scatter(
                # Distance along the circuit (from FastF1)
                x=driver_data['distance'],
                # Gear number: 1-8 (from FastF1 nGear column)
                y=driver_data['gear'],
                name=driver,
                line=dict(color=color_palette[idx],
                          width=2, shape='hv'),  # Step plot
                mode='lines',
                hovertemplate='Distance: %{x:.0f}m<br>Gear: %{y:.0f}<extra></extra>'
            ))

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Gear",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified',  # Show all drivers' values when hovering
        yaxis=dict(
            tickmode='linear',  # Show every gear number
            tick0=1,            # Start at gear 1
            dtick=1             # Show ticks for each gear (1, 2, 3, ...)
        )
    )

    return fig


def _generate_mock_gear_data(selected_drivers):
    """
    Generates mock gear data for visualization testing.
    Simulates realistic F1 gear selection patterns across a circuit.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'gear'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Create a realistic gear pattern based on speed profile
        # Low gears in corners, high gears on straights
        gear = np.zeros(len(distance))

        # Define circuit sections with typical gear usage
        # Slow corners: gears 2-4, medium corners: gears 4-6, straights: gears 7-8
        for i, dist in enumerate(distance):
            # Main straight (start/finish)
            if dist < 600:
                gear[i] = 8
            # Slow corner 1
            elif dist < 900:
                gear[i] = 3
            # Medium corner complex
            elif dist < 1300:
                gear[i] = 5
            # Straight
            elif dist < 1900:
                gear[i] = 7
            # Slow corner 2
            elif dist < 2200:
                gear[i] = 2
            # Medium section
            elif dist < 2800:
                gear[i] = 6
            # Slow corner 3
            elif dist < 3100:
                gear[i] = 3
            # Long straight
            elif dist < 3900:
                gear[i] = 8
            # Medium corner
            elif dist < 4400:
                gear[i] = 5
            # Final corners
            else:
                gear[i] = 4

        # Add small variations between drivers
        gear = gear + np.random.choice([-1, 0, 0, 1], size=len(gear))
        # Ensure gears stay in valid range (1-8)
        gear = np.clip(gear, 1, 8)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'gear': gear.astype(int)
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
