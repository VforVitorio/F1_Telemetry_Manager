"""
Chart Builders for Chat Tool Results

Each builder converts the raw JSON payload returned by a Phase 2 MCP
telemetry tool into a Plotly figure ready to be embedded inside a chat
message bubble.  Builders are intentionally Streamlit-free so they can be
unit-tested in isolation and reused outside the chat context.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any, Dict, List, Union

import plotly.graph_objects as go
from plotly.subplots import make_subplots

from components.common.driver_colors import get_driver_color

FigureOrList = Union[go.Figure, List[go.Figure]]


_CHAT_BG = "#181633"
_CHAT_GRID = "rgba(167, 139, 250, 0.12)"
_CHAT_TEXT = "#e5e7eb"
_CHAT_MUTED = "#9ca3af"


def _apply_base_layout(fig: go.Figure, title: str, height: int = 340) -> go.Figure:
    """Apply the dark-purple layout used across chat chart bubbles."""
    fig.update_layout(
        template="plotly_dark",
        title=dict(text=title, x=0.02, xanchor="left", font=dict(size=13, color=_CHAT_TEXT)),
        paper_bgcolor=_CHAT_BG,
        plot_bgcolor=_CHAT_BG,
        height=height,
        margin=dict(l=48, r=24, t=44, b=44),
        font=dict(color=_CHAT_TEXT, size=11),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor="rgba(0,0,0,0)",
            font=dict(size=10),
        ),
        hovermode="x unified",
    )
    fig.update_xaxes(gridcolor=_CHAT_GRID, zerolinecolor=_CHAT_GRID)
    fig.update_yaxes(gridcolor=_CHAT_GRID, zerolinecolor=_CHAT_GRID)
    return fig


# ---------------------------------------------------------------------------
# 1. get_lap_times
# ---------------------------------------------------------------------------

def build_lap_times_figure(data: Dict[str, Any]) -> go.Figure:
    """Line chart of lap time vs lap number, one trace per driver."""
    lap_records: List[Dict[str, Any]] = data.get("lap_times", [])
    if not lap_records:
        return _empty_figure("No lap time data available")

    by_driver: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in lap_records:
        code = str(rec.get("driver", "?")).upper()
        by_driver[code].append(rec)

    fig = go.Figure()
    for driver, rows in by_driver.items():
        rows_sorted = sorted(rows, key=lambda r: r.get("lap_number", 0))
        laps = [r.get("lap_number") for r in rows_sorted]
        times = [r.get("lap_time") for r in rows_sorted]
        valid = [r.get("is_valid", True) for r in rows_sorted]
        color = get_driver_color(driver)
        marker_line = dict(width=1, color=color)
        marker_colors = [color if v else _CHAT_BG for v in valid]

        fig.add_trace(go.Scatter(
            x=laps,
            y=times,
            mode="lines+markers",
            name=driver,
            line=dict(color=color, width=2),
            marker=dict(size=6, color=marker_colors, line=marker_line),
            hovertemplate="Lap %{x}<br>%{y:.3f}s<extra>" + driver + "</extra>",
        ))

    _apply_base_layout(fig, "Lap times")
    fig.update_xaxes(title_text="Lap")
    fig.update_yaxes(title_text="Lap time (s)")
    return fig


# ---------------------------------------------------------------------------
# 2. get_telemetry
# ---------------------------------------------------------------------------

def build_telemetry_figure(data: Dict[str, Any]) -> go.Figure:
    """Multi-panel telemetry (speed / throttle / brake) vs distance."""
    distance = data.get("distance", [])
    if not distance:
        return _empty_figure("No telemetry data available")

    driver = str(data.get("driver", "?")).upper()
    lap = data.get("lap_number", "?")
    color = get_driver_color(driver)

    fig = make_subplots(
        rows=3, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.06,
        subplot_titles=("Speed (km/h)", "Throttle (%)", "Brake (%)"),
    )

    fig.add_trace(go.Scatter(
        x=distance, y=data.get("speed", []),
        mode="lines", line=dict(color=color, width=1.8),
        name="Speed", showlegend=False,
        hovertemplate="%{x:.0f} m<br>%{y:.1f} km/h<extra></extra>",
    ), row=1, col=1)

    fig.add_trace(go.Scatter(
        x=distance, y=data.get("throttle", []),
        mode="lines", line=dict(color="#10b981", width=1.4),
        fill="tozeroy", fillcolor="rgba(16, 185, 129, 0.2)",
        name="Throttle", showlegend=False,
        hovertemplate="%{x:.0f} m<br>%{y:.0f}%<extra></extra>",
    ), row=2, col=1)

    fig.add_trace(go.Scatter(
        x=distance, y=data.get("brake", []),
        mode="lines", line=dict(color="#ef4444", width=1.4),
        fill="tozeroy", fillcolor="rgba(239, 68, 68, 0.25)",
        name="Brake", showlegend=False,
        hovertemplate="%{x:.0f} m<br>%{y:.0f}%<extra></extra>",
    ), row=3, col=1)

    _apply_base_layout(fig, f"{driver} — lap {lap} telemetry", height=460)
    fig.update_xaxes(title_text="Distance (m)", row=3, col=1)
    for row in (1, 2, 3):
        fig.update_xaxes(gridcolor=_CHAT_GRID, row=row, col=1)
        fig.update_yaxes(gridcolor=_CHAT_GRID, row=row, col=1)
    # Subplot titles are tiny annotations — recolor them to match theme.
    for ann in fig.layout.annotations:
        ann.font = dict(size=11, color=_CHAT_MUTED)
    return fig


# ---------------------------------------------------------------------------
# 3. compare_drivers
# ---------------------------------------------------------------------------

def build_compare_drivers_figure(data: Dict[str, Any]) -> go.Figure:
    """Speed overlay + delta curve for a two-driver comparison."""
    p1 = data.get("pilot1", {})
    p2 = data.get("pilot2", {})
    if not p1 or not p2:
        return _empty_figure("Comparison payload incomplete")

    name1 = p1.get("name", "Driver 1")
    name2 = p2.get("name", "Driver 2")
    c1 = p1.get("color") or get_driver_color(name1)
    c2 = p2.get("color") or get_driver_color(name2)

    lap_time_1 = p1.get("lap_time")
    lap_time_2 = p2.get("lap_time")
    lt1 = f"{lap_time_1:.3f}s" if isinstance(lap_time_1, (int, float)) else "—"
    lt2 = f"{lap_time_2:.3f}s" if isinstance(lap_time_2, (int, float)) else "—"
    header = f"{name1} {lt1} vs {name2} {lt2}"

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.08,
        row_heights=[0.62, 0.38],
        subplot_titles=("Speed", "Delta (s)"),
    )

    fig.add_trace(go.Scatter(
        x=p1.get("distance", []), y=p1.get("speed", []),
        mode="lines", line=dict(color=c1, width=1.8),
        name=name1,
        hovertemplate="%{x:.0f} m<br>%{y:.1f} km/h<extra>" + name1 + "</extra>",
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=p2.get("distance", []), y=p2.get("speed", []),
        mode="lines", line=dict(color=c2, width=1.8),
        name=name2,
        hovertemplate="%{x:.0f} m<br>%{y:.1f} km/h<extra>" + name2 + "</extra>",
    ), row=1, col=1)

    delta = data.get("delta", []) or []
    # Align delta x-axis with pilot1 distance (same length as telemetry).
    delta_x = p1.get("distance", list(range(len(delta))))[: len(delta)]
    fig.add_trace(go.Scatter(
        x=delta_x, y=delta,
        mode="lines", line=dict(color="#a78bfa", width=1.6),
        name=f"{name1} − {name2}",
        fill="tozeroy", fillcolor="rgba(167, 139, 250, 0.15)",
        hovertemplate="%{x:.0f} m<br>Δ %{y:+.3f}s<extra></extra>",
        showlegend=False,
    ), row=2, col=1)
    fig.add_hline(y=0, line=dict(color=_CHAT_MUTED, width=1, dash="dot"), row=2, col=1)

    _apply_base_layout(fig, header, height=460)
    fig.update_xaxes(title_text="Distance (m)", row=2, col=1)
    fig.update_yaxes(title_text="km/h", row=1, col=1)
    fig.update_yaxes(title_text=f"{name1} − {name2}", row=2, col=1)
    for row in (1, 2):
        fig.update_xaxes(gridcolor=_CHAT_GRID, row=row, col=1)
        fig.update_yaxes(gridcolor=_CHAT_GRID, row=row, col=1)
    for ann in fig.layout.annotations:
        ann.font = dict(size=11, color=_CHAT_MUTED)
    return fig


# ---------------------------------------------------------------------------
# 4. get_race_data
# ---------------------------------------------------------------------------

def build_race_data_figure(data: Dict[str, Any]) -> List[go.Figure]:
    """Return two independent figures: positions and lap times.

    Rendering each chart separately instead of stacking them in subplots
    avoids the cramped lap-time panel when 10+ drivers share the same
    bubble.  Pit-lap outliers are masked as None — a single slow lap
    distorts the y-axis for the whole race otherwise.
    """
    records: List[Dict[str, Any]] = data.get("race_data", [])
    if not records:
        return [_empty_figure("No race data available")]

    by_driver: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in records:
        code = str(rec.get("Driver", "?")).upper()
        by_driver[code].append(rec)

    positions_fig = go.Figure()
    lap_times_fig = go.Figure()

    for driver, rows in by_driver.items():
        rows_sorted = sorted(rows, key=lambda r: r.get("LapNumber", 0))
        laps = [r.get("LapNumber") for r in rows_sorted]
        positions = [r.get("Position") for r in rows_sorted]
        lap_times_raw = [r.get("LapTime_s") for r in rows_sorted]
        lap_times = _mask_pit_lap_outliers(lap_times_raw)
        color = get_driver_color(driver)

        positions_fig.add_trace(go.Scatter(
            x=laps, y=positions,
            mode="lines+markers",
            line=dict(color=color, width=2),
            marker=dict(size=5),
            name=driver,
            hovertemplate="Lap %{x}<br>P%{y}<extra>" + driver + "</extra>",
        ))

        lap_times_fig.add_trace(go.Scatter(
            x=laps, y=lap_times,
            mode="lines+markers",
            line=dict(color=color, width=1.6),
            marker=dict(size=4),
            name=driver,
            hovertemplate="Lap %{x}<br>%{y:.3f}s<extra>" + driver + "</extra>",
        ))

    _apply_base_layout(positions_fig, "Race positions", height=340)
    positions_fig.update_xaxes(title_text="Lap")
    positions_fig.update_yaxes(title_text="Position", autorange="reversed")

    _apply_base_layout(lap_times_fig, "Lap times (pit laps masked)", height=340)
    lap_times_fig.update_xaxes(title_text="Lap")
    lap_times_fig.update_yaxes(title_text="Lap time (s)")

    return [positions_fig, lap_times_fig]


def _mask_pit_lap_outliers(
    lap_times: List[Any],
    threshold_ratio: float = 1.15,
) -> List[Any]:
    """Replace pit-lap spikes with None so Plotly draws a gap.

    A pit lap is ~20s slower than a racing lap and distorts the y-axis
    of the whole chart.  Any lap whose time exceeds the driver's median
    by more than *threshold_ratio* is treated as non-racing and masked.
    """
    valid = [t for t in lap_times if isinstance(t, (int, float))]
    if len(valid) < 3:
        return lap_times

    ref = median(valid)
    cutoff = ref * threshold_ratio
    return [
        None if isinstance(t, (int, float)) and t > cutoff else t
        for t in lap_times
    ]


# ---------------------------------------------------------------------------
# Dispatcher + helpers
# ---------------------------------------------------------------------------

_BUILDERS = {
    "get_lap_times": build_lap_times_figure,
    "get_telemetry": build_telemetry_figure,
    "compare_drivers": build_compare_drivers_figure,
    "get_race_data": build_race_data_figure,
}


def build_figure(tool_name: str, data: Dict[str, Any]) -> FigureOrList | None:
    """Return a Plotly figure (or list) for the given tool, or None if unsupported."""
    builder = _BUILDERS.get(tool_name)
    if builder is None:
        return None
    return builder(data)


def _empty_figure(message: str) -> go.Figure:
    """Placeholder figure used when the payload is empty or malformed."""
    fig = go.Figure()
    fig.add_annotation(
        text=message,
        xref="paper", yref="paper",
        x=0.5, y=0.5, showarrow=False,
        font=dict(color=_CHAT_MUTED, size=12),
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=_CHAT_BG,
        plot_bgcolor=_CHAT_BG,
        height=220,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
    )
    return fig
