"""
Strategy Recommendation Card

Renders the top-level strategy recommendation returned by the N31 orchestrator:
action badge, confidence bar, reasoning summary, and regulation context.
"""

import streamlit as st
from app.styles import Color, StatusColor, TextColor

# Action → colour mapping
_ACTION_COLORS = {
    "STAY_OUT": StatusColor.SUCCESS,       # green
    "PIT_NOW": StatusColor.ERROR,          # red
    "UNDERCUT": StatusColor.WARNING,       # amber
    "OVERCUT": StatusColor.WARNING,        # amber
    "EXTEND_STINT": StatusColor.INFO,      # blue
}


def render_strategy_card(recommendation: dict) -> None:
    """Display a styled strategy recommendation card.

    Parameters
    ----------
    recommendation : dict
        Must contain at least ``action``, ``confidence``, ``reasoning``.
        Optional: ``regulation_context``, ``scenario_scores``.
    """
    action = recommendation.get("action", "UNKNOWN")
    confidence = recommendation.get("confidence", 0.0)
    reasoning = recommendation.get("reasoning", "")
    regulation = recommendation.get("regulation_context", "")

    badge_color = _ACTION_COLORS.get(action, Color.ACCENT)

    # --- Action badge + confidence header ---
    st.markdown(
        f"""
        <div style="
            background: {Color.CONTENT_BG};
            border: 1px solid {Color.BORDER};
            border-left: 4px solid {badge_color};
            border-radius: 10px;
            padding: 1.25rem 1.5rem;
            margin-bottom: 1rem;
        ">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
                <span style="
                    background: {badge_color};
                    color: {TextColor.AGAINST_ACCENT};
                    font-weight: 700;
                    padding: 0.35rem 1rem;
                    border-radius: 6px;
                    font-size: 1.1rem;
                    letter-spacing: 0.5px;
                ">{action.replace("_", " ")}</span>
                <span style="color: {TextColor.SECONDARY}; font-size: 0.95rem;">
                    Confidence: <b style="color: {TextColor.PRIMARY};">{confidence:.0%}</b>
                </span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # --- Reasoning ---
    if reasoning:
        st.info(reasoning[:500] if len(reasoning) > 500 else reasoning)

    # --- Regulation context (collapsible) ---
    if regulation:
        with st.expander("Regulation context"):
            st.markdown(regulation)
