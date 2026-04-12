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
from components.strategy.agent_tabs import _metric_html, _warning_badge  # noqa: E402
from services.strategy_service import StrategyService  # noqa: E402

COMPOUND_COLORS = {
    "SOFT": "#E8002D", "MEDIUM": "#FFF200", "HARD": "#EEEEEE",
    "INTERMEDIATE": "#39B54A", "WET": "#0067FF",
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

def _render_header() -> None:
    st.markdown(
        "<h1 style='text-align: center;'>Model lab</h1>",
        unsafe_allow_html=True,
    )
    st.caption("Run individual ML agents on any race lap without the full orchestrator.")


# ---------------------------------------------------------------------------
# Shared selectors
# ---------------------------------------------------------------------------

def _render_selectors() -> tuple:
    """Year + GP + Driver + Lap range. Returns (year, gp, driver, lap_start, lap_end, single_lap)."""
    c1, c2, c3 = st.columns(3)

    with c1:
        year = st.selectbox("Season", [2025, 2024, 2023], index=0, key="ml_year")

    with c2:
        ok, gp_list, err = StrategyService.get_available_gps(year)
        if ok and gp_list:
            gp = st.selectbox("Grand Prix", gp_list, key="ml_gp")
        else:
            st.warning(f"Could not load GPs: {err}")
            return (None,) * 6

    with c3:
        ok, drv_list, err = StrategyService.get_available_drivers(gp, year)
        if ok and drv_list:
            driver = st.selectbox("Driver", drv_list, key="ml_driver")
        else:
            st.warning(f"Could not load drivers: {err}")
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
            "Lap Range (for Pace chart)",
            min_value=min_lap, max_value=max_lap,
            value=(min_lap, max_lap), key="ml_lap_range",
        )
    with rc2:
        single_lap = st.slider(
            "Single Lap (for other agents)",
            min_value=min_lap, max_value=max_lap,
            value=min(min_lap + 10, max_lap), key="ml_lap",
        )

    return year, gp, driver, lap_range[0], lap_range[1], single_lap


def _fetch_lap_state(year: int, gp: str, driver: str, lap: int) -> dict | None:
    """Build a canonical lap_state from the backend parquet."""
    cache_key = f"ml_lap_state_{year}_{gp}_{driver}_{lap}"
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    with st.spinner("Building lap state..."):
        ok, data, err = StrategyService.get_lap_state(gp, driver, lap, year)

    if not ok:
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

    fig.update_layout(
        template="plotly_dark",
        title=f"{driver} — Actual vs Predicted Lap Times",
        xaxis_title="Lap Number", yaxis_title="Lap Time (s)",
        height=450, margin=dict(t=50, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
    )
    return fig


def _render_pace_tab(year: int, gp: str, driver: str, lap_start: int, lap_end: int) -> None:
    """N25 - Pace Agent across a lap range."""
    if st.button(":material/play_arrow: Run pace agent", key="ml_run_pace", type="primary"):
        with st.spinner(f"Running Pace Agent on laps {lap_start}–{lap_end}..."):
            ok, data, err = StrategyService.get_pace_range(year, gp, driver, lap_start, lap_end)

        if not ok:
            st.error(f"Pace Agent error: {err}")
            return

        st.session_state["ml_pace_range"] = data

    data = st.session_state.get("ml_pace_range")
    if data is None:
        st.info("Click **Run Pace Agent** to compute predictions across the selected lap range.")
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
        st.plotly_chart(fig, use_container_width=True)


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

    fig.update_layout(
        template="plotly_dark", barmode="overlay",
        title="Laps to Cliff (P10 / P50 / P90)",
        xaxis_title="Laps", height=200, margin=dict(t=40, b=30, l=60, r=20),
        showlegend=True, legend=dict(orientation="h", yanchor="bottom", y=1.02),
    )
    return fig


def _build_deg_projection_chart(data: dict, lap_state: dict) -> go.Figure:
    """Project degradation rate into the future from current tyre life."""
    deg_rate = data.get("deg_rate", 0)
    current_life = data.get("current_tyre_life", 0)
    p50 = data.get("laps_to_cliff_p50", 10)
    compound = data.get("compound", "?")

    future_laps = list(range(current_life, current_life + int(p50) + 5))
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

    fig.update_layout(
        template="plotly_dark",
        title=f"Degradation Projection — {compound}",
        xaxis_title="Tyre Life (laps)", yaxis_title="Cumulative Deg (s)",
        height=300, margin=dict(t=40, b=40),
    )
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
        st.info("Click **Run Tyre Agent** to get predictions.")
        return

    warning = data.get("warning_level", "LOW")
    st.markdown(f"Tyre Warning: {_warning_badge(warning)}", unsafe_allow_html=True)

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(
            _metric_html("Deg Rate", f"{data.get('deg_rate', 0):.4f} s/lap"),
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            _metric_html("Cliff P10", f"{data.get('laps_to_cliff_p10', 0):.0f} laps"),
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            _metric_html("Cliff P50", f"{data.get('laps_to_cliff_p50', 0):.0f} laps"),
            unsafe_allow_html=True,
        )
    with c4:
        st.markdown(
            _metric_html("Cliff P90", f"{data.get('laps_to_cliff_p90', 0):.0f} laps"),
            unsafe_allow_html=True,
        )

    # Cliff bar chart
    cliff_fig = _build_cliff_chart(data)
    st.plotly_chart(cliff_fig, use_container_width=True)

    # Degradation projection
    deg_fig = _build_deg_projection_chart(data, lap_state)
    st.plotly_chart(deg_fig, use_container_width=True)

    with st.expander("Reasoning"):
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
    fig.update_layout(
        template="plotly_dark", height=220,
        margin=dict(t=40, b=10, l=30, r=30),
    )
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
        st.info("Click **Run Overtake Analysis** to get predictions.")
        return

    threat = data.get("threat_level", "LOW")
    st.markdown(f"Threat Level: {_warning_badge(threat)}", unsafe_allow_html=True)

    c1, c2 = st.columns(2)
    with c1:
        prob = data.get("overtake_prob", 0)
        fig = _build_gauge(prob, "Overtake Probability")
        st.plotly_chart(fig, use_container_width=True)
    with c2:
        factors = data.get("contextual_factors", {})
        if factors:
            st.markdown("**Contextual Factors**")
            for k, v in factors.items():
                st.markdown(f"- **{k}**: {v}")

    with st.expander("Reasoning"):
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
        st.info("Click **Run Safety Car Analysis** to get predictions.")
        return

    c1, c2 = st.columns(2)
    with c1:
        sc = data.get("sc_prob_3lap", 0)
        fig = _build_gauge(sc, "SC Probability (next 3 laps)")
        st.plotly_chart(fig, use_container_width=True)
    with c2:
        factors = data.get("contextual_factors", {})
        if factors:
            st.markdown("**Contextual Factors**")
            for k, v in factors.items():
                st.markdown(f"- **{k}**: {v}")

    with st.expander("Reasoning"):
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
        st.info("Click **Run Pit Analysis** to get predictions.")
        return

    compound = data.get("compound_recommendation", "")
    if compound:
        st.markdown(
            f"Recommended Compound: {_warning_badge(compound)}",
            unsafe_allow_html=True,
        )

    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(
            _metric_html("Stop P05", f"{data.get('stop_duration_p05', 0):.2f}s"),
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            _metric_html("Stop P50", f"{data.get('stop_duration_p50', 0):.2f}s"),
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            _metric_html("Stop P95", f"{data.get('stop_duration_p95', 0):.2f}s"),
            unsafe_allow_html=True,
        )

    # Stop duration distribution chart
    p05 = data.get("stop_duration_p05", 0)
    p50 = data.get("stop_duration_p50", 0)
    p95 = data.get("stop_duration_p95", 0)

    pit_fig = go.Figure()
    pit_fig.add_trace(go.Bar(
        x=["P05", "P50", "P95"],
        y=[p05, p50, p95],
        marker_color=["rgba(46,204,113,0.7)", "rgba(241,196,15,0.7)", "rgba(231,76,60,0.7)"],
        text=[f"{p05:.2f}s", f"{p50:.2f}s", f"{p95:.2f}s"],
        textposition="outside",
    ))
    pit_fig.update_layout(
        template="plotly_dark", title="Pit Stop Duration Distribution",
        yaxis_title="Seconds", height=280, margin=dict(t=40, b=30),
        showlegend=False,
    )
    st.plotly_chart(pit_fig, use_container_width=True)

    undercut = data.get("undercut_prob")
    if undercut is not None:
        uc1, uc2 = st.columns([1, 2])
        with uc1:
            uc_fig = _build_gauge(undercut, "Undercut Probability")
            st.plotly_chart(uc_fig, use_container_width=True)
        with uc2:
            target = data.get("undercut_target")
            if target:
                st.markdown(f"**Undercut Target:** {target}")
            action = data.get("action", "")
            if action:
                st.markdown(f"**Recommended Action:** `{action}`")
            rec_lap = data.get("recommended_lap")
            if rec_lap:
                st.markdown(f"**Recommended Lap:** {rec_lap}")

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))


# ---------------------------------------------------------------------------
# Radio tab — two modes: race radio lookup + free text
# ---------------------------------------------------------------------------

def _render_radio_results(data: dict) -> None:
    """Shared display for Radio Agent results (sentiment, intent, NER, alerts)."""
    alerts = data.get("alerts", [])
    if alerts:
        for alert in alerts:
            severity = alert.get("severity", "info")
            msg = alert.get("message", str(alert))
            if severity == "critical":
                st.error(msg)
            elif severity == "warning":
                st.warning(msg)
            else:
                st.info(msg)

    sentiment = data.get("sentiment")
    intent = data.get("intent")
    entities = data.get("entities", [])

    c1, c2 = st.columns(2)
    with c1:
        if sentiment:
            st.markdown(
                _metric_html("Sentiment", str(sentiment)),
                unsafe_allow_html=True,
            )
    with c2:
        if intent:
            st.markdown(
                _metric_html("Intent", str(intent)),
                unsafe_allow_html=True,
            )

    if entities:
        with st.expander("Named Entities"):
            for ent in entities:
                st.markdown(f"- **{ent.get('label', '?')}**: {ent.get('text', ent)}")

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))


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

    rc1, rc2 = st.columns(2)
    with rc1:
        year = st.selectbox("Season", [2025, 2024, 2023], index=0, key="ml_radio_year")
    with rc2:
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
    available_laps = [entry["lap"] for entry in drv_info["laps"]]
    lap_texts = {
        entry["lap"]: entry.get("text", "") for entry in drv_info["laps"]
    }

    with dc2:
        selected_lap = st.selectbox(
            f"Lap ({len(available_laps)} with radio)",
            available_laps,
            key="ml_radio_lap",
        )

    # Show the transcript for the selected lap
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
        st.info("No cached transcript for this lap. Run Whisper locally first.")
        return

    if st.button(":material/play_arrow: Analyse radio", key="ml_run_radio_lookup", type="primary"):
        lap_state = {
            "driver": {"driver": selected_driver},
            "lap_number": selected_lap,
        }
        radio_msgs = [{
            "driver": selected_driver,
            "lap": selected_lap,
            "text": transcript,
            "source": "corpus",
        }]

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
        radio_msgs = [{"text": radio_text, "source": "user_input"}]

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

    year, gp, driver, lap_start, lap_end, single_lap = _render_selectors()
    selectors_ready = all(v is not None for v in (year, gp, driver, lap_start))

    tabs = st.tabs([
        ":material/speed: Pace",
        ":material/tire_repair: Tyres",
        ":material/swap_horiz: Overtake",
        ":material/warning: Safety car",
        ":material/build: Pit strategy",
        ":material/radio: Radio",
    ])

    if not selectors_ready:
        for tab in tabs[:5]:
            with tab:
                st.info("Select Season, GP, Driver, and Lap above to enable this agent.")
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
