"""
Strategy Recommendation Card

Renders the top-level strategy recommendation returned by the N31 orchestrator:
action badge, confidence metric, risk level, reasoning, and regulation context.
Uses native Streamlit components (st.badge, st.metric, st.container) — no raw HTML.
"""

import streamlit as st

# Action → st.badge color
_BADGE_COLOR = {
    "STAY_OUT": "green",
    "PIT_NOW": "red",
    "UNDERCUT": "orange",
    "OVERCUT": "blue",
    "EXTEND_STINT": "gray",
}

# Action → material icon
_ACTION_ICON = {
    "STAY_OUT": ":material/check_circle:",
    "PIT_NOW": ":material/flag:",
    "UNDERCUT": ":material/arrow_downward:",
    "OVERCUT": ":material/arrow_upward:",
    "EXTEND_STINT": ":material/timer:",
}


def render_strategy_card(recommendation: dict) -> None:
    """Display a strategy recommendation card using native Streamlit components.

    Parameters
    ----------
    recommendation : dict
        Must contain at least ``action``, ``confidence``, ``reasoning``.
        Optional: ``regulation_context``, ``risk_level``, ``scenario_scores``.
    """
    action = recommendation.get("action", "UNKNOWN")
    confidence = recommendation.get("confidence", 0.0)
    reasoning = recommendation.get("reasoning", "")
    regulation = recommendation.get("regulation_context", "")
    risk = recommendation.get("risk_level", "")

    badge_color = _BADGE_COLOR.get(action, "blue")
    action_icon = _ACTION_ICON.get(action, ":material/sports_score:")
    action_label = action.replace("_", " ")

    # --- Header: action badge + confidence + risk ---
    st.subheader(f"{action_icon} Recommendation")

    header_cols = st.columns([3, 1, 1])
    with header_cols[0]:
        st.badge(action_label, color=badge_color)
    with header_cols[1]:
        st.metric("Confidence", f"{confidence * 100:.0f}%")
    with header_cols[2]:
        if risk:
            st.metric("Risk", risk.title())

    # --- Reasoning ---
    if reasoning:
        with st.container(border=True):
            st.markdown("**Reasoning**")
            st.markdown(reasoning[:800] if len(reasoning) > 800 else reasoning)

    # --- Regulation context (collapsible) ---
    if regulation:
        with st.expander(":material/gavel: Regulation context", icon=":material/gavel:"):
            st.markdown(regulation)
