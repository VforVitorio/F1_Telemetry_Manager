"""
Gap Analysis Charts Component

Streamlit section that renders gap-related charts from race_viz.py
and the strategic-window processing from race_processing.py.
"""

from typing import Optional

import pandas as pd
import streamlit as st
from app.styles import StatusColor, TextColor
from utils.race_processing import calculate_gap_consistency, calculate_strategic_windows
from utils.race_viz import (
    st_plot_gap_consistency,
    st_plot_gap_evolution,
    st_plot_undercut_opportunities,
)


def render_gap_charts(
    gap_data: pd.DataFrame,
    driver_number: Optional[int] = None,
) -> None:
    """Render the gap analysis section.

    Shows gap evolution, undercut/overcut zones, consistency bars,
    and a summary of strategic windows.
    """
    if gap_data.empty:
        st.warning("No gap data available.")
        return

    # Ensure consistency columns exist
    if "consistent_gap_ahead_laps" not in gap_data.columns:
        gap_data = calculate_gap_consistency(gap_data)

    # --- Row 1: gap evolution + undercut opportunities ---
    col1, col2 = st.columns(2)

    with col1:
        fig = st_plot_gap_evolution(gap_data, driver_number)
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Gap evolution data not available.")

    with col2:
        fig = st_plot_undercut_opportunities(gap_data, driver_number)
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Undercut opportunities data not available.")

    # --- Row 2: gap consistency ---
    fig = st_plot_gap_consistency(gap_data, driver_number)
    if fig:
        st.plotly_chart(fig, use_container_width=True)

    # --- Strategic windows summary ---
    windows = calculate_strategic_windows(gap_data)
    _render_windows_summary(windows, driver_number)


def _render_windows_summary(
    windows: pd.DataFrame,
    driver_number: Optional[int] = None,
) -> None:
    """Show counts of undercut / overcut / defensive opportunities."""
    if driver_number is not None and "DriverNumber" in windows.columns:
        windows = windows[windows["DriverNumber"] == driver_number]

    if windows.empty:
        return

    undercut_count = int(windows["undercut_opportunity"].sum())
    overcut_count = int(windows["overcut_opportunity"].sum())
    defensive_count = int(windows["defensive_needed"].sum())

    st.subheader("Strategic windows summary")
    c1, c2, c3 = st.columns(3)

    with c1:
        st.markdown(
            _count_badge("Undercut Opps", undercut_count, StatusColor.SUCCESS),
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            _count_badge("Overcut Opps", overcut_count, StatusColor.WARNING),
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            _count_badge("Defensive Needed", defensive_count, StatusColor.ERROR),
            unsafe_allow_html=True,
        )


def _count_badge(label: str, count: int, color: str) -> str:
    return f"""
    <div style="text-align:center; padding:0.5rem;">
        <div style="color:{TextColor.SECONDARY}; font-size:0.85rem;">{label}</div>
        <div style="color:{color}; font-size:1.5rem; font-weight:700;">{count}</div>
    </div>
    """
