"""
Comparison Page

Main page for comparing telemetry between two drivers.
Orchestrates all comparison components.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

# Standard library imports
import streamlit as st
import httpx

# Project imports
from components.common.data_selectors import render_comparison_data_selectors
from components.comparison.circuit_comparison import render_circuit_comparison
from components.comparison.delta_time_graph import render_delta_time_graph
from components.comparison.speed_comparison_graph import render_speed_comparison_graph
from components.comparison.brake_comparison_graph import render_brake_comparison_graph
from components.comparison.throttle_comparison_graph import render_throttle_comparison_graph
from components.common.chart_styles import apply_telemetry_chart_styles
from components.layout.navbar import show_error_toast
# Reuse dashboard functions
from pages.dashboard import apply_driver_pill_colors, render_custom_css


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def render_header():
    """Display page header."""
    st.markdown(
        "<h1 style='text-align: center;'>DRIVER COMPARISON</h1>",
        unsafe_allow_html=True
    )
    st.markdown("---")


def _apply_driver_selectbox_colors(driver1, driver2):
    """
    Apply team colors to driver selectboxes based on selected drivers.
    DISABLED - Not working correctly yet.

    Args:
        driver1 (str): First driver code (or None)
        driver2 (str): Second driver code (or None)
    """
    # TODO: Fix selectbox coloring - needs different approach
    pass


def fetch_comparison_data(year, gp, session, driver1, driver2):
    """
    Fetch comparison data from backend API (fastest laps only).

    Args:
        year: Season year
        gp: Grand Prix name
        session: Session type
        driver1: First driver abbreviation
        driver2: Second driver abbreviation

    Returns:
        Dictionary with comparison data or None if error
    """
    try:
        params = {
            "year": year,
            "gp": gp,
            "session": session,
            "driver1": driver1,
            "driver2": driver2
        }

        response = httpx.get(
            f"{BACKEND_URL}/api/v1/comparison/compare",
            params=params,
            timeout=120.0  # 2 minutes timeout for FastF1 data loading
        )
        response.raise_for_status()
        return response.json()

    except httpx.HTTPStatusError as e:
        # Handle specific HTTP errors
        if e.response.status_code == 404:
            # Extract error detail from response if available
            try:
                error_detail = e.response.json().get('detail', str(e))
            except:
                error_detail = str(e)

            # Check if it's a driver not found error
            if "not found" in error_detail.lower() or "no laps found" in error_detail.lower():
                # Show error toast for driver not available
                show_error_toast(
                    f"{error_detail}. Please select another driver or session.")
            else:
                show_error_toast(f"Data not found: {error_detail}")
        else:
            st.error(f"Error fetching comparison data: {str(e)}")
        return None
    except httpx.HTTPError as e:
        st.error(f"Connection error: {str(e)}")
        return None
    except Exception as e:
        st.error(f"Unexpected error: {str(e)}")
        return None


def render_compare_button():
    """Display centered compare button."""
    col1, col2, col3 = st.columns([2, 1, 2])
    with col2:
        return st.button("🔄 COMPARE", use_container_width=True, type="primary")


def render_comparison_page():
    """
    Main comparison page rendering function.
    Orchestrates all comparison components in sequence.
    Compares fastest laps between two drivers.
    """
    render_header()

    year, gp, session, driver1, driver2 = render_comparison_data_selectors()

    # Apply pill styles: first remove backgrounds, then apply colors
    selected_drivers = [d for d in [driver1, driver2] if d is not None]
    if selected_drivers:
        render_custom_css()  # Remove backgrounds
        apply_driver_pill_colors(selected_drivers)  # Apply text colors

    # Add spacing before compare button
    st.markdown("<br>", unsafe_allow_html=True)

    compare_button = render_compare_button()

    if compare_button:
        # Check if all selections are made
        if not all([year, gp, session, driver1, driver2]):
            show_error_toast(
                "Please select all options (Season, GP, Session, and both Drivers)")
        else:
            with st.spinner("Loading comparison data... (may take up to a minute)"):
                comparison_data = fetch_comparison_data(
                    year, gp, session, driver1, driver2
                )

            if comparison_data:
                st.session_state['comparison_data'] = comparison_data

    # Apply purple border styling to all subsequent Plotly charts
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    # TODO: Fetch telemetry data from backend
    # comparison_data = fetch_comparison_data(year, gp, session, driver1, driver2, lap1, lap2)
    comparison_data = st.session_state.get('comparison_data', None)

    if comparison_data:
        # Circuit comparison with animation
        render_circuit_comparison(comparison_data)
        st.markdown("---")

        # Delta time graph
        render_delta_time_graph(comparison_data)
        st.markdown("---")

        # Speed comparison
        render_speed_comparison_graph(comparison_data)
        st.markdown("---")

        # Brake comparison
        render_brake_comparison_graph(comparison_data)
        st.markdown("---")

        # Throttle comparison
        render_throttle_comparison_graph(comparison_data)
    else:
        st.info(
            "👆 Select two drivers, then click COMPARE to view telemetry comparison (fastest laps only)")
