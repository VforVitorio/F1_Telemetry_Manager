"""
Model Lab Page

Call individual ML models (Pace, Tyres, Overtake, Safety Car, Pit, Radio)
without running the full Strategy Orchestrator.  Shared GP/Driver/Lap
selectors at the top; each tab fires its own agent endpoint.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

import pandas as pd  # noqa: E402
import plotly.graph_objects as go  # noqa: E402
import streamlit as st  # noqa: E402
from components.common.chart_styles import apply_telemetry_chart_styles  # noqa: E402
from components.strategy.agent_tabs import _metric_html, _warning_badge  # noqa: E402
from components.layout.titles import render_centered_title
from services.strategy_service import StrategyService  # noqa: E402
from utils.race_viz import _base_layout, _styled_axes  # noqa: E402

COMPOUND_COLORS = {
    "SOFT": "#E8002D", "MEDIUM": "#FFF200", "HARD": "#EEEEEE",
    "INTERMEDIATE": "#39B54A", "WET": "#0067FF",
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

def _render_header() -> None:
    render_centered_title("Model Lab")
    st.caption("Run individual ML agents on any race lap without the full orchestrator.")


# ---------------------------------------------------------------------------
# Shared selectors
# ---------------------------------------------------------------------------

def _render_selectors() -> tuple:
    """GP + Driver + Lap range. Returns (year, gp, driver, lap_start, lap_end, single_lap).

    Season is hardcoded to 2025 — only 2025 data is available.
    Uses the same None+placeholder+cascading-disabled pattern as the Dashboard.
    """
    year = 2025
    st.warning(":material/info: Only 2025 season data is currently available.", icon=None)

    c1, c2 = st.columns(2)

    with c1:
        ok, gp_list, err = StrategyService.get_available_gps(year)
        gp_options = ([None] + gp_list) if ok and gp_list else [None]
        gp = st.selectbox(
            "Grand Prix",
            gp_options,
            format_func=lambda x: "-- Select GP --" if x is None else x,
            key="ml_gp",
        )

    with c2:
        if gp is not None:
            ok, drv_list, err = StrategyService.get_available_drivers(gp, year)
            drv_options = ([None] + drv_list) if ok and drv_list else [None]
        else:
            drv_options = [None]
        driver = st.selectbox(
            "Driver",
            drv_options,
            format_func=lambda x: "-- Select driver --" if x is None else x,
            disabled=gp is None,
            key="ml_driver",
        )

    if gp is None or driver is None:
        st.caption("Select GP and driver above to configure the analysis.")
        return (None,) * 6

    ok, lr, err = StrategyService.get_lap_range(gp, driver, year)
    if not ok or not lr:
        st.warning(f"Could not load lap range: {err}")
        return (None,) * 6

    min_lap = lr.get("min_lap", 2)
    max_lap = lr.get("max_lap", 57)

    rc1, rc2 = st.columns(2)
    with rc1:
        lap_range = st.slider(
            "Lap range (for Pace chart)",
            min_value=min_lap, max_value=max_lap,
            value=(min_lap, max_lap), key="ml_lap_range",
        )
    with rc2:
        single_lap = st.slider(
            "Single lap (for other agents)",
            min_value=min_lap, max_value=max_lap,
            value=min(min_lap + 10, max_lap), key="ml_lap",
        )

    return year, gp, driver, lap_range[0], lap_range[1], single_lap


def _fetch_lap_state(year: int, gp: str, driver: str, lap: int) -> dict | None:
    """Build a canonical lap_state from the backend parquet.

    Returns None and shows a user-friendly error if the lap doesn't exist
    (e.g. driver DNF'd before this lap, or missing telemetry).
    """
    cache_key = f"ml_lap_state_{year}_{gp}_{driver}_{lap}"
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    with st.spinner("Building lap state..."):
        ok, data, err = StrategyService.get_lap_state(gp, driver, lap, year)

    if not ok:
        err_str = str(err or "")
        if "404" in err_str or "No data" in err_str:
            st.warning(
                f":material/flag: No telemetry for **{driver}** at lap **{lap}** "
                f"({gp}). The driver may have retired (DNF) or telemetry is unavailable "
                f"for this lap. Try a lower lap number.",
                icon=None,
            )
        else:
            st.error(f"Failed to build lap state: {err}")
        return None

    st.session_state[cache_key] = data
    return data


# ---------------------------------------------------------------------------
# Pace tab — batch predictions with actual vs predicted chart
# ---------------------------------------------------------------------------

def _build_pace_chart(preds: list, driver: str) -> go.Figure:
    """Notebook-style actual vs predicted chart with CI band + compound colours."""
    df = pd.DataFrame(preds)
    df = df.dropna(subset=["pred"])
    if df.empty:
        return None

    fig = go.Figure()

    # CI band
    fig.add_trace(go.Scatter(
        x=pd.concat([df["lap"], df["lap"][::-1]]),
        y=pd.concat([df["ci_p10"], df["ci_p90"][::-1]]),
        fill="toself", fillcolor="rgba(70,130,180,0.15)",
        line=dict(width=0), name="CI P10–P90", hoverinfo="skip",
    ))

    # Actual (dashed)
    df_act = df.dropna(subset=["actual"])
    fig.add_trace(go.Scatter(
        x=df_act["lap"], y=df_act["actual"],
        mode="lines", name="Actual",
        line=dict(color="#888888", width=2, dash="dash"),
    ))

    # Predicted (solid line)
    fig.add_trace(go.Scatter(
        x=df["lap"], y=df["pred"],
        mode="lines", name="Predicted",
        line=dict(color="steelblue", width=2),
    ))

    # Compound-coloured dots on predicted
    for compound, grp in df.groupby("compound"):
        color = COMPOUND_COLORS.get(compound, "white")
        fig.add_trace(go.Scatter(
            x=grp["lap"], y=grp["pred"],
            mode="markers", name=f"Pred ({compound})",
            marker=dict(color=color, size=7, line=dict(color="black", width=0.5)),
        ))

    # Stint boundaries (vertical lines)
    stints = df["stint"].values
    for i in range(1, len(stints)):
        if stints[i] != stints[i - 1]:
            fig.add_vline(
                x=df["lap"].iloc[i] - 0.5,
                line=dict(color="white", width=1, dash="dot"), opacity=0.4,
            )

    # MAE annotation
    valid = df.dropna(subset=["actual", "pred"])
    if not valid.empty:
        mae = (valid["actual"] - valid["pred"]).abs().mean()
        fig.add_annotation(
            x=0.01, y=0.98, xref="paper", yref="paper",
            text=f"MAE: {mae:.3f}s", showarrow=False,
            font=dict(size=12, color="white"),
            bgcolor="rgba(0,0,0,0.6)", borderpad=4,
        )

    fig.update_layout(**_base_layout(
        title=f"{driver} — Actual vs Predicted Lap Times",
        xaxis_title="Lap Number", yaxis_title="Lap Time (s)",
        height=450,
    ))
    _styled_axes(fig)
    return fig


def _render_pace_tab(year: int, gp: str, driver: str, lap_start: int, lap_end: int) -> None:
    """N25 - Pace Agent across a lap range."""
    if st.button(":material/play_arrow: Run pace agent", key="ml_run_pace", type="primary"):
        with st.spinner(f"Running Pace Agent on laps {lap_start}–{lap_end}..."):
            ok, data, err = StrategyService.get_pace_range(year, gp, driver, lap_start, lap_end)

        if not ok:
            err_str = str(err or "")
            if "404" in err_str or "No data" in err_str:
                st.warning(
                    f":material/flag: No telemetry for **{driver}** in this lap range "
                    f"({gp}). The driver may have retired (DNF) or telemetry is missing. "
                    "Try reducing the lap range end.",
                    icon=None,
                )
            else:
                st.error(f"Pace Agent error: {err}")
            return

        st.session_state["ml_pace_range"] = data

    data = st.session_state.get("ml_pace_range")
    if data is None:
        st.caption("Click **Run Pace Agent** to compute predictions across the selected lap range.")
        return

    preds = data.get("predictions", [])
    if not preds:
        st.warning("No predictions returned.")
        return

    # Summary metrics from last predicted lap
    valid = [p for p in preds if p.get("pred") is not None]
    if valid:
        last = valid[-1]
        actuals = [p["actual"] for p in valid if p.get("actual") is not None]
        predvals = [p["pred"] for p in valid if p.get("pred") is not None]
        mae = sum(abs(a - p) for a, p in zip(actuals, predvals)) / max(len(actuals), 1)

        c1, c2, c3 = st.columns(3)
        with c1:
            st.markdown(
                _metric_html("Last Predicted", f"{last['pred']:.3f}s"),
                unsafe_allow_html=True,
            )
        with c2:
            st.markdown(
                _metric_html("CI (P10–P90)", f"{last.get('ci_p10', 0):.3f} – {last.get('ci_p90', 0):.3f}"),
                unsafe_allow_html=True,
            )
        with c3:
            st.markdown(
                _metric_html("Range MAE", f"{mae:.3f}s"),
                unsafe_allow_html=True,
            )

    fig = _build_pace_chart(preds, driver)
    if fig:
        st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})


# ---------------------------------------------------------------------------
# Tyre tab
# ---------------------------------------------------------------------------

def _build_cliff_chart(data: dict) -> go.Figure:
    """Horizontal bar chart showing P10/P50/P90 laps to cliff."""
    p10 = data.get("laps_to_cliff_p10", 0)
    p50 = data.get("laps_to_cliff_p50", 0)
    p90 = data.get("laps_to_cliff_p90", 0)
    current = data.get("current_tyre_life", 0)

    fig = go.Figure()

    # P90 (optimistic, full bar background)
    fig.add_trace(go.Bar(
        y=["Tyre Life"], x=[p90], orientation="h", name="P90 (optimistic)",
        marker_color="rgba(46,204,113,0.4)", text=[f"{p90:.0f}"], textposition="outside",
    ))
    # P50 (median)
    fig.add_trace(go.Bar(
        y=["Tyre Life"], x=[p50], orientation="h", name="P50 (median)",
        marker_color="rgba(241,196,15,0.6)", text=[f"{p50:.0f}"], textposition="outside",
    ))
    # P10 (pessimistic)
    fig.add_trace(go.Bar(
        y=["Tyre Life"], x=[p10], orientation="h", name="P10 (pessimistic)",
        marker_color="rgba(231,76,60,0.7)", text=[f"{p10:.0f}"], textposition="outside",
    ))

    # Current tyre life marker
    fig.add_vline(x=current, line=dict(color="cyan", width=2, dash="dash"))
    fig.add_annotation(x=current, y=0, text=f"Now ({current})", showarrow=True,
                       arrowhead=2, ax=0, ay=-30, font=dict(color="cyan", size=11))

    fig.update_layout(**_base_layout(
        barmode="overlay",
        title="Laps to cliff (P10 / P50 / P90)",
        xaxis_title="Laps", height=280,
        margin=dict(t=40, b=55, l=60, r=20),
    ))
    _styled_axes(fig)
    return fig


def _build_deg_projection_chart(data: dict, lap_state: dict) -> go.Figure:
    """Project degradation rate into the future from current tyre life."""
    deg_rate = data.get("deg_rate", 0)
    current_life = data.get("current_tyre_life", 0)
    p50 = data.get("laps_to_cliff_p50", 10)
    compound = data.get("compound", "?")

    # Cap to 60 laps from current life — no F1 stint is longer than that
    projection_end = min(current_life + int(p50) + 5, current_life + 60)
    future_laps = list(range(current_life, projection_end))
    projected_deg = [deg_rate * (lap - current_life) for lap in future_laps]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=future_laps, y=projected_deg,
        mode="lines+markers", name=f"Projected Deg ({compound})",
        line=dict(color="orange", width=2), marker=dict(size=4),
    ))

    # Cliff line at P50
    if current_life + p50 <= future_laps[-1]:
        fig.add_vline(x=current_life + p50,
                      line=dict(color="red", width=2, dash="dash"))
        fig.add_annotation(x=current_life + p50, y=max(projected_deg) * 0.8,
                           text="Cliff (P50)", showarrow=False,
                           font=dict(color="red", size=11))

    fig.update_layout(**_base_layout(
        title=f"Degradation projection — {compound}",
        xaxis_title="Tyre life (laps)", yaxis_title="Cumulative deg (s)",
        height=300,
    ))
    _styled_axes(fig)
    return fig


def _render_tyre_tab(lap_state: dict) -> None:
    """N26 - Tyre Agent."""
    if st.button(":material/play_arrow: Run tyre agent", key="ml_run_tyre", type="primary"):
        with st.spinner("Running Tyre Agent..."):
            ok, data, err = StrategyService.get_tire(lap_state)

        if not ok:
            st.error(f"Tyre Agent error: {err}")
            return

        st.session_state["ml_tyre_result"] = data

    data = st.session_state.get("ml_tyre_result")
    if data is None:
        st.caption("Click **Run Tyre Agent** to get predictions.")
        return

    warning = data.get("warning_level", "LOW")
    st.markdown(f"Tyre Warning: {_warning_badge(warning)}", unsafe_allow_html=True)

    # Cap cliff values at 60 laps — no F1 stint exceeds ~60 laps
    _MAX_CLIFF = 60
    p10_raw = data.get("laps_to_cliff_p10", 0)
    p50_raw = data.get("laps_to_cliff_p50", 0)
    p90_raw = data.get("laps_to_cliff_p90", 0)
    p10_disp = min(p10_raw, _MAX_CLIFF)
    p50_disp = min(p50_raw, _MAX_CLIFF)
    p90_disp = min(p90_raw, _MAX_CLIFF)
    cliff_capped = p10_raw > _MAX_CLIFF or p50_raw > _MAX_CLIFF

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("Deg rate", f"{data.get('deg_rate', 0):.4f} s/lap")
    with c2:
        st.metric("Cliff P10", f"{p10_disp:.0f} laps")
    with c3:
        st.metric("Cliff P50", f"{p50_disp:.0f} laps")
    with c4:
        st.metric("Cliff P90", f"{p90_disp:.0f} laps")

    if cliff_capped:
        st.caption(":material/info: Cliff values capped at 60 laps — model predicts very low degradation on this compound/stint.")

    # Build capped data dict for charts
    data_capped = {**data, "laps_to_cliff_p10": p10_disp, "laps_to_cliff_p50": p50_disp, "laps_to_cliff_p90": p90_disp}

    # Cliff bar chart
    cliff_fig = _build_cliff_chart(data_capped)
    st.plotly_chart(cliff_fig, width="stretch", config={"displayModeBar": False})

    st.space("medium")

    # Degradation projection
    deg_fig = _build_deg_projection_chart(data_capped, lap_state)
    st.plotly_chart(deg_fig, width="stretch", config={"displayModeBar": False})

    st.space("small")

    with st.expander("Agent reasoning", icon=":material/psychology:"):
        st.markdown(data.get("reasoning", "No reasoning available."))


# ---------------------------------------------------------------------------
# Overtake tab
# ---------------------------------------------------------------------------

def _build_gauge(value: float, title: str, max_val: float = 1.0) -> go.Figure:
    """Probability gauge chart."""
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=value * 100,
        number=dict(suffix="%", font=dict(size=28)),
        title=dict(text=title, font=dict(size=14)),
        gauge=dict(
            axis=dict(range=[0, max_val * 100]),
            bar=dict(color="steelblue"),
            steps=[
                dict(range=[0, 25], color="rgba(46,204,113,0.3)"),
                dict(range=[25, 60], color="rgba(241,196,15,0.3)"),
                dict(range=[60, 100], color="rgba(231,76,60,0.3)"),
            ],
            threshold=dict(line=dict(color="red", width=2), thickness=0.75, value=80),
        ),
    ))
    fig.update_layout(**_base_layout(
        height=300,
        margin=dict(t=40, b=50, l=30, r=30),
    ))
    return fig


def _render_overtake_tab(lap_state: dict) -> None:
    """N27 - Overtake probability (part of Race Situation Agent)."""
    if st.button(":material/play_arrow: Run overtake analysis", key="ml_run_overtake", type="primary"):
        with st.spinner("Running Race Situation Agent..."):
            ok, data, err = StrategyService.get_situation(lap_state)

        if not ok:
            st.error(f"Race Situation Agent error: {err}")
            return

        st.session_state["ml_overtake_result"] = data

    data = st.session_state.get("ml_overtake_result")
    if data is None:
        st.caption("Click **Run Overtake Analysis** to get predictions.")
        return

    threat = data.get("threat_level", "LOW")
    st.markdown(f"Threat Level: {_warning_badge(threat)}", unsafe_allow_html=True)

    # Row 1: gauge + contextual factors
    c1, c2 = st.columns(2)
    with c1:
        prob = data.get("overtake_prob", 0)
        fig = _build_gauge(prob, "Overtake Probability")
        st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})
    with c2:
        factors = data.get("contextual_factors", {})
        with st.container(border=True):
            st.markdown("**Contextual factors**")
            if factors:
                for k, v in factors.items():
                    label = k.replace("_", " ").title()
                    st.markdown(f"- **{label}**: {v}")
            else:
                st.caption("No contextual factors available.")

    st.space("small")

    # Row 2: factor breakdown bar chart (if factors available)
    factors = data.get("contextual_factors", {})
    if factors:
        factor_keys = list(factors.keys())
        factor_vals = []
        for v in factors.values():
            try:
                factor_vals.append(float(v))
            except (TypeError, ValueError):
                factor_vals.append(0.0)
        if any(factor_vals):
            bar_fig = go.Figure(go.Bar(
                x=[k.replace("_", " ").title() for k in factor_keys],
                y=factor_vals,
                marker_color=["rgba(167,139,250,0.7)"] * len(factor_keys),
                text=[f"{v:.2f}" for v in factor_vals],
                textposition="outside",
            ))
            bar_fig.update_layout(**_base_layout(
                title="Contextual factor breakdown",
                yaxis_title="Value", height=260,
                margin=dict(t=40, b=60, l=40, r=20),
                showlegend=False,
            ))
            _styled_axes(bar_fig)
            st.plotly_chart(bar_fig, width="stretch", config={"displayModeBar": False})

    st.space("small")
    with st.expander("Agent reasoning", icon=":material/psychology:"):
        st.markdown(data.get("reasoning", "No reasoning available."))


# ---------------------------------------------------------------------------
# Safety Car tab
# ---------------------------------------------------------------------------

def _render_sc_tab(lap_state: dict) -> None:
    """N27 - Safety Car probability (part of Race Situation Agent)."""
    if st.button(":material/play_arrow: Run safety car analysis", key="ml_run_sc", type="primary"):
        with st.spinner("Running Race Situation Agent..."):
            ok, data, err = StrategyService.get_situation(lap_state)

        if not ok:
            st.error(f"Race Situation Agent error: {err}")
            return

        st.session_state["ml_sc_result"] = data

    data = st.session_state.get("ml_sc_result")
    if data is None:
        st.caption("Click **Run Safety Car Analysis** to get predictions.")
        return

    # Row 1: gauge + SC horizon probabilities
    c1, c2 = st.columns(2)
    with c1:
        sc = data.get("sc_prob_3lap", data.get("sc_probability", 0))
        fig = _build_gauge(sc, "SC Probability (next 3 laps)")
        st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})
    with c2:
        # SC probability across different horizons
        sc3 = data.get("sc_prob_3lap", data.get("sc_probability", 0))
        sc5 = data.get("sc_prob_5lap", sc3 * 1.2 if sc3 else 0)
        sc7 = data.get("sc_prob_7lap", sc3 * 1.4 if sc3 else 0)
        horizon_fig = go.Figure(go.Bar(
            x=["Next 3 laps", "Next 5 laps", "Next 7 laps"],
            y=[min(sc3, 1.0), min(sc5, 1.0), min(sc7, 1.0)],
            marker_color=["rgba(239,68,68,0.5)", "rgba(239,68,68,0.65)", "rgba(239,68,68,0.8)"],
            text=[f"{v*100:.0f}%" for v in [min(sc3, 1.0), min(sc5, 1.0), min(sc7, 1.0)]],
            textposition="outside",
        ))
        horizon_fig.update_layout(**_base_layout(
            title="SC probability by horizon",
            yaxis_title="Probability", yaxis_range=[0, 1.1],
            height=280, margin=dict(t=40, b=55, l=40, r=20),
            showlegend=False,
        ))
        _styled_axes(horizon_fig)
        st.plotly_chart(horizon_fig, width="stretch", config={"displayModeBar": False})

    st.space("small")

    # Contextual factors
    factors = data.get("contextual_factors", {})
    if factors:
        with st.container(border=True):
            st.markdown("**Contextual factors**")
            for k, v in factors.items():
                label = k.replace("_", " ").title()
                st.markdown(f"- **{label}**: {v}")

    st.space("small")
    with st.expander("Agent reasoning", icon=":material/psychology:"):
        st.markdown(data.get("reasoning", "No reasoning available."))


# ---------------------------------------------------------------------------
# Pit Strategy tab
# ---------------------------------------------------------------------------

def _render_pit_tab(lap_state: dict) -> None:
    """N28 - Pit Strategy Agent."""
    if st.button(":material/play_arrow: Run pit analysis", key="ml_run_pit", type="primary"):
        with st.spinner("Running Pit Strategy Agent..."):
            ok, data, err = StrategyService.get_pit(lap_state)

        if not ok:
            st.error(f"Pit Strategy Agent error: {err}")
            return

        st.session_state["ml_pit_result"] = data

    data = st.session_state.get("ml_pit_result")
    if data is None:
        st.caption("Click **Run Pit Analysis** to get predictions.")
        return

    # Header: compound recommendation + key metrics
    compound = data.get("compound_recommendation", "")
    if compound:
        st.markdown(
            f"Recommended compound: {_warning_badge(compound)}",
            unsafe_allow_html=True,
        )

    m1, m2, m3 = st.columns(3)
    with m1:
        st.metric("Stop P05", f"{data.get('stop_duration_p05', 0):.2f}s")
    with m2:
        st.metric("Stop P50", f"{data.get('stop_duration_p50', 0):.2f}s")
    with m3:
        st.metric("Stop P95", f"{data.get('stop_duration_p95', 0):.2f}s")

    st.space("small")

    # Full-width stop duration chart
    p05 = data.get("stop_duration_p05", 0)
    p50 = data.get("stop_duration_p50", 0)
    p95 = data.get("stop_duration_p95", 0)

    pit_fig = go.Figure()
    pit_fig.add_trace(go.Bar(
        x=["P05 (optimistic)", "P50 (median)", "P95 (worst case)"],
        y=[p05, p50, p95],
        marker_color=["rgba(46,204,113,0.7)", "rgba(241,196,15,0.7)", "rgba(231,76,60,0.7)"],
        text=[f"{p05:.2f}s", f"{p50:.2f}s", f"{p95:.2f}s"],
        textposition="outside",
    ))
    pit_fig.update_layout(**_base_layout(
        title="Pit stop duration distribution",
        yaxis_title="Seconds", height=320,
        margin=dict(t=40, b=55, l=40, r=20),
        showlegend=False,
    ))
    _styled_axes(pit_fig)
    st.plotly_chart(pit_fig, width="stretch", config={"displayModeBar": False})

    st.space("small")

    # Second row: undercut gauge + recommended action details
    undercut = data.get("undercut_prob")
    action = data.get("action", "")
    target = data.get("undercut_target")
    rec_lap = data.get("recommended_lap")

    if undercut is not None or action or target or rec_lap:
        uc1, uc2 = st.columns([1, 2])
        with uc1:
            if undercut is not None:
                uc_fig = _build_gauge(undercut, "Undercut Probability")
                st.plotly_chart(uc_fig, width="stretch", config={"displayModeBar": False})
        with uc2:
            with st.container(border=True):
                st.markdown("**Pit window details**")
                if action:
                    st.markdown(f"- **Action:** `{action}`")
                if target:
                    st.markdown(f"- **Undercut target:** {target}")
                if rec_lap:
                    st.markdown(f"- **Recommended lap:** {rec_lap}")
                if not any([action, target, rec_lap]):
                    st.caption("No specific window details available.")

    st.space("small")
    with st.expander("Agent reasoning", icon=":material/psychology:"):
        st.markdown(data.get("reasoning", "No reasoning available."))


# ---------------------------------------------------------------------------
# Radio tab — two modes: race radio lookup + free text
# ---------------------------------------------------------------------------

def _render_radio_results(data: dict) -> None:
    """Shared display for Radio Agent results (alerts, per-event NLP pipeline, reasoning).

    Backend returns NLP results nested inside radio_events[].analysis{},
    not at the top level. This function handles both structures.
    """
    # --- Alerts ---
    alerts = data.get("alerts", [])
    if alerts:
        for alert in alerts:
            source = alert.get("source", "radio")
            intent_a = alert.get("intent", "").upper()
            msg = alert.get("message", alert.get("text", str(alert)))
            if intent_a in ("PROBLEM", "WARNING") or source == "rcm":
                st.warning(msg, icon=":material/warning:")
            else:
                st.info(msg, icon=":material/info:")
    else:
        st.success("No alerts for this radio.", icon=":material/check_circle:")

    # --- Per-event NLP results (radio_events[].analysis{}) ---
    events = data.get("radio_events", data.get("messages", []))
    if events:
        st.subheader("Radio messages")
        for evt in events:
            analysis = evt.get("analysis", {})
            text = evt.get("message", evt.get("text", evt.get("transcription", "")))
            sentiment = (analysis.get("sentiment") or evt.get("sentiment", "NEUTRAL")).upper()
            intent = analysis.get("intent") or evt.get("intent", "")
            entities = analysis.get("entities") or evt.get("entities", [])
            driver_tag = evt.get("driver", "")

            # Sentiment color
            s_color = {"POSITIVE": "#10b981", "NEGATIVE": "#ef4444"}.get(sentiment, "#6b7280")

            entity_tags = ""
            if entities:
                tags = " ".join(
                    f'<span style="background:#a78bfa; color:#fff; padding:0.15rem 0.5rem; '
                    f'border-radius:4px; font-size:0.75rem; margin-right:0.3rem;">'
                    f'{e.get("text", e) if isinstance(e, dict) else e}</span>'
                    for e in entities[:6]
                )
                entity_tags = f'<div style="margin-top:0.4rem;">{tags}</div>'

            intent_html = (
                f"<span style='font-size:0.85rem; color:#d1d5db;'>{intent.replace('_', ' ')}</span>"
                if intent else ""
            )
            driver_html = (
                f"<span style='color:#9ca3af; font-size:0.8rem; margin-left:auto;'>Driver {driver_tag}</span>"
                if driver_tag else ""
            )
            st.markdown(
                f'<div style="background:#181633; border:1px solid #2d2b55;'
                f'border-left:3px solid {s_color}; border-radius:8px;'
                f'padding:0.75rem 1rem; margin-bottom:0.5rem;">'
                f'<div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.35rem;">'
                f'<span style="background:{s_color}; color:#fff; padding:0.15rem 0.5rem;'
                f'border-radius:4px; font-size:0.75rem; font-weight:600;">{sentiment}</span>'
                f'{intent_html}{driver_html}'
                f'</div>'
                f'<div style="color:#ffffff; font-size:0.95rem;">{text}</div>'
                f'{entity_tags}'
                f'</div>',
                unsafe_allow_html=True,
            )
    else:
        # Fallback: top-level fields (legacy format)
        sentiment = data.get("sentiment")
        intent = data.get("intent")
        entities = data.get("entities", [])

        c1, c2 = st.columns(2)
        with c1:
            if sentiment:
                st.markdown(_metric_html("Sentiment", str(sentiment)), unsafe_allow_html=True)
        with c2:
            if intent:
                st.markdown(_metric_html("Intent", str(intent)), unsafe_allow_html=True)

        if entities:
            with st.expander("Named entities", icon=":material/label:"):
                for ent in entities:
                    st.markdown(f"- **{ent.get('label', '?')}**: {ent.get('text', ent)}")

    # --- Reasoning ---
    reasoning = data.get("reasoning", "")
    if reasoning:
        with st.expander("Agent reasoning", icon=":material/psychology:"):
            st.markdown(reasoning)


def _render_radio_tab() -> None:
    """N29 - Radio Agent. Two modes: race radio lookup and free text analysis."""
    st.subheader("Radio intelligence")

    mode = st.radio(
        "Input mode",
        ["Race Radio Lookup", "Free Text"],
        horizontal=True,
        key="ml_radio_mode",
    )

    if mode == "Race Radio Lookup":
        _render_radio_lookup()
    else:
        _render_radio_freetext()


def _render_radio_lookup() -> None:
    """Select GP → Driver (only with radio) → Lap (only with radio) → Analyse."""
    st.caption("Browse real team radio messages from the race corpus.")

    year = 2025  # Only 2025 data available
    ok, gp_list, err = StrategyService.get_radio_available_gps(year)
    if not ok or not gp_list:
        st.warning(f"No radio corpus available: {err or 'no GPs found'}")
        return
    gp = st.selectbox("Grand Prix (with radio)", gp_list, key="ml_radio_gp")

    # Fetch all drivers with radio for this GP
    ok, drivers_data, err = StrategyService.get_radio_laps(gp, year)
    if not ok or not drivers_data:
        st.warning(f"No radio data for {gp}: {err or 'empty'}")
        return

    driver_codes = [d["driver"] for d in drivers_data]
    driver_map = {d["driver"]: d for d in drivers_data}

    dc1, dc2 = st.columns(2)
    with dc1:
        selected_driver = st.selectbox("Driver", driver_codes, key="ml_radio_driver")

    drv_info = driver_map[selected_driver]
    available_laps = [entry["lap"] for entry in drv_info["laps"] if entry.get("has_transcript", False)]
    lap_texts = {
        entry["lap"]: entry.get("text", "") for entry in drv_info["laps"]
    }

    with dc2:
        selected_lap = st.selectbox(
            f"Lap ({len(available_laps)} with radio)",
            available_laps,
            key="ml_radio_lap",
        )

    # Show transcript if cached — always show the Analyse button regardless
    transcript = lap_texts.get(selected_lap, "")
    if transcript:
        st.text_area(
            "Transcript (from Whisper cache)",
            value=transcript,
            height=80,
            disabled=True,
            key="ml_radio_transcript_display",
        )
    else:
        st.caption("No cached transcript for this lap — Whisper will run on analyse.")

    if st.button(":material/play_arrow: Analyse radio", key="ml_run_radio_lookup", type="primary"):
        lap_state = {
            "driver": {"driver": selected_driver},
            "lap_number": selected_lap,
        }
        # Do NOT pass "source" kwarg — it crashes RadioMessage constructor
        radio_msgs = [{"driver": selected_driver, "lap": selected_lap, "text": transcript}]

        with st.spinner("Running Radio Agent..."):
            ok, data, err = StrategyService.get_radio(lap_state, radio_msgs=radio_msgs)

        if not ok:
            st.error(f"Radio Agent error: {err}")
            return

        st.session_state["ml_radio_lookup_result"] = data

    data = st.session_state.get("ml_radio_lookup_result")
    if data:
        _render_radio_results(data)


def _render_radio_freetext() -> None:
    """Paste any radio transcript to analyse sentiment, intent, and entities."""
    st.caption("Paste a team radio transcript to analyse.")

    radio_text = st.text_area(
        "Radio transcript",
        placeholder="e.g. Box box, we are going to Plan B, tyres are gone",
        key="ml_radio_text",
    )

    if st.button(":material/play_arrow: Analyse radio", key="ml_run_radio_free", type="primary") and radio_text:
        lap_state = {"driver": {"driver": "UNK"}, "lap_number": 1}
        radio_msgs = [{"driver": "UNK", "lap": 1, "text": radio_text}]

        with st.spinner("Running Radio Agent..."):
            ok, data, err = StrategyService.get_radio(lap_state, radio_msgs=radio_msgs)

        if not ok:
            st.error(f"Radio Agent error: {err}")
            return

        st.session_state["ml_radio_free_result"] = data

    data = st.session_state.get("ml_radio_free_result")
    if data:
        _render_radio_results(data)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def render_model_lab_page() -> None:
    """Called by the router in main.py."""
    _render_header()

    # Purple-border chart CSS (same as Dashboard)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    year, gp, driver, lap_start, lap_end, single_lap = _render_selectors()
    selectors_ready = all(v is not None for v in (year, gp, driver, lap_start))

    tabs = st.tabs([
        ":material/speed: Pace",
        ":material/tire_repair: Tyres",
        ":material/swap_horiz: Overtake",
        ":material/warning: Safety car",
        ":material/settings: Pit strategy",
        ":material/radio: Radio",
    ])

    if not selectors_ready:
        for tab in tabs[:5]:
            with tab:
                st.caption("Configure GP, driver and lap above to run this agent.")
        with tabs[5]:
            _render_radio_tab()
        return

    # Build lap_state for single-lap agents (Tyres, Overtake, SC, Pit)
    lap_state = _fetch_lap_state(year, gp, driver, single_lap)
    if lap_state is None:
        return

    with tabs[0]:
        _render_pace_tab(year, gp, driver, lap_start, lap_end)
    with tabs[1]:
        _render_tyre_tab(lap_state)
    with tabs[2]:
        _render_overtake_tab(lap_state)
    with tabs[3]:
        _render_sc_tab(lap_state)
    with tabs[4]:
        _render_pit_tab(lap_state)
    with tabs[5]:
        _render_radio_tab()
