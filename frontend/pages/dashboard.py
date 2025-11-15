"""
Dashboard page - Lap Chart visualization.
Displays data selectors, lap time graphs, and control buttons.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
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
import services.telemetry_service
importlib.reload(services.telemetry_service)
from services.telemetry_service import TelemetryService


def render_custom_css():
    """
    Apply custom CSS for multiselect driver pills and colored driver names.
    """
    # Generate CSS rules for each driver to color their names in dropdowns
    driver_css_rules = []
    for driver_code, color in DRIVER_COLORS.items():
        driver_css_rules.append(f"""
        /* Color for {driver_code} */
        div[data-baseweb="select"] li[role="option"]:has(div:first-child:contains("{driver_code}")) {{
            color: {color} !important;
            font-weight: 600;
        }}
        """)

    css_content = f"""
        <style>
        /* Driver name colors in dropdowns */
        {' '.join(driver_css_rules)}

        /* Multiselect pills with dynamic colors */
        div[data-baseweb="tag"] {{
            font-weight: 600;
        }}

        /* Style for driver options - make them bold */
        div[data-baseweb="select"] li {{
            font-weight: 600;
        }}
        </style>
    """

    st.markdown(css_content, unsafe_allow_html=True)


def render_header():
    """
    Display page header.
    """
    st.markdown("<h1 style='text-align: center;'>F1 TELEMETRY MANAGER</h1>",
                unsafe_allow_html=True)
    st.markdown("---")


@st.cache_data(ttl=3600)
def load_gps_for_year(year: int):
    """Load GPs for a specific year with caching."""
    success, gp_list, error = TelemetryService.get_available_gps(year)
    if success and gp_list:
        return gp_list
    if error:
        st.warning(f"Could not load GPs: {error}. Using default list.")
    # Fallback list
    return ["Bahrain Grand Prix", "Saudi Arabian Grand Prix", "Australian Grand Prix",
            "Japanese Grand Prix", "Chinese Grand Prix"]


@st.cache_data(ttl=3600)
def load_sessions_for_gp(year: int, gp: str):
    """Load sessions for a specific GP with caching."""
    success, session_list, error = TelemetryService.get_available_sessions(year, gp)
    if success and session_list:
        return session_list
    if error:
        st.warning(f"Could not load sessions: {error}. Using default list.")
    # Fallback list
    return ["FP1", "FP2", "FP3", "Q", "R"]


@st.cache_data(ttl=3600)
def load_drivers_for_session(year: int, gp: str, session: str):
    """Load drivers for a specific session with caching."""
    with st.spinner("Loading drivers from FastF1..."):
        success, driver_list, error = TelemetryService.get_available_drivers(year, gp, session)

    if success and driver_list:
        # Format as "CODE - Name"
        return [f"{d['code']} - {d['name']}" for d in driver_list]

    if error:
        st.error(f"Could not load drivers: {error}")

    # Fallback: F1 2024 Complete driver lineup
    return [
        "VER - Verstappen", "PER - Pérez",  # Red Bull
        "LEC - Leclerc", "SAI - Sainz",  # Ferrari
        "HAM - Hamilton", "RUS - Russell",  # Mercedes
        "NOR - Norris", "PIA - Piastri",  # McLaren
        "ALO - Alonso", "STR - Stroll",  # Aston Martin
        "GAS - Gasly", "OCO - Ocon",  # Alpine
        "ALB - Albon", "COL - Colapinto", "SAR - Sargeant",  # Williams
        "TSU - Tsunoda", "RIC - Ricciardo", "LAW - Lawson",  # RB
        "BOT - Bottas", "ZHO - Zhou",  # Sauber
        "MAG - Magnussen", "HUL - Hülkenberg", "BEA - Bearman",  # Haas
        "DOO - Doohan",  # Reserve/Test
    ]


def render_data_selectors():
    """
    Render the 4 data selectors (Year, GP, Session, Pilots).

    Returns:
        tuple: (selected_year, selected_gp, selected_session, selected_drivers, color_palette)
    """
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # Year selector - fixed to 2024 only
        selected_year = st.selectbox(
            "YEAR",
            options=[2024],
            index=0
        )

    with col2:
        # GP selector - load from backend
        gp_options = load_gps_for_year(selected_year)
        selected_gp = st.selectbox(
            "GP",
            options=gp_options,
            index=0
        )

    with col3:
        # Session selector - load from backend based on year and GP
        session_options = load_sessions_for_gp(selected_year, selected_gp)

        # Try to default to "R" (Race) if available
        default_index = session_options.index("R") if "R" in session_options else 0

        selected_session = st.selectbox(
            "SESSION",
            options=session_options,
            index=default_index
        )

    with col4:
        # Driver selector - load from backend based on year, GP, and session
        driver_options = load_drivers_for_session(selected_year, selected_gp, selected_session)

        # Try to default to VER if available
        default_driver = ["VER - Verstappen"] if "VER - Verstappen" in driver_options else [driver_options[0]] if driver_options else []

        selected_drivers = st.multiselect(
            "DRIVERS",
            options=driver_options,
            default=default_driver,
            max_selections=3
        )

        # Extract driver codes and get their official team colors
        driver_codes = [driver.split(' - ')[0] for driver in selected_drivers]
        color_palette = [get_driver_color(code) for code in driver_codes]

    return selected_year, selected_gp, selected_session, selected_drivers, color_palette


def render_lap_graph(selected_year, selected_gp, selected_session, selected_drivers, color_palette):
    """
    Display lap time graph with Plotly using real FastF1 data.

    Args:
        selected_year (int): Selected year
        selected_gp (str): Selected Grand Prix name
        selected_session (str): Selected session type
        selected_drivers (list): List of selected driver identifiers (format: "CODE - Name")
        color_palette (list): List of colors for each driver
    """
    st.markdown("<h2 style='text-align: center;'>LAP CHART</h2>",
                unsafe_allow_html=True)

    # Extract driver codes from the "CODE - Name" format
    driver_codes = [driver.split(' - ')[0] for driver in selected_drivers]

    # Fetch lap times from backend
    if driver_codes:
        with st.spinner("Loading lap times from FastF1..."):
            success, lap_times_data, error = TelemetryService.get_lap_times(
                selected_year,
                selected_gp,
                selected_session,
                driver_codes
            )

        if not success or not lap_times_data:
            st.warning(f"Could not load lap times: {error if error else 'No data available'}")
            lap_times_data = []
    else:
        lap_times_data = []

    # Create Plotly figure
    fig = go.Figure()

    # Plot lap times for each driver
    if lap_times_data:
        # Group lap times by driver
        import pandas as pd
        df = pd.DataFrame(lap_times_data)

        for idx, driver_code in enumerate(driver_codes):
            driver_data = df[df['driver'] == driver_code]

            if not driver_data.empty:
                fig.add_trace(go.Scatter(
                    x=driver_data['lap_number'],
                    y=driver_data['lap_time'],
                    mode='lines+markers',
                    name=driver_code,
                    line=dict(color=color_palette[idx % len(color_palette)], width=2),
                    marker=dict(size=6)
                ))
    else:
        # Show message if no data
        st.info("Select drivers to view their lap times")

    # Configure layout
    fig.update_layout(
        xaxis_title="Lap Number",
        yaxis_title="Lap Time (seconds)",
        template="plotly_dark",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG,
        font=dict(color=TextColor.PRIMARY),
        showlegend=True,
        xaxis=dict(
            gridcolor='rgba(128, 128, 128, 0.2)',
            showgrid=True
        ),
        yaxis=dict(
            gridcolor='rgba(128, 128, 128, 0.2)',
            showgrid=True
        )
    )

    st.plotly_chart(fig, use_container_width=True)


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
    render_custom_css()
    render_header()
    selected_year, selected_gp, selected_session, selected_drivers, color_palette = render_data_selectors()
    render_lap_graph(selected_year, selected_gp, selected_session, selected_drivers, color_palette)
    render_control_buttons()

    # Apply purple border styling to all subsequent Plotly charts
    # (This won't affect the LAP CHART above, only charts rendered after this point)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    # TODO: Fetch telemetry data from backend
    # telemetry_data = fetch_telemetry_data(selected_year, selected_gp, selected_session, selected_drivers)
    telemetry_data = None  # Placeholder until backend is ready

    # Circuit Domination Section
    render_circuit_domination_section(
        telemetry_data,
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
    render_speed_graph(telemetry_data, selected_drivers, color_palette)
    render_delta_graph(telemetry_data, selected_drivers, color_palette)
    render_throttle_graph(telemetry_data, selected_drivers, color_palette)
    render_brake_graph(telemetry_data, selected_drivers, color_palette)
    render_rmp_graph(telemetry_data, selected_drivers, color_palette)
    render_gear_graph(telemetry_data, selected_drivers, color_palette)
    render_drs_graph(telemetry_data, selected_drivers, color_palette)