"""
Strategy Page

Horizontal selectors at the top (Year, GP, Driver, Lap, Risk) fetch a
canonical lap_state from the backend parquet, then run the Strategy
Orchestrator.  Results: recommendation card + scenario chart + agent
detail tabs.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

import json  # noqa: E402

import streamlit as st  # noqa: E402
from components.common.chart_styles import apply_telemetry_chart_styles  # noqa: E402
from components.strategy.agent_tabs import render_agent_tabs  # noqa: E402
from components.strategy.scenario_chart import render_scenario_chart  # noqa: E402
from components.strategy.strategy_card import render_strategy_card  # noqa: E402
from services.strategy_service import StrategyService  # noqa: E402


def render_header() -> None:
    st.markdown(
        "<h1 style='text-align: center;'>Strategy Advisor</h1>",
        unsafe_allow_html=True,
    )


def _render_strategy_selectors() -> tuple:
    """GP + Driver on row 1, Lap range + analysis lap + Risk on row 2, Run centered on row 3.

    Season is hardcoded to 2025 — only 2025 data is available.
    """
    year = 2025
    st.warning(":material/info: Only 2025 season data is currently available.", icon=None)

    # --- Row 1: GP / Driver ---
    c1, c2 = st.columns(2)

    with c1:
        ok_gp, gp_list, err_gp = StrategyService.get_available_gps(year)
        gp_options = ([None] + gp_list) if ok_gp and gp_list else [None]
        gp = st.selectbox(
            "Grand Prix",
            gp_options,
            format_func=lambda x: "-- Select GP --" if x is None else x,
            key="strat_gp",
        )

    with c2:
        if gp is not None:
            ok_drv, drv_list, err_drv = StrategyService.get_available_drivers(gp, year)
            drv_options = ([None] + drv_list) if ok_drv and drv_list else [None]
        else:
            drv_options = [None]
        driver = st.selectbox(
            "Driver",
            drv_options,
            format_func=lambda x: "-- Select driver --" if x is None else x,
            disabled=gp is None,
            key="strat_driver",
        )

    # Return early if any selector is unset
    if gp is None or driver is None:
        st.caption("Select GP and driver above to configure the analysis.")
        return None, None, None, None, None, None

    # --- Row 2: Lap range + analysis lap + Risk ---
    ok_lr, lap_info, err_lr = StrategyService.get_lap_range(gp, driver, year)
    if not ok_lr or not lap_info:
        st.warning(f"Could not load lap range: {err_lr}")
        return None, None, None, None, None, None

    min_lap = lap_info.get("min_lap", 2)
    max_lap = lap_info.get("max_lap", 57)

    r1, r2 = st.columns(2)
    with r1:
        lap_range = st.slider(
            "Lap range",
            min_value=min_lap, max_value=max_lap,
            value=(min_lap, min(min_lap + 20, max_lap)),
            key="strat_lap_range",
        )
        st.caption(f"Orchestrator analyses lap {lap_range[1]} (end of range).")
    with r2:
        risk = st.slider(
            "Risk tolerance", 0.0, 1.0, 0.5, step=0.05, key="strat_risk",
        )
        st.caption("0 = conservative · 1 = aggressive")

    lap = lap_range[1]  # always analyse at the end of the selected range

    _, btn_col, _ = st.columns([1, 2, 1])
    with btn_col:
        run = st.button(
            ":material/play_arrow: Run strategy",
            type="primary",
            use_container_width=True,
        )

    return year, gp, driver, lap, risk, run


def _render_lap_snapshot(lap_state: dict, data: dict) -> None:
    """Show a CLI-style lap snapshot — current tire, gap, pace, SC prob — before the recommendation."""
    drv = lap_state.get("driver", {})
    compound = drv.get("compound", "—")
    tyre_life = drv.get("tyre_life", drv.get("TyreLife", "—"))
    gap_ahead = drv.get("gap_ahead_s", drv.get("GapToCarAhead", "—"))
    lap_time = drv.get("lap_time_s", drv.get("LapTime", "—"))
    sc_prob = (
        data.get("sc_probability")
        or data.get("context", {}).get("sc_prob")
        or data.get("agents", {}).get("sc", {}).get("sc_probability")
    )

    st.subheader(":material/query_stats: Lap snapshot")
    c1, c2, c3, c4, c5 = st.columns(5)
    with c1:
        st.metric("Compound", str(compound).upper() if compound != "—" else "—")
    with c2:
        tl_label = f"{tyre_life} laps" if isinstance(tyre_life, (int, float)) else "—"
        st.metric("Tyre age", tl_label)
    with c3:
        ga_label = f"{gap_ahead:.2f}s" if isinstance(gap_ahead, (int, float)) else "—"
        st.metric("Gap ahead", ga_label)
    with c4:
        lt_label = f"{lap_time:.3f}s" if isinstance(lap_time, (int, float)) else "—"
        st.metric("Lap time", lt_label)
    with c5:
        sc_label = f"{sc_prob * 100:.0f}%" if isinstance(sc_prob, (int, float)) else "—"
        st.metric("SC prob", sc_label)


def render_strategy_page() -> None:
    """Main entry point called by the router in main.py."""
    render_header()

    # Apply purple-border chart CSS (same as Dashboard)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    result = _render_strategy_selectors()

    if result[1] is None:  # gp is None — selectors not fully configured
        return

    year, gp, driver, lap, risk, run = result

    if not run and "strategy_result" not in st.session_state:
        st.caption("Select a scenario above and press **Run strategy**.")
        return

    if run:
        with st.status("Running strategy analysis...", expanded=True) as status:
            st.write(":material/query_stats: Building lap state from race data...")
            ok_ls, lap_state, err_ls = StrategyService.get_lap_state(gp, driver, lap, year)

            if not ok_ls:
                status.update(label="Lap state failed", state="error")
                st.error(f"Failed to build lap state: {err_ls}")
                return

            st.write(":material/psychology: Running agents (Pace · Tire · Pit · SC · Radio)...")
            ok, data, err = StrategyService.get_recommendation(
                lap_state=lap_state,
                gap_ahead_s=lap_state.get("driver", {}).get("gap_ahead_s", 2.0),
                pace_delta_s=0.0,
                risk_tolerance=risk,
            )

            if ok:
                status.update(label="Analysis complete!", state="complete", expanded=False)
            else:
                status.update(label="Analysis failed", state="error")

        if not ok:
            st.error(f"Orchestrator error: {err}")
            return

        st.session_state["strategy_result"] = data
        st.session_state["strategy_lap_state"] = lap_state

    data = st.session_state["strategy_result"]
    lap_state = st.session_state.get("strategy_lap_state", {})

    # 1. Lap snapshot (CLI emulation)
    _render_lap_snapshot(lap_state, data)

    st.divider()

    # 2. Recommendation card
    render_strategy_card(data)

    # Download strategy result
    st.download_button(
        ":material/download: Download strategy result (JSON)",
        data=json.dumps(data, indent=2, default=str),
        file_name=f"strategy_{gp}_{driver}_lap{lap}.json",
        mime="application/json",
        key="strat_dl",
    )

    # 3. Scenario scores chart
    scores = data.get("scenario_scores", {})
    if scores:
        fig = render_scenario_chart(scores)
        if fig:
            n = len(scores)
            chart_h = max(420, 90 * n)
            fig.update_layout(height=chart_h)
            st.plotly_chart(fig, width="stretch")

    # 4. Agent detail tabs
    st.subheader("Agent details")
    render_agent_tabs(lap_state)
