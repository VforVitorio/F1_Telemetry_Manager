"""
Lap Chart graph component with telemetry selection.
"""

import os
import base64
import streamlit as st
import plotly.graph_objects as go
from collections import defaultdict

from app.styles import Color, TextColor
from services.telemetry_service import TelemetryService
from utils.time_formatters import format_laptime_axis, get_tyre_emoji


# Cached API wrappers to avoid reloading data on page reruns
@st.cache_data(ttl=600, show_spinner=False)  # Cache for 10 minutes, hide auto spinner
def _fetch_lap_times_cached(year: int, gp: str, session: str, drivers_tuple: tuple):
    """Cached wrapper for lap times API call."""
    return TelemetryService.get_lap_times(year, gp, session, list(drivers_tuple))


@st.cache_data(ttl=600, show_spinner=False)  # Cache for 10 minutes, hide auto spinner
def _fetch_lap_telemetry_cached(year: int, gp: str, session: str, driver: str, lap_number: int):
    """Cached wrapper for lap telemetry API call."""
    return TelemetryService.get_lap_telemetry(year, gp, session, driver, lap_number)


def _detect_outliers_iqr(lap_times_data):
    """
    Detect outliers using IQR (Interquartile Range) method.

    Args:
        lap_times_data: List of lap time data dictionaries

    Returns:
        Set of lap indices that are outliers
    """
    # Group lap times by driver
    driver_times = defaultdict(list)
    lap_indices = {}

    for idx, lap in enumerate(lap_times_data):
        driver = lap['driver']
        lap_time = lap['lap_time']
        driver_times[driver].append(lap_time)
        lap_indices[(driver, lap['lap_number'])] = idx

    # Detect outliers per driver using IQR
    outlier_indices = set()

    for driver, times in driver_times.items():
        if len(times) < 4:  # Need at least 4 data points for IQR
            continue

        # Calculate Q1, Q3, and IQR
        times_sorted = sorted(times)
        n = len(times_sorted)
        q1_idx = n // 4
        q3_idx = 3 * n // 4

        q1 = times_sorted[q1_idx]
        q3 = times_sorted[q3_idx]
        iqr = q3 - q1

        # Define outlier bounds
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        # Mark outliers
        for idx, lap in enumerate(lap_times_data):
            if lap['driver'] == driver:
                if lap['lap_time'] < lower_bound or lap['lap_time'] > upper_bound:
                    outlier_indices.add(idx)

    return outlier_indices


def _filter_lap_data(lap_times_data, show_outliers, show_invalid_laps):
    """
    Filter lap data based on toggle states.

    Args:
        lap_times_data: List of lap time data dictionaries
        show_outliers: Whether to show outlier laps
        show_invalid_laps: Whether to show invalid laps

    Returns:
        Filtered list of lap data
    """
    # Detect outliers
    outlier_indices = _detect_outliers_iqr(lap_times_data)

    # Mark outliers in the data
    for idx in outlier_indices:
        lap_times_data[idx]['is_outlier'] = True

    # Filter based on toggles
    filtered_data = []
    for idx, lap in enumerate(lap_times_data):
        # Check if lap is an outlier
        is_outlier = idx in outlier_indices

        # Check if lap is invalid (from backend or outlier)
        is_invalid = not lap.get('is_accurate', True) or lap.get('is_pit_out_lap', False)

        # Apply filters
        if not show_outliers and is_outlier:
            continue
        if not show_invalid_laps and is_invalid:
            continue

        filtered_data.append(lap)

    return filtered_data


def render_lap_graph(selected_year, selected_gp, selected_session, selected_drivers, color_palette, render_buttons=False):
    """
    Display lap time graph with Plotly using real FastF1 data.
    Supports clicking on a lap to load telemetry data.

    Args:
        selected_year (int): Selected year
        selected_gp (str): Selected Grand Prix name
        selected_session (str): Selected session type
        selected_drivers (list): List of selected driver codes (e.g., ["VER", "LEC"])
        color_palette (list): List of colors for each driver
        render_buttons (bool): Whether to render control buttons after the graph
    """
    st.markdown("<h2 style='text-align: center;'>LAP CHART</h2>",
                unsafe_allow_html=True)

    # selected_drivers already contains driver codes (e.g., "VER", "LEC")
    # No need to split - they're already in the correct format

    # Fetch lap times from backend only if all required data is selected
    if (selected_year is not None and selected_gp is not None and
            selected_session is not None and selected_drivers):
        with st.spinner("Loading lap times from FastF1..."):
            success, lap_times_data, error = _fetch_lap_times_cached(
                selected_year,
                selected_gp,
                selected_session,
                # Convert to sorted tuple for caching
                tuple(sorted(selected_drivers))
            )

        if not success or not lap_times_data:
            st.warning(
                f"Could not load lap times: {error if error else 'No data available'}")
            lap_times_data = []
    else:
        lap_times_data = []

    # Create Plotly figure
    fig = go.Figure()

    # Get filter states from session
    show_outliers = st.session_state.get('show_outliers', False)
    show_invalid_laps = st.session_state.get('show_invalid_laps', True)

    # Use real lap times data from backend
    if lap_times_data:
        # Filter data based on toggle states
        filtered_data = _filter_lap_data(lap_times_data, show_outliers, show_invalid_laps)

        # Group lap times by driver
        driver_laps = defaultdict(lambda: {'lap_numbers': [], 'lap_times': [], 'compounds': [], 'is_outlier': []})

        for lap in filtered_data:
            driver_code = lap['driver']
            driver_laps[driver_code]['lap_numbers'].append(lap['lap_number'])
            driver_laps[driver_code]['lap_times'].append(lap['lap_time'])
            # Get compound from lap data, default to 'unknown'
            compound = lap.get('compound', 'unknown')
            driver_laps[driver_code]['compounds'].append(compound)
            driver_laps[driver_code]['is_outlier'].append(lap.get('is_outlier', False))

        # Add trace for each driver
        for idx, driver_code in enumerate(selected_drivers):
            if driver_code in driver_laps:
                lap_data = driver_laps[driver_code]

                # Create custom hover text with tyre info
                hover_texts = []
                for i, (lap_num, lap_time, compound) in enumerate(zip(
                    lap_data['lap_numbers'],
                    lap_data['lap_times'],
                    lap_data['compounds']
                )):
                    compound_display = compound.capitalize() if compound != 'unknown' else 'Unknown'
                    emoji = get_tyre_emoji(compound)

                    # Format lap time as MM:SS.mmm for hover
                    formatted_time = format_laptime_axis(lap_time)
                    hover_text = (
                        f"<b>{driver_code}</b><br>"
                        f"Lap: {lap_num}<br>"
                        f"Time: {formatted_time}<br>"
                        f"Tyre: {emoji} {compound_display}"
                    )
                    hover_texts.append(hover_text)

                fig.add_trace(go.Scatter(
                    x=lap_data['lap_numbers'],
                    y=lap_data['lap_times'],
                    mode='lines+markers',
                    name=driver_code,
                    line=dict(color=color_palette[idx % len(
                        color_palette)] if color_palette else Color.ACCENT, width=2),
                    marker=dict(size=6),
                    hovertemplate='%{text}<extra></extra>',
                    text=hover_texts,
                    customdata=[[driver_code] for _ in lap_data['lap_numbers']]
                ))
    else:
        # Show message if no data available
        st.info("No lap data available. Select drivers and ensure backend is running.")

    # Prepare custom tick formatting for y-axis (MM:SS.mmm format)
    yaxis_config = dict(
        gridcolor='rgba(128, 128, 128, 0.2)',
        showgrid=True
    )

    if lap_times_data:
        # Get the current y-axis range
        y_values = [lap['lap_time'] for lap in lap_times_data]
        if y_values:
            y_min = min(y_values)
            y_max = max(y_values)

            # Generate tick values (approximately 5-8 ticks)
            tick_range = y_max - y_min
            tick_interval = tick_range / 6  # Approximately 6 intervals

            # Round tick_interval to a nice number
            if tick_interval < 1:
                tick_interval = 0.5
            elif tick_interval < 2:
                tick_interval = 1
            elif tick_interval < 5:
                tick_interval = 2
            else:
                tick_interval = 5

            # Generate tick values
            first_tick = (int(y_min / tick_interval)) * tick_interval
            tick_vals = []
            tick_texts = []
            current_tick = first_tick
            while current_tick <= y_max + tick_interval:
                tick_vals.append(current_tick)
                tick_texts.append(format_laptime_axis(current_tick))
                current_tick += tick_interval

            # Add custom ticks to yaxis config
            yaxis_config['tickmode'] = 'array'
            yaxis_config['tickvals'] = tick_vals
            yaxis_config['ticktext'] = tick_texts

    # Add font size to yaxis config
    yaxis_config['tickfont'] = dict(size=16)

    # Configure layout
    fig.update_layout(
        xaxis_title="Lap Number",
        yaxis_title="Lap Time",
        template="plotly_dark",
        height=400,
        margin=dict(l=70, r=40, t=40, b=50),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        showlegend=True,
        xaxis=dict(
            gridcolor='rgba(128, 128, 128, 0.2)',
            showgrid=True,
            tickfont=dict(size=16)
        ),
        yaxis=yaxis_config,
        xaxis_title_font=dict(size=18),
        yaxis_title_font=dict(size=18)
    )

    # Display the chart with click event handling
    selected_points = st.plotly_chart(fig, width="stretch", on_select="rerun", key="lap_chart")

    # Handle click events on the chart
    if selected_points and hasattr(selected_points, 'selection') and selected_points.selection and hasattr(selected_points.selection, 'points'):
        _handle_lap_click(selected_points.selection.points, lap_times_data, selected_year, selected_gp, selected_session)

    # Render control buttons immediately after the graph if requested
    if render_buttons:
        render_control_buttons(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session)

    # Display tyre compound legend with lap counts per driver
    _render_tyre_compound_legend(lap_times_data, selected_drivers)

    # Display current telemetry selections if any
    if 'selected_laps_per_driver' in st.session_state and st.session_state['selected_laps_per_driver']:
        selections_text = ", ".join([f"**{driver}** (Lap {lap})"
                                    for driver, lap in st.session_state['selected_laps_per_driver'].items()])
        st.info(f"📊 Showing telemetry: {selections_text}")
        st.markdown("💡 **Tip:** Click on any point in the LAP CHART above to load that lap's telemetry")
    else:
        st.info("💡 **Tip:** Click on any point in the LAP CHART above to load telemetry data for that lap")

    # Return lap_times_data so control buttons can use it
    return lap_times_data


def _handle_lap_click(points, lap_times_data, selected_year, selected_gp, selected_session):
    """
    Handle click events on the lap chart to automatically load telemetry.

    Args:
        points: List of clicked points from Plotly selection
        lap_times_data: List of lap time data dictionaries
        selected_year: Selected year
        selected_gp: Selected Grand Prix
        selected_session: Selected session
    """
    if not points or not lap_times_data:
        return

    # Get the first clicked point (it comes as a dictionary)
    point = points[0]

    # Extract lap number from x-axis and driver from customdata
    # Points come as dictionaries with keys like 'x', 'y', 'customdata', etc.
    lap_number = int(point.get('x', 0)) if isinstance(point, dict) else int(point.x)

    # Get customdata which contains the driver code
    customdata = point.get('customdata', []) if isinstance(point, dict) else (point.customdata if hasattr(point, 'customdata') else [])
    driver = customdata[0] if customdata and len(customdata) > 0 else None

    if not driver or lap_number is None:
        return

    # Check if this lap+driver combination is already loaded
    current_selections = st.session_state.get('selected_laps_per_driver', {})
    if current_selections.get(driver) == lap_number:
        # Already loaded, no need to reload
        return

    # Load telemetry for the clicked lap
    with st.spinner(f"Loading telemetry for {driver} Lap {lap_number}..."):
        success, telemetry, error = _fetch_lap_telemetry_cached(
            selected_year,
            selected_gp,
            selected_session,
            driver,
            lap_number
        )

        if success and telemetry:
            # Get existing telemetry data or create new dict
            telemetry_data_multi = st.session_state.get('telemetry_data_multi', {})

            # Update telemetry for this driver
            telemetry_data_multi[driver] = telemetry

            # Update session state
            st.session_state['telemetry_data_multi'] = telemetry_data_multi

            # Update selected laps
            if 'selected_laps_per_driver' not in st.session_state:
                st.session_state['selected_laps_per_driver'] = {}
            st.session_state['selected_laps_per_driver'][driver] = lap_number

            st.success(f"✅ Loaded telemetry for {driver} Lap {lap_number}")
            st.rerun()
        else:
            st.error(f"⚠️ Could not load telemetry for {driver} Lap {lap_number}: {error if error else 'No data'}")
            st.info("💡 **Tip:** Some laps may not have telemetry data (pit laps, incomplete laps, or data quality issues). Try selecting a different lap.")


def _render_tyre_compound_legend(lap_times_data, selected_drivers):
    """
    Display tyre compound legend with lap counts per driver.

    Args:
        lap_times_data: List of lap time data dictionaries
        selected_drivers: List of selected driver codes
    """
    if not lap_times_data:
        return

    st.markdown("### 🏎️ Tyre Compounds Used")

    # Count laps per driver per compound
    driver_compound_counts = defaultdict(lambda: defaultdict(int))

    for lap in lap_times_data:
        driver = lap.get('driver')
        compound = lap.get('compound', 'unknown')
        if compound != 'unknown' and driver:
            driver_compound_counts[driver][compound] += 1

    # Get all unique compounds used
    all_compounds = set()
    for driver_compounds in driver_compound_counts.values():
        all_compounds.update(driver_compounds.keys())

    if not all_compounds:
        return

    # Sort compounds: soft, medium, hard, intermediate, wet
    compound_order = ['soft', 'medium', 'hard', 'intermediate', 'inter', 'wet']
    sorted_compounds = sorted(all_compounds, key=lambda x: compound_order.index(x.lower()) if x.lower() in compound_order else 999)

    # Display compounds and driver usage in an HTML table for better alignment
    num_compounds = len(sorted_compounds)
    col_width = 100 / num_compounds

    # Map compounds to image files
    image_map = {
        'soft': 'soft.png',
        'medium': 'medium.png',
        'hard': 'hard.png',
        'intermediate': 'inter.png',
        'inter': 'inter.png',
        'wet': 'wet.png'
    }

    # Get the path to the shared images directory
    # Current file: frontend/components/dashboard/lap_graph.py
    current_file_dir = os.path.dirname(os.path.abspath(__file__))  # frontend/components/dashboard
    components_dir = os.path.dirname(current_file_dir)  # frontend/components
    frontend_dir = os.path.dirname(components_dir)  # frontend
    img_dir = os.path.join(frontend_dir, 'shared', 'img')  # frontend/shared/img

    # Build HTML table (no leading/trailing whitespace)
    table_html = '<table style="width: 100%; border-collapse: collapse; border: none; margin: 0 auto;"><tr>'

    # Add compound columns
    for compound in sorted_compounds:
        # Get image file path
        image_file = image_map.get(compound.lower(), 'soft.png')
        image_path = os.path.join(img_dir, image_file)

        # Convert image to base64 for embedding in HTML
        img_base64 = ""
        try:
            with open(image_path, 'rb') as img_file:
                img_base64 = base64.b64encode(img_file.read()).decode()
        except Exception as e:
            print(f"Error loading image {image_path}: {e}")

        table_html += f'<td style="width: {col_width}%; text-align: center; vertical-align: top; border: none; padding: 10px;">'

        # Add image if loaded successfully
        if img_base64:
            table_html += f'<div style="margin-bottom: 10px;"><img src="data:image/png;base64,{img_base64}" style="width: 100px; height: auto;"></div>'

        table_html += f'<div style="font-weight: bold; font-size: 28px; margin-bottom: 20px;">{compound.capitalize()}</div>'

        # Add lap counts for each driver
        for driver in selected_drivers:
            lap_count = driver_compound_counts[driver].get(compound, 0)
            if lap_count > 0:
                table_html += f'<div style="font-size: 24px; margin-bottom: 10px;"><strong>{driver}:</strong> {lap_count} lap{"s" if lap_count > 1 else ""}</div>'

        table_html += '</td>'

    # Close table
    table_html += '</tr></table>'

    # Render the table
    st.markdown(table_html, unsafe_allow_html=True)


def render_control_buttons(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session):
    """
    Display control buttons below the graph with toggle functionality.

    Args:
        lap_times_data: List of lap time data dictionaries
        selected_drivers: List of selected driver codes
        selected_year: Selected year
        selected_gp: Selected Grand Prix
        selected_session: Selected session
    """
    btn_col1, btn_col2, btn_col3 = st.columns(3)

    with btn_col1:
        # Fastest lap selection - auto-selects fastest lap for each driver
        if st.button("🏁 SELECT FASTEST LAPS", width="stretch"):
            if lap_times_data and selected_drivers:
                _select_fastest_laps(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session)

    with btn_col2:
        # Toggle outliers visibility
        if 'show_outliers' not in st.session_state:
            st.session_state['show_outliers'] = False

        button_text = "HIDE OUTLIERS" if st.session_state['show_outliers'] else "SHOW OUTLIERS"
        if st.button(button_text, width="stretch"):
            st.session_state['show_outliers'] = not st.session_state['show_outliers']
            st.rerun()

    with btn_col3:
        # Toggle invalid laps visibility
        if 'show_invalid_laps' not in st.session_state:
            st.session_state['show_invalid_laps'] = True  # Show by default

        button_text = "HIDE INVALID LAPS" if st.session_state['show_invalid_laps'] else "SHOW INVALID LAPS"
        if st.button(button_text, width="stretch"):
            st.session_state['show_invalid_laps'] = not st.session_state['show_invalid_laps']
            st.rerun()

    # Display filter status
    _display_filter_status(lap_times_data)


def _display_filter_status(lap_times_data):
    """
    Display informational messages about active filters.

    Args:
        lap_times_data: List of lap time data dictionaries
    """
    if not lap_times_data:
        return

    show_outliers = st.session_state.get('show_outliers', False)
    show_invalid_laps = st.session_state.get('show_invalid_laps', True)

    # Count outliers and invalid laps
    outlier_indices = _detect_outliers_iqr(lap_times_data)
    invalid_count = sum(1 for lap in lap_times_data
                       if not lap.get('is_accurate', True) or lap.get('is_pit_out_lap', False))

    messages = []

    if show_outliers:
        messages.append(f"📊 Showing {len(outlier_indices)} outlier laps")
    else:
        if len(outlier_indices) > 0:
            messages.append(f"🚫 Hiding {len(outlier_indices)} outlier laps")

    if not show_invalid_laps:
        if invalid_count > 0:
            messages.append(f"🚫 Hiding {invalid_count} invalid laps")

    if messages:
        st.info(" | ".join(messages))


def _select_fastest_laps(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session):
    """
    Automatically select the fastest lap for each driver.

    Args:
        lap_times_data: List of lap time data dictionaries
        selected_drivers: List of selected driver codes
        selected_year: Selected year
        selected_gp: Selected Grand Prix
        selected_session: Selected session
    """
    fastest_laps = {}

    # Find fastest lap for each driver
    for driver in selected_drivers:
        driver_laps = [lap for lap in lap_times_data if lap['driver'] == driver]
        if driver_laps:
            # Find lap with minimum time
            fastest_lap = min(driver_laps, key=lambda x: x['lap_time'])
            fastest_laps[driver] = fastest_lap['lap_number']

    if fastest_laps:
        # Load telemetry for fastest laps
        telemetry_data_multi = {}
        all_successful = True

        with st.spinner("Loading fastest laps telemetry..."):
            for driver, lap_num in fastest_laps.items():
                success, telemetry, error = _fetch_lap_telemetry_cached(
                    selected_year,
                    selected_gp,
                    selected_session,
                    driver,
                    lap_num
                )

                if success and telemetry:
                    telemetry_data_multi[driver] = telemetry
                else:
                    all_successful = False
                    st.warning(f"⚠️ Could not load telemetry for {driver} fastest lap {lap_num}")

        # Store in session state
        if telemetry_data_multi:
            st.session_state['telemetry_data_multi'] = telemetry_data_multi
            st.session_state['selected_laps_per_driver'] = fastest_laps

            if all_successful:
                st.success(f"✅ Loaded fastest laps for all drivers")
            st.rerun()
        else:
            st.error("⚠️ Could not load any fastest lap telemetry")
