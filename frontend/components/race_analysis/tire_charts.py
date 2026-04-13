"""
Tire Analysis Charts Component

Streamlit section that renders tyre-related charts from race_viz.py.
Charts are laid out one below the other (not grid) so they don't overflow or scroll.
"""

from typing import Optional

import pandas as pd
import streamlit as st
from utils.race_viz import (
    COMPOUND_NAMES,
    st_plot_degradation_rate,
    st_plot_fuel_adjusted_degradation,
    st_plot_fuel_adjusted_percentage_degradation,
    st_plot_regular_vs_adjusted_degradation,
    st_plot_speed_vs_tire_age,
)


def render_tire_charts(
    race_data: pd.DataFrame,
    driver_number: Optional[int] = None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> None:
    """Render the tyre degradation analysis section.

    Charts are displayed one below another (no grid) for readability.
    When driver_colors is provided (multi-driver mode), chart lines are colored
    by driver team color; compound is distinguished via dash style.
    driver_code_map maps DriverNumber (int) → driver code (str) for legend labels.
    """
    if race_data.empty:
        st.caption("Load race data to see tyre analysis.")
        return

    # --- Compound selector ---
    available = sorted(race_data["CompoundID"].unique())
    compound_labels = [COMPOUND_NAMES.get(c, f"Compound {c}") for c in available]
    selected_label = st.selectbox(
        "Compound",
        compound_labels,
        key="tire_compound_select",
    )
    selected_id = available[compound_labels.index(selected_label)]

    # --- Speed vs tyre age ---
    fig = st_plot_speed_vs_tire_age(race_data, driver_number, compound_id=selected_id)
    if fig:
        st.plotly_chart(fig, width="stretch")
    else:
        st.caption("No speed data for this compound.")

    st.space("small")

    # --- Fuel-adjusted degradation ---
    fig = st_plot_fuel_adjusted_degradation(
        race_data, driver_number,
        driver_colors=driver_colors, driver_code_map=driver_code_map,
    )
    if fig:
        st.plotly_chart(fig, width="stretch")
    else:
        st.caption("No fuel-adjusted degradation data available.")

    st.space("small")

    # --- Regular vs adjusted comparison ---
    fig = st_plot_regular_vs_adjusted_degradation(race_data)
    if fig:
        st.plotly_chart(fig, width="stretch")
    else:
        st.caption("No regular vs adjusted data available.")

    st.space("small")

    # --- Degradation rate ---
    fig = st_plot_degradation_rate(
        race_data, driver_number,
        driver_colors=driver_colors, driver_code_map=driver_code_map,
    )
    if fig:
        st.plotly_chart(fig, width="stretch")
    else:
        st.caption("No degradation rate data available.")

    st.space("small")

    # --- Percentage degradation ---
    fig = st_plot_fuel_adjusted_percentage_degradation(
        race_data, driver_number,
        driver_colors=driver_colors, driver_code_map=driver_code_map,
    )
    if fig:
        st.plotly_chart(fig, width="stretch")
