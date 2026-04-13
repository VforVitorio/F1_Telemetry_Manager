"""
Scenario Score Chart

Horizontal bar chart comparing the orchestrator's scenario scores
(STAY_OUT, PIT_NOW, UNDERCUT, OVERCUT, EXTEND_STINT).
"""

from typing import Optional

import plotly.graph_objects as go
from app.styles import Color, StatusColor

# Ordered labels for consistent display
_SCENARIO_ORDER = ["STAY_OUT", "PIT_NOW", "UNDERCUT", "OVERCUT", "EXTEND_STINT"]

_SCENARIO_COLORS = {
    "STAY_OUT": StatusColor.SUCCESS,
    "PIT_NOW": StatusColor.ERROR,
    "UNDERCUT": StatusColor.WARNING,
    "OVERCUT": StatusColor.WARNING,
    "EXTEND_STINT": StatusColor.INFO,
}


def render_scenario_chart(scenario_scores: dict) -> Optional[go.Figure]:
    """Build a horizontal bar chart of scenario scores.

    Parameters
    ----------
    scenario_scores : dict
        Keys are scenario names, values are either floats or dicts
        with a ``score`` key (the format returned by the orchestrator).

    Returns
    -------
    go.Figure or None
        The Plotly figure, ready for ``st.plotly_chart()``.
    """
    if not scenario_scores:
        return None

    labels = []
    scores = []
    colors = []

    # Determine the winning scenario
    parsed: dict[str, float] = {}
    for key, val in scenario_scores.items():
        parsed[key] = val["score"] if isinstance(val, dict) else float(val)

    best = max(parsed, key=parsed.get) if parsed else None

    for label in _SCENARIO_ORDER:
        if label not in parsed:
            continue
        labels.append(label.replace("_", " "))
        scores.append(parsed[label])
        colors.append(
            Color.ACCENT if label == best else _SCENARIO_COLORS.get(label, "#6b7280")
        )

    if not labels:
        return None

    fig = go.Figure(
        go.Bar(
            x=scores,
            y=labels,
            orientation="h",
            marker_color=colors,
            text=[f"{s:.3f}" for s in scores],
            textposition="auto",
        )
    )
    fig.update_layout(
        xaxis_title="Score",
        yaxis=dict(autorange="reversed"),
        template="plotly_dark",
        height=max(380, 80 * len(labels)),
        margin=dict(l=120, r=20, t=40, b=55),
        plot_bgcolor="#121127",
        paper_bgcolor="#121127",
        font=dict(color="#ffffff", family="'Inter', sans-serif"),
    )
    fig.update_xaxes(gridcolor="rgba(128,128,128,0.2)", showgrid=True)
    fig.update_yaxes(gridcolor="rgba(128,128,128,0.2)", showgrid=False)
    return fig
