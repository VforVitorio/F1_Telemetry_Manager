"""
Dashboard page - Lap Chart visualization.
Displays data selectors, lap time graphs, and control buttons.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
from services.telemetry_service import TelemetryService
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

# Standard library imports
import streamlit as st
import plotly.graph_objects as go
import importlib

# Project imports
from app.styles import Color, TextColor
from components.telemetry.circuit_domination import render_circuit_domination_section
from components.telemetry.speed_graph import render_speed_graph
from components.telemetry.delta_graph import render_delta_graph
from components.telemetry.throttle_graph import render_throttle_graph
from components.telemetry.brake_graph import render_brake_graph
from components.telemetry.rpm_graph import render_rmp_graph
from components.telemetry.gear_graph import render_gear_graph
from components.telemetry.drs_graph import render_drs_graph
from components.common.chart_styles import apply_telemetry_chart_styles
from components.common.link_button import render_link_button
from components.common.driver_colors import get_driver_color, DRIVER_COLORS
from utils.data_loaders import load_gps_for_year, load_sessions_for_gp
import services.telemetry_service
importlib.reload(services.telemetry_service)


# Cached API wrappers to avoid reloading data on page reruns
@st.cache_data(ttl=600, show_spinner=False)  # Cache for 10 minutes, hide auto spinner
def _fetch_lap_times_cached(year: int, gp: str, session: str, drivers_tuple: tuple):
    """Cached wrapper for lap times API call."""
    return TelemetryService.get_lap_times(year, gp, session, list(drivers_tuple))


@st.cache_data(ttl=600, show_spinner=False)  # Cache for 10 minutes, hide auto spinner
def _fetch_lap_telemetry_cached(year: int, gp: str, session: str, driver: str, lap_number: int):
    """Cached wrapper for lap telemetry API call."""
    return TelemetryService.get_lap_telemetry(year, gp, session, driver, lap_number)


def render_custom_css():
    """
    Apply custom CSS for multiselect driver pills (transparent background, no borders).
    """
    css_content = """
        <style>
        /* Aggressively remove ALL backgrounds from multiselect pills */
        span[data-baseweb="tag"],
        span[data-baseweb="tag"] > span,
        span[data-baseweb="tag"] > span > span,
        span[data-baseweb="tag"] * {
            background-color: transparent !important;
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 2px 3px !important;
            margin-right: 6px !important;
        }

        /* Target div tags as well */
        div[data-baseweb="tag"],
        div[data-baseweb="tag"] > span,
        div[data-baseweb="tag"] * {
            background-color: transparent !important;
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
        }

        /* Hide the close/X button on pills */
        span[data-baseweb="tag"] svg,
        div[data-baseweb="tag"] svg {
            display: none !important;
        }

        /* Make driver codes bold and slightly larger */
        span[data-baseweb="tag"] span,
        div[data-baseweb="tag"] span {
            font-weight: 700 !important;
            font-size: 14px !important;
        }

        /* Style dropdown options */
        div[data-baseweb="select"] li[role="option"] {
            font-weight: 600 !important;
        }
        </style>
    """

    st.markdown(css_content, unsafe_allow_html=True)


def apply_driver_pill_colors(selected_drivers):
    """
    Apply team colors to driver pills based on selection order using nth-of-type.

    Args:
        selected_drivers (list): List of selected driver codes in order
    """
    if not selected_drivers:
        return

    css = "<style>"
    for i, driver_code in enumerate(selected_drivers, start=1):
        color = get_driver_color(driver_code)
        css += f"""
        span[data-baseweb="tag"]:nth-of-type({i}) span,
        div[data-baseweb="tag"]:nth-of-type({i}) span {{
            color: {color} !important;
        }}
        """
    css += "</style>"

    st.markdown(css, unsafe_allow_html=True)


def render_header():
    """
    Display page header.
    """
    st.markdown("<h1 style='text-align: center;'>F1 TELEMETRY MANAGER</h1>",
                unsafe_allow_html=True)
    st.markdown("---")


def render_data_selectors():
    """
    Render the 4 data selectors (Year, GP, Session, Pilots).

    Returns:
        tuple: (selected_year, selected_gp, selected_session, selected_drivers, color_palette)
    """
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # Year selector - no default selection
        year_options = [None, 2024, 2023]
        selected_year = st.selectbox(
            "YEAR",
            options=year_options,
            index=0,
            format_func=lambda x: "-- Select Year --" if x is None else str(x)
        )

    with col2:
        # GP selector - only load if year is selected
        if selected_year is not None:
            gp_options = [None] + load_gps_for_year(selected_year)
        else:
            gp_options = [None]

        selected_gp = st.selectbox(
            "GP",
            options=gp_options,
            index=0,
            format_func=lambda x: "-- Select GP --" if x is None else x,
            disabled=selected_year is None
        )

        # Validate: China was not held in 2023
        if selected_year == 2023 and selected_gp == "Chinese Grand Prix":
            st.error(
                "⚠️ The Chinese Grand Prix was not held in the 2023 season. Please select another GP.")
            selected_gp = None

    with col3:
        # Session selector - only load if year and GP are selected
        if selected_year is not None and selected_gp is not None:
            session_options = [None] + \
                load_sessions_for_gp(selected_year, selected_gp)
        else:
            session_options = [None]

        selected_session = st.selectbox(
            "SESSION",
            options=session_options,
            index=0,
            format_func=lambda x: "-- Select Session --" if x is None else x,
            disabled=selected_year is None or selected_gp is None
        )

    with col4:
        # TODO: Replace with dynamic drivers based on selected year, GP, and session
        # drivers = fetch_drivers(selected_year, selected_gp, selected_session)
        # GET /api/v1/telemetry/drivers?year={year}&gp={gp}&session={session}

        # F1 2024 Complete driver lineup (24 drivers) - codes only
        driver_options = [
            "VER", "PER",  # Red Bull
            "LEC", "SAI",  # Ferrari
            "HAM", "RUS",  # Mercedes
            "NOR", "PIA",  # McLaren
            "ALO", "STR",  # Aston Martin
            "GAS", "OCO",  # Alpine
            "ALB", "COL", "SAR",  # Williams
            "TSU", "RIC", "LAW",  # RB
            "BOT", "ZHO",  # Sauber
            "MAG", "HUL", "BEA",  # Haas
            "DOO",  # Reserve/Test
        ]

        selected_drivers = st.multiselect(
            "DRIVERS",
            options=driver_options,
            default=[],
            max_selections=3,
            disabled=selected_year is None or selected_gp is None or selected_session is None
        )

        # Get official team colors for selected drivers
        color_palette = [get_driver_color(code) for code in selected_drivers]

    return selected_year, selected_gp, selected_session, selected_drivers, color_palette


def get_tyre_emoji(compound: str) -> str:
    """
    Get emoji representation for tyre compound.

    Args:
        compound: Tyre compound name (soft, medium, hard, intermediate, wet)

    Returns:
        Emoji string
    """
    compound_lower = compound.lower() if compound else 'unknown'

    emoji_map = {
        'soft': '🔴',      # Red circle for soft
        'medium': '🟡',    # Yellow circle for medium
        'hard': '⚪',      # White circle for hard
        'intermediate': '🟢',  # Green circle for intermediate
        'inter': '🟢',     # Alternative name
        'wet': '🔵'        # Blue circle for wet
    }

    return emoji_map.get(compound_lower, '⚫')  # Black circle for unknown


def format_laptime_axis(seconds):
    """
    Convert seconds to MM:SS.mmm format for axis labels.

    Args:
        seconds (float): Time in seconds

    Returns:
        str: Formatted time string (e.g., "1:23.456")
    """
    minutes = int(seconds // 60)
    remaining_seconds = seconds % 60
    return f"{minutes}:{remaining_seconds:06.3f}"


def render_lap_graph(selected_year, selected_gp, selected_session, selected_drivers, color_palette):
    """
    Display lap time graph with Plotly using real FastF1 data.
    Supports clicking on a lap to load telemetry data.

    Args:
        selected_year (int): Selected year
        selected_gp (str): Selected Grand Prix name
        selected_session (str): Selected session type
        selected_drivers (list): List of selected driver codes (e.g., ["VER", "LEC"])
        color_palette (list): List of colors for each driver
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

    # Use real lap times data from backend
    if lap_times_data:
        # Group lap times by driver
        from collections import defaultdict
        driver_laps = defaultdict(lambda: {'lap_numbers': [], 'lap_times': [], 'compounds': []})

        for lap in lap_times_data:
            driver_code = lap['driver']
            driver_laps[driver_code]['lap_numbers'].append(lap['lap_number'])
            driver_laps[driver_code]['lap_times'].append(lap['lap_time'])
            # Get compound from lap data, default to 'unknown'
            compound = lap.get('compound', 'unknown')
            driver_laps[driver_code]['compounds'].append(compound)

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

    # Configure layout
    fig.update_layout(
        xaxis_title="Lap Number",
        yaxis_title="Lap Time",
        template="plotly_dark",
        height=400,
        margin=dict(l=60, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        showlegend=True,
        xaxis=dict(
            gridcolor='rgba(128, 128, 128, 0.2)',
            showgrid=True
        ),
        yaxis=yaxis_config
    )

    # Display the chart
    st.plotly_chart(fig, use_container_width=True)

    # Display tyre compound legend with images
    if lap_times_data:
        st.markdown("### 🏎️ Tyre Compounds Used")

        # Get unique compounds from the data
        compounds_used = set()
        for lap in lap_times_data:
            compound = lap.get('compound', 'unknown')
            if compound != 'unknown':
                compounds_used.add(compound)

        if compounds_used:
            # Display images in columns
            cols = st.columns(len(compounds_used))

            current_dir = os.path.dirname(os.path.abspath(__file__))

            for idx, compound in enumerate(sorted(compounds_used)):
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
                    if image_file:
                        image_path = os.path.join(current_dir, '..', 'shared', 'img', image_file)
                        try:
                            st.image(image_path, caption=compound.capitalize(), width=80)
                        except Exception as e:
                            emoji = get_tyre_emoji(compound)
                            st.markdown(f"{emoji} **{compound.capitalize()}**")

    # Add lap selector for telemetry - one lap per driver
    if lap_times_data and selected_drivers:
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
                    st.warning(f"No laps available")
                    lap_selections[driver] = None

            with col3:
                st.markdown("<br>", unsafe_allow_html=True)

        # Load button at the bottom
        st.markdown("<br>", unsafe_allow_html=True)
        load_button = st.button("🔄 LOAD ALL TELEMETRY",
                                type="primary", use_container_width=True)

        # Load telemetry when button is clicked
        if load_button:
            # Check which laps need to be loaded
            laps_to_load = []
            for driver, lap_num in lap_selections.items():
                if lap_num is not None:
                    current_lap = st.session_state.get(
                        'selected_laps_per_driver', {}).get(driver)
                    if current_lap != lap_num:
                        laps_to_load.append((driver, lap_num))

            # Load telemetry for all selected drivers
            if lap_selections:
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
                        st.success(f"✅ Loaded telemetry for all drivers")
                    st.rerun()
                else:
                    st.error("⚠️ Could not load any telemetry data")
                    st.info(
                        "💡 **Tip:** Some laps may not have telemetry data (pit laps, incomplete laps, or data quality issues). Try selecting different laps.")

        # Display current selections
        if 'selected_laps_per_driver' in st.session_state and st.session_state['selected_laps_per_driver']:
            selections_text = ", ".join([f"**{driver}** (Lap {lap})"
                                        for driver, lap in st.session_state['selected_laps_per_driver'].items()])
            st.info(f"📊 Showing telemetry: {selections_text}")
    else:
        st.info("💡 Select drivers above to view lap telemetry data")


def render_control_buttons():
    """
    Display control buttons below the graph.
    """
    btn_col1, btn_col2, btn_col3 = st.columns(3)

    with btn_col1:
        # TODO: Implement fastest lap selection logic
        # When clicked, highlight the fastest lap on the graph and update visualization
        show_fastest = st.button(
            "CLICK TO SELECT FASTEST LAP", use_container_width=True)
        # if show_fastest:
        #     fastest_lap = lap_data['lap_time'].idxmin()
        #     # Update graph to highlight fastest lap

    with btn_col2:
        # TODO: Implement outliers detection and display logic
        # Use statistical methods (e.g., IQR, Z-score) to identify outliers
        show_outliers = st.button("SHOW OUTLIERS", use_container_width=True)
        # if show_outliers:
        #     outliers = detect_outliers(lap_data)
        #     # Update graph to show/hide outliers

    with btn_col3:
        # TODO: Implement invalid laps filtering logic
        # Invalid laps = laps with PitIn/PitOut, yellow flags, etc.
        show_invalid = st.button("SHOW INVALID LAPS", use_container_width=True)
        # if show_invalid:
        #     invalid_laps = lap_data[lap_data['is_valid'] == False]
        #     # Update graph to show/hide invalid laps


def render_dashboard():
    """
    Main dashboard rendering function.
    Orchestrates all dashboard components in sequence.
    """
    # Early return if navigating away to avoid unnecessary API calls and rendering
    if st.session_state.get('current_page') == 'comparison':
        return  # Don't render dashboard, let main.py handle routing

    render_custom_css()
    render_header()
    selected_year, selected_gp, selected_session, selected_drivers, color_palette = render_data_selectors()

    # Apply colors to driver pills based on selection (must be after selectors)
    apply_driver_pill_colors(selected_drivers)

    render_lap_graph(selected_year, selected_gp,
                     selected_session, selected_drivers, color_palette)
    render_control_buttons()

    # Apply purple border styling to all subsequent Plotly charts
    # (This won't affect the LAP CHART above, only charts rendered after this point)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    # NOTE: Auto-load of fastest laps has been disabled
    # Users must manually select laps to view telemetry graphs

    # Get telemetry data from session state if available
    # Use new multi-driver telemetry format
    telemetry_data_multi = st.session_state.get('telemetry_data_multi', None)

    # Always render telemetry graphs (they show spinner when no data)
    # Circuit Domination Section
    # Note: Circuit domination uses a single reference driver for now
    # We pass the first driver's telemetry if available
    first_driver_telemetry = None
    if telemetry_data_multi and selected_drivers:
        first_driver = selected_drivers[0]
        first_driver_telemetry = telemetry_data_multi.get(first_driver)

    render_circuit_domination_section(
        first_driver_telemetry,
        selected_drivers,
        color_palette,
        selected_year,
        selected_gp,
        selected_session
    )

    # Link button to comparison page
    st.markdown("---")
    render_link_button(
        text="If you want to compare the lap progress between your 2 selected drivers, click here",
        target_page="comparison",
        button_text="⚖️ GO TO COMPARISON"
    )

    # Other Graphs Section (stacked vertically)
    # These graphs will display telemetry data for all selected drivers
    # When telemetry_data_multi is None, graphs show their internal "waiting for data" spinner
    render_speed_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_delta_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_throttle_graph(telemetry_data_multi,
                          selected_drivers, color_palette)
    render_brake_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_rmp_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_gear_graph(telemetry_data_multi, selected_drivers, color_palette)
    render_drs_graph(telemetry_data_multi, selected_drivers, color_palette)
