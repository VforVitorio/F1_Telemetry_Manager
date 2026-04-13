"""
Radio Intelligence Panel

Displays the Radio Agent (N29) output: sentiment alerts, intent tags,
NER entities, and optional audio playback.
"""

from typing import Any, Dict, List, Optional

import streamlit as st
from app.styles import Color, StatusColor, TextColor
from services.strategy_service import StrategyService

# Sentiment → colour
_SENTIMENT_COLORS = {
    "POSITIVE": StatusColor.SUCCESS,
    "NEGATIVE": StatusColor.ERROR,
    "NEUTRAL": StatusColor.INFO,
}

# Intent → icon (unicode)
_INTENT_ICONS = {
    "box_call": "\u2b06",
    "tyre_info": "\U0001f6de",
    "pace_instruction": "\u23f1",
    "weather_update": "\u2601",
    "safety_info": "\u26a0",
    "encouragement": "\U0001f44d",
    "question": "\u2753",
}


def render_radio_panel(
    lap_state: Dict[str, Any],
    radio_msgs: Optional[List[Dict[str, Any]]] = None,
    rcm_events: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Render the radio intelligence section.

    Calls the Radio Agent endpoint and displays alerts + message cards.
    """
    with st.spinner("Running Radio Agent..."):
        ok, data, err = StrategyService.get_radio(
            lap_state,
            radio_msgs=radio_msgs,
            rcm_events=rcm_events,
        )

    if not ok:
        st.error(f"Radio Agent error: {err}")
        return

    # Store full result for download
    st.session_state["radio_last_result"] = data

    alerts: list = data.get("alerts", [])
    # Backend returns "radio_events", not "messages"
    messages: list = data.get("radio_events", data.get("messages", []))
    reasoning: str = data.get("reasoning", "")

    # --- Alerts banner ---
    if alerts:
        for alert in alerts:
            source = alert.get("source", "radio")
            intent = alert.get("intent", "").upper()
            msg_text = alert.get("message", alert.get("text", ""))
            driver_tag = alert.get("driver", "")
            prefix = f"[{driver_tag}] " if driver_tag else ""

            if intent in ("PROBLEM", "WARNING") or source == "rcm":
                st.warning(f"{prefix}{msg_text}", icon=":material/warning:")
            else:
                st.info(f"{prefix}{msg_text}", icon=":material/info:")
    else:
        st.success("No radio alerts for this lap.", icon=":material/check_circle:")

    # --- Message cards ---
    if messages:
        st.subheader("Radio messages")
        for msg in messages:
            _render_message_card(msg)

    # --- Reasoning ---
    if reasoning:
        with st.expander("Reasoning"):
            st.markdown(reasoning)


def _render_message_card(msg: Dict[str, Any]) -> None:
    """Single radio message card with sentiment badge and intent tags.

    Handles both flat format (text/sentiment/intent at top level) and
    nested format from the backend (analysis dict inside each event).
    """
    # Backend wraps NLP results inside "analysis"
    analysis = msg.get("analysis", {})
    text = msg.get("message", msg.get("text", msg.get("transcription", "")))
    sentiment = (analysis.get("sentiment") or msg.get("sentiment", "NEUTRAL")).upper()
    intent = analysis.get("intent") or msg.get("intent", "")
    entities: list = analysis.get("entities") or msg.get("entities", [])
    driver = msg.get("driver", "")

    sentiment_color = _SENTIMENT_COLORS.get(sentiment, StatusColor.INFO)
    intent_icon = _INTENT_ICONS.get(intent, "")

    entity_html = ""
    if entities:
        tags = " ".join(
            f'<span style="background:{Color.ACCENT}; color:#fff; '
            f'padding:0.15rem 0.5rem; border-radius:4px; font-size:0.75rem; '
            f'margin-right:0.3rem;">{e.get("text", e) if isinstance(e, dict) else e}</span>'
            for e in entities[:6]
        )
        entity_html = f'<div style="margin-top:0.4rem;">{tags}</div>'

    st.markdown(
        f"""
        <div style="
            background: {Color.CONTENT_BG};
            border: 1px solid {Color.BORDER};
            border-left: 3px solid {sentiment_color};
            border-radius: 8px;
            padding: 0.75rem 1rem;
            margin-bottom: 0.5rem;
        ">
            <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.35rem;">
                <span style="
                    background:{sentiment_color}; color:#fff;
                    padding:0.15rem 0.5rem; border-radius:4px;
                    font-size:0.75rem; font-weight:600;
                ">{sentiment}</span>
                {"<span style='font-size:0.85rem; color:" + TextColor.SECONDARY + ";'>" + intent_icon + " " + intent.replace("_", " ") + "</span>" if intent else ""}
                {"<span style='color:" + TextColor.TERTIARY + "; font-size:0.8rem; margin-left:auto;'>Driver " + str(driver) + "</span>" if driver else ""}
            </div>
            <div style="color:{TextColor.PRIMARY}; font-size:0.95rem;">
                {text}
            </div>
            {entity_html}
        </div>
        """,
        unsafe_allow_html=True,
    )
