"""
Lap Chart graph component with telemetry selection.
"""

import os
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

    # Display the chart
    st.plotly_chart(fig, use_container_width=True)

    # Render control buttons immediately after the graph if requested
    if render_buttons:
        render_control_buttons(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session)

    # Display tyre compound legend with lap counts per driver
    _render_tyre_compound_legend(lap_times_data, selected_drivers)

    # Add lap selector for telemetry - one lap per driver
    _render_lap_selector_section(
        lap_times_data, selected_drivers, selected_year, selected_gp, selected_session
    )

    # Return lap_times_data so control buttons can use it
    return lap_times_data


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

    # Display compounds and driver usage in a table-like format
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # Create columns for each compound
    cols = st.columns(len(sorted_compounds))

    for idx, compound in enumerate(sorted_compounds):
        with cols[idx]:
            # Map compound to image file
            image_map = {
                'soft': 'soft.png',
                'medium': 'medium.png',
                'hard': 'hard.png',
                'intermediate': 'inter.png',
                'inter': 'inter.png',
                'wet': 'wet.png'
            }

            image_file = image_map.get(compound.lower())

            # Center the content
            st.markdown("<div style='text-align: center;'>", unsafe_allow_html=True)

            # Add image - smaller and centered
            if image_file:
                image_path = os.path.join(current_dir, '..', '..', 'shared', 'img', image_file)
                try:
                    # Center image with columns
                    col1, col2, col3 = st.columns([1, 2, 1])
                    with col2:
                        st.image(image_path, width=100)
                except Exception:
                    emoji = get_tyre_emoji(compound)
                    st.markdown(f"<div style='text-align: center; font-size: 60px; margin-bottom: 10px;'>{emoji}</div>", unsafe_allow_html=True)

            # Compound name - extra large
            st.markdown(
                f"<div style='text-align: center; font-weight: bold; font-size: 28px; margin-top: 10px; margin-bottom: 20px;'>"
                f"{compound.capitalize()}"
                f"</div>",
                unsafe_allow_html=True
            )

            # Lap counts for each driver - extra large text
            for driver in selected_drivers:
                lap_count = driver_compound_counts[driver].get(compound, 0)
                if lap_count > 0:
                    st.markdown(
                        f"<div style='text-align: center; font-size: 24px; margin-bottom: 10px;'>"
                        f"<strong>{driver}:</strong> {lap_count} lap{'s' if lap_count > 1 else ''}"
                        f"</div>",
                        unsafe_allow_html=True
                    )

            st.markdown("</div>", unsafe_allow_html=True)


def _render_lap_selector_section(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session):
    """
    Render lap selector section for telemetry data.

    Args:
        lap_times_data: List of lap time data dictionaries
        selected_drivers: List of selected driver codes
        selected_year: Selected year
        selected_gp: Selected Grand Prix
        selected_session: Selected session
    """
    if not lap_times_data or not selected_drivers:
        st.info("💡 Select drivers above to view lap telemetry data")
        return

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("### 📊 Select laps for each driver to compare telemetry")

    # Initialize selected_laps_per_driver if not exists
    if 'selected_laps_per_driver' not in st.session_state:
        st.session_state['selected_laps_per_driver'] = {}

    # Create a row for each driver
    lap_selections = {}
    for driver in selected_drivers:
        col1, col2, col3 = st.columns([2, 3, 1])

        with col1:
            st.markdown(f"**{driver}**")

        with col2:
            # Get lap numbers for this driver
            driver_laps = [lap['lap_number'] for lap in lap_times_data
                           if lap['driver'] == driver]
            driver_laps.sort()

            if driver_laps:
                # Use previous selection if available, otherwise default to first lap
                default_lap = st.session_state['selected_laps_per_driver'].get(
                    driver, driver_laps[0])
                if default_lap not in driver_laps:
                    default_lap = driver_laps[0]

                selected_lap = st.selectbox(
                    "Lap Number",
                    options=driver_laps,
                    index=driver_laps.index(default_lap),
                    key=f"lap_selector_{driver}",
                    label_visibility="collapsed"
                )
                lap_selections[driver] = selected_lap
            else:
                st.warning("No laps available")
                lap_selections[driver] = None

        with col3:
            st.markdown("<br>", unsafe_allow_html=True)

    # Load button at the bottom
    st.markdown("<br>", unsafe_allow_html=True)
    load_button = st.button("🔄 LOAD ALL TELEMETRY",
                            type="primary", use_container_width=True)

    # Load telemetry when button is clicked
    if load_button:
        _load_telemetry_for_selected_laps(
            lap_selections, selected_year, selected_gp, selected_session
        )

    # Display current selections
    if 'selected_laps_per_driver' in st.session_state and st.session_state['selected_laps_per_driver']:
        selections_text = ", ".join([f"**{driver}** (Lap {lap})"
                                    for driver, lap in st.session_state['selected_laps_per_driver'].items()])
        st.info(f"📊 Showing telemetry: {selections_text}")


def _load_telemetry_for_selected_laps(lap_selections, selected_year, selected_gp, selected_session):
    """
    Load telemetry data for selected laps.

    Args:
        lap_selections: Dictionary mapping driver codes to selected lap numbers
        selected_year: Selected year
        selected_gp: Selected Grand Prix
        selected_session: Selected session
    """
    if not lap_selections:
        return

    telemetry_data_multi = {}
    all_successful = True

    with st.spinner("Loading telemetry for all drivers..."):
        for driver, lap_num in lap_selections.items():
            if lap_num is not None:
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
                    st.warning(
                        f"⚠️ Could not load telemetry for {driver} lap {lap_num}: {error if error else 'No data'}")

    # Store in session state
    if telemetry_data_multi:
        st.session_state['telemetry_data_multi'] = telemetry_data_multi
        st.session_state['selected_laps_per_driver'] = lap_selections

        if all_successful:
            st.success("✅ Loaded telemetry for all drivers")
        st.rerun()
    else:
        st.error("⚠️ Could not load any telemetry data")
        st.info(
            "💡 **Tip:** Some laps may not have telemetry data (pit laps, incomplete laps, or data quality issues). Try selecting different laps.")


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
        if st.button("🏁 SELECT FASTEST LAPS", use_container_width=True):
            if lap_times_data and selected_drivers:
                _select_fastest_laps(lap_times_data, selected_drivers, selected_year, selected_gp, selected_session)

    with btn_col2:
        # Toggle outliers visibility
        if 'show_outliers' not in st.session_state:
            st.session_state['show_outliers'] = False

        button_text = "HIDE OUTLIERS" if st.session_state['show_outliers'] else "SHOW OUTLIERS"
        if st.button(button_text, use_container_width=True):
            st.session_state['show_outliers'] = not st.session_state['show_outliers']
            st.rerun()

    with btn_col3:
        # Toggle invalid laps visibility
        if 'show_invalid_laps' not in st.session_state:
            st.session_state['show_invalid_laps'] = True  # Show by default

        button_text = "HIDE INVALID LAPS" if st.session_state['show_invalid_laps'] else "SHOW INVALID LAPS"
        if st.button(button_text, use_container_width=True):
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
