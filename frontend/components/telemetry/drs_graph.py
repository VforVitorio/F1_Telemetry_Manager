"""
DRS Graph Component

This component renders the DRS (Drag Reduction System) graph for selected drivers.

Purpose:
    Show the specific zones where each driver activates DRS (reducing aerodynamic drag).
    It helps identify circuit DRS zones and compare DRS usage between drivers.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'drs'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Horizontal rectangles showing DRS activation zones
    - X axis: Distance on the circuit (meters)
    - Y axis: Driver labels (stacked layout)
    - FastF1 DRS values (from official documentation):
      * 0, 1: DRS Off
      * 2-7: Unknown/intermediate states
      * 8: Detected, Eligible (in activation zone but not yet open)
      * 10, 12, 14: DRS On (actively deployed)
    - Binarization: 0 = closed, 1 = open (>=10 = actively deployed)
    - Colored rectangles indicate zones where DRS is actively open

Public function:
    - render_drs_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _process_drs_data(data) -> pd.DataFrame
    - _create_drs_figure(data, drivers, colors) -> go.Figure

Backend integration:
    - FastF1 method: lap.get_car_data() returns 'DRS' column
    - Values: 0-1=Off, 8=Eligible, 10/12/14=On (see documentation above)
"""


import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from app.styles import Color, TextColor, Font, FontSize
from components.common.loading import render_loading_spinner
from components.common.ask_about_button import render_ask_about_button, TELEMETRY_TEMPLATE


def _render_section_title() -> None:
    """Renders the section title"""
    st.markdown(
        "<h3 style='text-align: center;'>DRS</h3>",
        unsafe_allow_html=True
    )


def _render_section_title_with_button(fig: go.Figure, driver: str, graph_type: str) -> None:
    """Renders the section title with compact AI button"""
    col1, col2 = st.columns([0.95, 0.05])

    with col1:
        st.markdown(
            "<h3 style='text-align: center;'>DRS</h3>",
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


def _process_drs_data(telemetry_data):
    """
    Processes DRS data by binarizing values

    FastF1 DRS values (from official documentation):
    - 0, 1 = Off
    - 2-7 = Unknown/intermediate states
    - 8 = Detected, Eligible once in Activation Zone (not yet open)
    - 10, 12, 14 = On (DRS actively open)

    Converts to: 0 = closed, 1 = open (only when DRS is actively deployed >= 10)
    """
    processed_data = telemetry_data.copy()
    # DRS is considered "open" only when value is 10 or higher (actively deployed)
    processed_data['drs'] = (processed_data['drs'] >= 10).astype(int)
    return processed_data


def render_drs_graph(telemetry_data_multi, selected_drivers, color_palette):
    """
    Renders the DRS graph for selected drivers.
    Shows telemetry data when laps are selected.

    Args:
        telemetry_data_multi: Dict with driver codes as keys and telemetry data as values
        selected_drivers: List of driver codes
        color_palette: List of colors for each driver
    """
    st.markdown("---")

    # Convert multi-driver telemetry data to DataFrame format
    if telemetry_data_multi is not None and isinstance(telemetry_data_multi, dict) and telemetry_data_multi:
        df_list = []
        drivers_with_data = []
        colors_with_data = []

        for idx, driver in enumerate(selected_drivers):
            if driver in telemetry_data_multi:
                driver_telemetry = telemetry_data_multi[driver]

                # Check if we have the required data
                if 'distance' in driver_telemetry and 'drs' in driver_telemetry:
                    distance = driver_telemetry.get('distance', [])
                    drs = driver_telemetry.get('drs', [])

                    # Convert to DataFrame
                    df_data = pd.DataFrame({
                        'driver': [driver] * len(distance),
                        'distance': distance,
                        'drs': drs
                    })
                    df_list.append(df_data)
                    drivers_with_data.append(driver)
                    if idx < len(color_palette):
                        colors_with_data.append(color_palette[idx])

        if df_list:
            # Combine all driver data
            combined_df = pd.concat(df_list, ignore_index=True)
            # Process DRS data (binarize)
            processed_data = _process_drs_data(combined_df)
            fig = _create_drs_figure(
                processed_data, drivers_with_data, colors_with_data)
            _render_section_title_with_button(fig, drivers_with_data[0], "drs")
            st.plotly_chart(fig, use_container_width=True)
        else:
            _render_section_title()
            render_loading_spinner()
    else:
        # Show loading spinner when no data is selected
        _render_section_title()
        render_loading_spinner()


def _create_drs_figure(telemetry_data, selected_drivers, color_palette):
    """Creates the Plotly figure for DRS visualization as a step line graph"""
    fig = go.Figure()

    if telemetry_data.empty:
        return fig

    # Calculate vertical spacing for each driver (stacked layout)
    # Each driver has 2 levels: 0 (Disabled) and 1 (Enabled)
    driver_count = len(selected_drivers)
    vertical_spacing = 2.5  # Increased space between drivers to avoid mixing

    # Add traces for each driver (stacked vertically for better visibility)
    for idx, driver in enumerate(selected_drivers):
        # Filter telemetry data for the current driver
        driver_data = telemetry_data[telemetry_data['driver'] == driver].copy()

        if not driver_data.empty:
            # Offset each driver vertically
            y_offset = idx * vertical_spacing

            # Get distance and DRS values
            distance_vals = driver_data['distance'].tolist()
            drs_vals = driver_data['drs'].tolist()

            # Add the offset to DRS values so each driver is stacked
            drs_vals_offset = [val + y_offset for val in drs_vals]

            # Create step line trace for this driver (no fill to avoid color mixing)
            fig.add_trace(go.Scatter(
                x=distance_vals,
                y=drs_vals_offset,
                name=driver,
                line=dict(color=color_palette[idx], width=3, shape='hv'),  # 'hv' creates step line
                mode='lines',
                hovertemplate='<b>%{fullData.name}</b><br>Distance: %{x:.0f}m<br>DRS: %{customdata}<extra></extra>',
                customdata=['Enabled' if val == 1 else 'Disabled' for val in drs_vals]
            ))

            # Add a horizontal separator line between drivers
            if idx < driver_count - 1:
                max_distance = max(distance_vals)
                fig.add_shape(
                    type="line",
                    x0=0,
                    x1=max_distance,
                    y0=y_offset + 1.25,
                    y1=y_offset + 1.25,
                    line=dict(color='rgba(128, 128, 128, 0.3)', width=1, dash='dash')
                )

    # Create custom tick positions and labels for DRS state
    # Show "Disabled" (0) and "Enabled" (1) on Y axis for each driver
    tick_positions = []
    tick_labels = []
    for idx, driver in enumerate(selected_drivers):
        y_offset = idx * vertical_spacing
        # Add two ticks per driver: one for "Disabled" (0) and one for "Enabled" (1)
        tick_positions.append(y_offset)  # Disabled
        tick_labels.append(f"Disabled")
        tick_positions.append(y_offset + 1)  # Enabled
        tick_labels.append(f"Enabled")

    # Configure layout with dark theme
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="DRS State",
        height=max(300, 130 * driver_count),
        margin=dict(l=80, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        hovermode='x unified',
        yaxis=dict(
            tickmode='array',
            tickvals=tick_positions,
            ticktext=tick_labels,
            range=[-0.3, driver_count * vertical_spacing - 1.25],
            showgrid=True,
            gridcolor='rgba(128, 128, 128, 0.2)'
        ),
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    return fig


def _generate_mock_drs_data(selected_drivers):
    """
    Generates mock DRS data for visualization testing.
    Simulates realistic F1 DRS patterns with specific DRS zones on straights.
    Returns raw FastF1-style values (0-14) that will be processed by _process_drs_data.
    """
    # Return empty DataFrame if no drivers selected
    if not selected_drivers:
        return pd.DataFrame(columns=['driver', 'distance', 'drs'])

    # Simulate a ~5km circuit with 100 data points
    distance = np.linspace(0, 5000, 100)
    mock_data = []

    for driver in selected_drivers:
        # Initialize DRS as closed (values 0-1 = Off)
        drs = np.full(len(distance), 0)  # 0 = DRS Off

        # Add DRS zones on typical straight sections
        # DRS zones are typically on main straights
        drs_zones = [
            (1000, 1800),  # First DRS zone
            (3200, 4000),  # Second DRS zone
        ]

        for zone_start, zone_end in drs_zones:
            # DRS is actively open (values 10/12/14 = On) in these zones
            zone_mask = (distance >= zone_start) & (distance <= zone_end)
            drs[zone_mask] = 12  # 12 = DRS On (actively deployed)

        # Create DataFrame for this driver
        driver_df = pd.DataFrame({
            'driver': driver,
            'distance': distance,
            'drs': drs
        })

        mock_data.append(driver_df)

    return pd.concat(mock_data, ignore_index=True)
