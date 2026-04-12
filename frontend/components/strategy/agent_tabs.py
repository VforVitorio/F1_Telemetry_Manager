"""
Agent Detail Tabs

Four sub-tabs showing individual agent outputs for the current lap state:
Pace, Tyres, Race Situation, Pit Analysis.
Each tab calls the corresponding StrategyService method, displays key metrics,
and shows the reasoning in an expander.
Results are cached in session_state so re-renders don't re-fetch.
"""

import hashlib
import json

import streamlit as st
from app.styles import Color, StatusColor, TextColor
from services.strategy_service import StrategyService

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _metric_html(label: str, value: str, color: str = TextColor.PRIMARY) -> str:
    """Small styled metric block (label + value)."""
    return f"""
    <div style="
        background: {Color.CONTENT_BG};
        border: 1px solid {Color.BORDER};
        border-radius: 8px;
        padding: 0.75rem 1rem;
        text-align: center;
    ">
        <div style="color: {TextColor.SECONDARY}; font-size: 0.8rem; margin-bottom: 0.25rem;">
            {label}
        </div>
        <div style="color: {color}; font-size: 1.3rem; font-weight: 700;">
            {value}
        </div>
    </div>
    """


def _warning_badge(level: str) -> str:
    """Coloured badge for warning / threat levels."""
    level_upper = level.upper()
    if level_upper in ("HIGH", "CRITICAL"):
        bg = StatusColor.ERROR
    elif level_upper in ("MEDIUM", "MODERATE"):
        bg = StatusColor.WARNING
    else:
        bg = StatusColor.SUCCESS
    return (
        f'<span style="background:{bg}; color:#fff; padding:0.2rem 0.7rem; '
        f'border-radius:5px; font-weight:600; font-size:0.85rem;">{level}</span>'
    )


def _cache_key(prefix: str, lap_state: dict) -> str:
    """Deterministic cache key from agent name + lap state."""
    state_str = json.dumps(lap_state, sort_keys=True, default=str)
    digest = hashlib.md5(state_str.encode()).hexdigest()[:10]
    return f"agent_{prefix}_{digest}"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def render_agent_tabs(lap_state: dict) -> None:
    """Render 4 sub-tabs, one per sub-agent.

    Each tab fires its own backend call via StrategyService. Results are
    cached in st.session_state so re-renders don't re-fetch.
    """
    tabs = st.tabs([
        ":material/speed: Pace",
        ":material/tire_repair: Tyres",
        ":material/flag: Race situation",
        ":material/build: Pit analysis",
    ])

    with tabs[0]:
        _render_pace_tab(lap_state)
    with tabs[1]:
        _render_tyre_tab(lap_state)
    with tabs[2]:
        _render_situation_tab(lap_state)
    with tabs[3]:
        _render_pit_tab(lap_state)


# ---------------------------------------------------------------------------
# Tab renderers
# ---------------------------------------------------------------------------

def _render_pace_tab(lap_state: dict) -> None:
    """Pace Agent: lap time prediction + CI + delta."""
    key = _cache_key("pace", lap_state)
    if key not in st.session_state:
        with st.spinner("Running Pace Agent..."):
            ok, data, err = StrategyService.get_pace(lap_state)
        if not ok:
            st.error(f"Pace Agent error: {err}")
            return
        st.session_state[key] = data

    data = st.session_state[key]

    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown(
            _metric_html("Predicted lap time", f"{data.get('lap_time_pred', 0):.3f}s"),
            unsafe_allow_html=True,
        )
    with col2:
        p10 = data.get("ci_p10", 0)
        p90 = data.get("ci_p90", 0)
        st.markdown(
            _metric_html("CI (P10 \u2013 P90)", f"{p10:.3f} \u2013 {p90:.3f}"),
            unsafe_allow_html=True,
        )
    with col3:
        delta = data.get("delta_vs_median", 0)
        color = StatusColor.SUCCESS if delta <= 0 else StatusColor.ERROR
        st.markdown(
            _metric_html("Delta vs median", f"{delta:+.3f}s", color=color),
            unsafe_allow_html=True,
        )

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))


def _render_tyre_tab(lap_state: dict) -> None:
    """Tyre Agent: degradation rate + laps-to-cliff + warning."""
    key = _cache_key("tyre", lap_state)
    if key not in st.session_state:
        with st.spinner("Running Tyre Agent..."):
            ok, data, err = StrategyService.get_tire(lap_state)
        if not ok:
            st.error(f"Tyre Agent error: {err}")
            return
        st.session_state[key] = data

    data = st.session_state[key]

    warning = data.get("warning_level", "LOW")
    st.markdown(
        f"Tyre warning: {_warning_badge(warning)}",
        unsafe_allow_html=True,
    )

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.markdown(
            _metric_html("Deg rate", f"{data.get('deg_rate', 0):.4f} s/lap"),
            unsafe_allow_html=True,
        )
    with col2:
        st.markdown(
            _metric_html("Cliff P10", f"{data.get('laps_to_cliff_p10', 0):.0f} laps"),
            unsafe_allow_html=True,
        )
    with col3:
        st.markdown(
            _metric_html("Cliff P50", f"{data.get('laps_to_cliff_p50', 0):.0f} laps"),
            unsafe_allow_html=True,
        )
    with col4:
        st.markdown(
            _metric_html("Cliff P90", f"{data.get('laps_to_cliff_p90', 0):.0f} laps"),
            unsafe_allow_html=True,
        )

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))


def _render_situation_tab(lap_state: dict) -> None:
    """Race Situation Agent: overtake + SC probability + threat."""
    key = _cache_key("situation", lap_state)
    if key not in st.session_state:
        with st.spinner("Running Race Situation Agent..."):
            ok, data, err = StrategyService.get_situation(lap_state)
        if not ok:
            st.error(f"Race Situation Agent error: {err}")
            return
        st.session_state[key] = data

    data = st.session_state[key]

    threat = data.get("threat_level", "LOW")
    st.markdown(
        f"Threat level: {_warning_badge(threat)}",
        unsafe_allow_html=True,
    )

    col1, col2 = st.columns(2)
    with col1:
        overtake = data.get("overtake_prob", 0)
        st.markdown(
            _metric_html("Overtake probability", f"{overtake:.1%}"),
            unsafe_allow_html=True,
        )
    with col2:
        sc = data.get("sc_prob_3lap", 0)
        st.markdown(
            _metric_html("SC probability (3 laps)", f"{sc:.1%}"),
            unsafe_allow_html=True,
        )

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))


def _render_pit_tab(lap_state: dict) -> None:
    """Pit Strategy Agent: stop duration + undercut + compound rec."""
    key = _cache_key("pit", lap_state)
    if key not in st.session_state:
        with st.spinner("Running Pit Strategy Agent..."):
            ok, data, err = StrategyService.get_pit(lap_state)
        if not ok:
            st.error(f"Pit Strategy Agent error: {err}")
            return
        st.session_state[key] = data

    data = st.session_state[key]

    compound = data.get("compound_recommendation", "")
    if compound:
        st.markdown(
            f"Recommended compound: {_warning_badge(compound)}",
            unsafe_allow_html=True,
        )

    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown(
            _metric_html("Stop P05", f"{data.get('stop_duration_p05', 0):.2f}s"),
            unsafe_allow_html=True,
        )
    with col2:
        st.markdown(
            _metric_html("Stop P50", f"{data.get('stop_duration_p50', 0):.2f}s"),
            unsafe_allow_html=True,
        )
    with col3:
        st.markdown(
            _metric_html("Stop P95", f"{data.get('stop_duration_p95', 0):.2f}s"),
            unsafe_allow_html=True,
        )

    undercut = data.get("undercut_prob")
    if undercut is not None:
        st.markdown(
            _metric_html("Undercut probability", f"{undercut:.1%}"),
            unsafe_allow_html=True,
        )

    with st.expander("Reasoning"):
        st.markdown(data.get("reasoning", "No reasoning available."))
