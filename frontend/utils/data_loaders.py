"""
Data loading utilities with caching for F1 Telemetry Manager.
Provides cached functions to load GPs, sessions, and drivers.
"""

import streamlit as st
from services.telemetry_service import TelemetryService


@st.cache_data(ttl=3600, show_spinner=False)
def load_gps_for_year(year: int):
    """Load GPs for a specific year with caching."""
    if year is None:
        return []

    success, gp_list, error = TelemetryService.get_available_gps(year)
    if success and gp_list:
        return gp_list
    if error:
        st.warning(f"Could not load GPs: {error}. Using default list.")
    # Fallback list
    return ["Bahrain Grand Prix", "Saudi Arabian Grand Prix", "Australian Grand Prix",
            "Japanese Grand Prix", "Chinese Grand Prix"]


@st.cache_data(ttl=3600, show_spinner=False)
def load_sessions_for_gp(year: int, gp: str):
    """Load sessions for a specific GP with caching."""
    if year is None or gp is None:
        return []

    success, session_list, error = TelemetryService.get_available_sessions(year, gp)
    if success and session_list:
        return session_list
    if error:
        st.warning(f"Could not load sessions: {error}. Using default list.")
    # Fallback list
    return ["FP1", "FP2", "FP3", "Q", "R"]


@st.cache_data(ttl=3600, show_spinner=False)
def load_drivers_for_session(year: int, gp: str, session: str):
    """Load drivers for a specific session with caching."""
    if year is None or gp is None or session is None:
        return []

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
