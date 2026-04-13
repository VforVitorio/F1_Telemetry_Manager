"""
Tool Result Renderer — Renders structured MCP tool results inline in chat.

Each display_type maps to a Streamlit rendering pattern:
- metrics: st.metric columns (pace, probabilities)
- strategy_card: bordered container with action, confidence, compound
- table: st.dataframe for tabular results
- text: st.markdown for plain text (regulations, listings)
"""

import json
from typing import Any, Dict

import streamlit as st


def render_tool_result(tool_result: Dict[str, Any]) -> None:
    """Render a tool result inside a chat message bubble.

    Args:
        tool_result: dict with keys tool_name, display_type, data, summary.
    """
    display_type = tool_result.get("display_type", "text")
    data = tool_result.get("data", {})
    tool_name = tool_result.get("tool_name", "")

    # Tool source badge
    _render_tool_badge(tool_name)

    renderer = _RENDERERS.get(display_type, _render_text)
    renderer(data, tool_name)


def _render_tool_badge(tool_name: str) -> None:
    """Show a small badge indicating which tool produced this result."""
    label = tool_name.replace("_", " ").title()
    st.markdown(
        f'<span style="background:#6366f1; color:white; padding:3px 10px; '
        f'border-radius:4px; font-size:0.75rem; font-weight:600; '
        f'letter-spacing:0.5px;">{label}</span>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Display-type renderers
# ---------------------------------------------------------------------------

def _render_metrics(data: Dict[str, Any], tool_name: str) -> None:
    """Render key-value metrics in columns (pace, situation)."""
    if tool_name == "predict_pace":
        _render_pace_metrics(data)
    elif tool_name == "predict_situation":
        _render_situation_metrics(data)
    else:
        _render_generic_metrics(data)


def _render_pace_metrics(data: Dict[str, Any]) -> None:
    """Render N25 pace prediction as metrics."""
    c1, c2, c3 = st.columns(3)
    with c1:
        pred = data.get("lap_time_pred", 0)
        st.metric("Predicted lap time", f"{pred:.3f}s" if pred else "—")
    with c2:
        delta = data.get("delta_vs_prev", 0)
        st.metric("Delta vs previous", f"{delta:+.3f}s" if delta else "—")
    with c3:
        delta_med = data.get("delta_vs_median", 0)
        st.metric("Delta vs median", f"{delta_med:+.3f}s" if delta_med else "—")

    ci1, ci2 = st.columns(2)
    with ci1:
        st.metric("CI P10 (fast)", f"{data.get('ci_p10', 0):.3f}s")
    with ci2:
        st.metric("CI P90 (slow)", f"{data.get('ci_p90', 0):.3f}s")


def _render_situation_metrics(data: Dict[str, Any]) -> None:
    """Render N27 overtake + SC probabilities."""
    c1, c2, c3 = st.columns(3)
    with c1:
        prob = data.get("overtake_prob", 0)
        st.metric("Overtake prob", f"{prob*100:.0f}%" if prob else "—")
    with c2:
        sc = data.get("sc_prob_3lap", 0)
        st.metric("SC prob (3 laps)", f"{sc*100:.0f}%" if sc else "—")
    with c3:
        threat = data.get("threat_level", "—")
        st.metric("Threat level", threat)


def _render_generic_metrics(data: Dict[str, Any]) -> None:
    """Render any dict as metric columns (up to 4)."""
    numeric_items = [
        (k, v) for k, v in data.items()
        if isinstance(v, (int, float)) and k != "confidence"
    ][:4]
    if not numeric_items:
        _render_text(data, "")
        return

    cols = st.columns(len(numeric_items))
    for col, (key, val) in zip(cols, numeric_items):
        with col:
            label = key.replace("_", " ").title()
            if isinstance(val, float) and val < 1:
                st.metric(label, f"{val*100:.0f}%")
            elif isinstance(val, float):
                st.metric(label, f"{val:.2f}")
            else:
                st.metric(label, str(val))


def _render_strategy_card(data: Dict[str, Any], tool_name: str) -> None:
    """Render a strategy recommendation as a bordered card."""
    with st.container(border=True):
        # Header: action + confidence
        action = data.get("action", data.get("compound_recommendation", ""))
        confidence = data.get("confidence", 0)
        if action:
            badge_color = _action_color(action)
            st.markdown(
                f'<span style="background:{badge_color}; color:#fff; padding:3px 10px; '
                f'border-radius:5px; font-weight:600;">{action}</span>',
                unsafe_allow_html=True,
            )
        if confidence:
            _render_confidence_bar(confidence)

        # Key metrics row
        _render_card_metrics(data, tool_name)

        # Reasoning
        reasoning = data.get("reasoning", "")
        if reasoning:
            with st.expander(":material/psychology: Reasoning", expanded=False):
                st.markdown(reasoning)


def _render_card_metrics(data: Dict[str, Any], tool_name: str) -> None:
    """Render the key metric row inside a strategy card."""
    if tool_name == "predict_tire":
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            st.metric("Compound", str(data.get("compound", "—")).upper())
        with c2:
            st.metric("Deg rate", f"{data.get('deg_rate', 0):.4f} s/lap")
        with c3:
            st.metric("Cliff P50", f"{data.get('laps_to_cliff_p50', 0):.0f} laps")
        with c4:
            st.metric("Warning", data.get("warning_level", "—"))

    elif tool_name == "predict_pit":
        c1, c2, c3 = st.columns(3)
        with c1:
            st.metric("Stop P50", f"{data.get('stop_duration_p50', 0):.2f}s")
        with c2:
            uc = data.get("undercut_prob")
            st.metric("Undercut prob", f"{uc*100:.0f}%" if uc else "—")
        with c3:
            st.metric("Rec. lap", str(data.get("recommended_lap", "—")))

    elif tool_name == "recommend_strategy":
        scores = data.get("scenario_scores", {})
        if scores:
            st.markdown("**Scenario scores:**")
            for key, val in scores.items():
                score = val.get("score", val) if isinstance(val, dict) else val
                st.markdown(f"- **{key}**: {score:.3f}")


def _render_table(data: Dict[str, Any], tool_name: str) -> None:
    """Render tabular data (radio events, alerts)."""
    import pandas as pd

    alerts = data.get("alerts", [])
    radio_events = data.get("radio_events", [])

    items = alerts or radio_events
    if items and isinstance(items[0], dict):
        st.dataframe(pd.DataFrame(items), use_container_width=True)
    else:
        _render_text(data, tool_name)


def _render_text(data: Dict[str, Any], tool_name: str) -> None:
    """Render plain text / JSON fallback."""
    answer = data.get("answer", "")
    if answer:
        st.markdown(answer)
        articles = data.get("articles", [])
        if articles:
            with st.expander("Source articles"):
                for a in articles:
                    st.markdown(f"- {a}")
        return

    gps = data.get("gps", [])
    drivers = data.get("drivers", [])
    if gps:
        st.markdown("**Available Grand Prix:** " + ", ".join(gps))
        return
    if drivers:
        st.markdown("**Drivers:** " + ", ".join(drivers))
        return

    st.json(data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _render_confidence_bar(confidence: float) -> None:
    """Render a visual progress bar for confidence level."""
    pct = confidence * 100
    color = "#10b981" if pct >= 70 else "#f59e0b" if pct >= 40 else "#ef4444"
    st.markdown(
        f'<div style="margin: 6px 0 10px;">'
        f'<span style="color:#9ca3af; font-size:0.75rem;">Confidence {pct:.0f}%</span>'
        f'<div style="background:#2d2d3a; height:6px; border-radius:3px; margin-top:3px;">'
        f'<div style="background:{color}; height:100%; width:{pct}%; '
        f'border-radius:3px; transition:width 0.3s;"></div>'
        f'</div></div>',
        unsafe_allow_html=True,
    )


def _action_color(action: str) -> str:
    """Return a badge background color for the strategy action."""
    a = action.upper()
    if "STAY" in a or "CONTINUE" in a:
        return "#10b981"
    if "PIT" in a or "BOX" in a:
        return "#f59e0b"
    if "PUSH" in a or "ATTACK" in a:
        return "#ef4444"
    return "#6366f1"


_RENDERERS = {
    "metrics": _render_metrics,
    "strategy_card": _render_strategy_card,
    "table": _render_table,
    "text": _render_text,
    "chart": _render_text,  # chart rendering TODO: plotly from base64
}
