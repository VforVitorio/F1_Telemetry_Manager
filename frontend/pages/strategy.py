"""
Strategy Page

Four selectors (GP, Driver, Lap, Risk) on the left fetch a canonical
lap_state from the backend parquet, then run the Strategy Orchestrator.
Results: recommendation card + scenario chart + agent detail tabs.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

import streamlit as st  # noqa: E402
from components.strategy.agent_tabs import render_agent_tabs  # noqa: E402
from components.strategy.scenario_chart import render_scenario_chart  # noqa: E402
from components.strategy.strategy_card import render_strategy_card  # noqa: E402
from services.strategy_service import StrategyService  # noqa: E402


def render_header() -> None:
    st.markdown(
        "<h1 style='text-align: center;'>Strategy advisor</h1>",
        unsafe_allow_html=True,
    )


def _render_strategy_selectors() -> tuple:
    """Left-column selectors: GP → Driver → Lap → Risk."""
    st.subheader("Select scenario")

    # --- Year ---
    year = st.selectbox("Season", [2025, 2024, 2023], index=0, key="strat_year")

    # --- GP (from parquet) ---
    ok_gp, gp_list, err_gp = StrategyService.get_available_gps(year)
    if ok_gp and gp_list:
        gp = st.selectbox("Grand Prix", gp_list, key="strat_gp")
    else:
        st.warning(f"Could not load GPs: {err_gp}")
        return None, None, None, None, None

    # --- Driver (from parquet, filtered by GP) ---
    ok_drv, drv_list, err_drv = StrategyService.get_available_drivers(gp, year)
    if ok_drv and drv_list:
        driver = st.selectbox("Driver", drv_list, key="strat_driver")
    else:
        st.warning(f"Could not load drivers: {err_drv}")
        return None, None, None, None, None

    # --- Lap (slider within range for that driver/GP) ---
    ok_lr, lap_range, err_lr = StrategyService.get_lap_range(gp, driver, year)
    if ok_lr and lap_range:
        min_lap = lap_range.get("min_lap", 2)
        max_lap = lap_range.get("max_lap", 57)
        lap = st.slider("Lap", min_value=min_lap, max_value=max_lap, value=min(min_lap + 10, max_lap), key="strat_lap")
    else:
        st.warning(f"Could not load lap range: {err_lr}")
        return None, None, None, None, None

    # --- Risk tolerance ---
    risk = st.slider("Risk tolerance", 0.0, 1.0, 0.5, step=0.05, key="strat_risk")

    return year, gp, driver, lap, risk


def render_strategy_page() -> None:
    """Main entry point called by the router in main.py."""
    render_header()

    col_form, col_results = st.columns([1, 2])

    # --- Left column: selectors ---
    with col_form:
        year, gp, driver, lap, risk = _render_strategy_selectors()

        selectors_ready = all(v is not None for v in (year, gp, driver, lap, risk))
        run = st.button(
            ":material/play_arrow: Run strategy",
            type="primary",
            use_container_width=True,
            disabled=not selectors_ready,
        )

    # --- Right column: results ---
    with col_results:
        if not run and "strategy_result" not in st.session_state:
            st.caption("Select a scenario on the left and press **Run strategy**.")
            return

        if run and selectors_ready:
            with st.spinner("Running strategy analysis..."):
                ok_ls, lap_state, err_ls = StrategyService.get_lap_state(gp, driver, lap, year)

                if not ok_ls:
                    st.error(f"Failed to build lap state: {err_ls}")
                    return

                ok, data, err = StrategyService.get_recommendation(
                    lap_state=lap_state,
                    gap_ahead_s=lap_state.get("driver", {}).get("gap_ahead_s", 2.0),
                    pace_delta_s=0.0,
                    risk_tolerance=risk,
                )

            if not ok:
                st.error(f"Orchestrator error: {err}")
                return

            st.session_state["strategy_result"] = data
            st.session_state["strategy_lap_state"] = lap_state

        data = st.session_state["strategy_result"]
        lap_state = st.session_state.get("strategy_lap_state", {})

        # 1. Recommendation card
        render_strategy_card(data)

        # 2. Scenario scores chart
        scores = data.get("scenario_scores", {})
        if scores:
            fig = render_scenario_chart(scores)
            if fig:
                st.plotly_chart(fig, use_container_width=True)

        # 3. Agent detail tabs
        st.subheader("Agent details")
        render_agent_tabs(lap_state)
