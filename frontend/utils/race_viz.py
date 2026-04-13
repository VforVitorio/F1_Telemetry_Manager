"""
Race Visualization Utilities

Pure Plotly chart functions ported from legacy/app_streamlit_v1/utils/visualization.py.
Every function returns a go.Figure or None — no Streamlit calls.
All charts use the same dark theme as the Dashboard telemetry graphs.
"""

from typing import Optional

import plotly.graph_objects as go
from plotly.subplots import make_subplots

# ---- Constants ----------------------------------------------------------------

COMPOUND_COLORS = {1: "#ef4444", 2: "#eab308", 3: "#9ca3af", 4: "#22c55e", 5: "#3b82f6"}
COMPOUND_NAMES = {1: "Soft", 2: "Medium", 3: "Hard", 4: "Intermediate", 5: "Wet"}
# Compound dash styles — used when driver_colors is provided to distinguish compounds
COMPOUND_DASHES = {1: "solid", 2: "dash", 3: "dot", 4: "dashdot", 5: "longdash"}
LAP_TIME_IMPROVEMENT_PER_LAP = 0.055
MAX_LAPS = 66

# ---- Theme (matches Dashboard telemetry charts) -------------------------------

_PRIMARY_BG = "#121127"
_GRID_COLOR = "rgba(128, 128, 128, 0.2)"
_FONT_COLOR = "#ffffff"
_CHART_HEIGHT = 450


def _base_layout(**overrides) -> dict:
    """Return the standard layout dict for all race-analysis charts."""
    defaults = dict(
        template="plotly_dark",
        height=_CHART_HEIGHT,
        margin=dict(l=40, r=40, t=40, b=55),
        plot_bgcolor=_PRIMARY_BG,
        paper_bgcolor=_PRIMARY_BG,
        font=dict(color=_FONT_COLOR, family="'Inter', sans-serif"),
        hovermode="x unified",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(size=11),
        ),
    )
    defaults.update(overrides)
    return defaults


def _styled_axes(fig: go.Figure) -> None:
    """Apply consistent axis styling to a figure."""
    fig.update_xaxes(
        gridcolor=_GRID_COLOR,
        showgrid=True,
        title_font=dict(size=13),
        tickfont=dict(size=11),
    )
    fig.update_yaxes(
        gridcolor=_GRID_COLOR,
        showgrid=True,
        title_font=dict(size=13),
        tickfont=dict(size=11),
    )


# ---- Chart functions ----------------------------------------------------------


def st_plot_speed_vs_tire_age(
    processed_race_data,
    driver_number=None,
    compound_id=None,
) -> Optional[go.Figure]:
    """Speed vs tyre age for a given compound, split by speed-trap sector."""
    filtered = processed_race_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if compound_id is None:
        counts = filtered["CompoundID"].value_counts()
        compound_id = counts.index[0] if not counts.empty else 2
    filtered = filtered[filtered["CompoundID"] == compound_id]
    if filtered.empty:
        return None

    compound_color = COMPOUND_COLORS.get(compound_id, "#a78bfa")
    speed_cols = [c for c in ("SpeedI1", "SpeedI2", "SpeedFL") if c in filtered.columns]
    col_labels = {"SpeedI1": "Sector 1", "SpeedI2": "Sector 2", "SpeedFL": "Finish line"}
    col_dashes = {"SpeedI1": "solid", "SpeedI2": "dash", "SpeedFL": "dot"}

    fig = go.Figure()
    for col in speed_cols:
        fig.add_trace(
            go.Scatter(
                x=filtered["TyreAge"],
                y=filtered[col],
                mode="lines+markers",
                name=col_labels.get(col, col),
                line=dict(width=2, color=compound_color, dash=col_dashes.get(col, "solid")),
                marker=dict(size=4),
                hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Speed: %{y:.1f} km/h<extra></extra>",
            )
        )

    if not fig.data:
        return None

    fig.update_layout(**_base_layout(
        xaxis_title="Tyre age (laps)",
        yaxis_title="Speed (km/h)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_regular_vs_adjusted_degradation(
    tire_deg_data,
    compound_names=None,
    compound_colors=None,
    lap_time_improvement_per_lap: float = LAP_TIME_IMPROVEMENT_PER_LAP,
) -> Optional[go.Figure]:
    """Regular vs fuel-adjusted degradation subplots, one per compound."""
    if compound_names is None:
        compound_names = {1: "Soft", 2: "Medium", 3: "Hard"}
    if compound_colors is None:
        compound_colors = {1: "red", 2: "yellow", 3: "gray"}

    compound_ids = tire_deg_data["CompoundID"].unique()
    n = len(compound_ids)
    if n == 0:
        return None

    fig = make_subplots(
        rows=n,
        cols=1,
        shared_xaxes=False,
        subplot_titles=[
            f"{compound_names.get(cid, f'Compound {cid}')} — regular vs fuel-adjusted"
            for cid in compound_ids
        ],
    )

    for i, cid in enumerate(compound_ids):
        subset = tire_deg_data[tire_deg_data["CompoundID"] == cid]
        color = compound_colors.get(cid, "white")
        name = compound_names.get(cid, f"Unknown ({cid})")
        row = i + 1

        reg = subset.groupby("TyreAge")["DegradationRate"].mean()
        adj = subset.groupby("TyreAge")["FuelAdjustedDegAbsolute"].mean()

        # Regular (dashed)
        fig.add_trace(
            go.Scatter(
                x=reg.index,
                y=reg.values,
                mode="lines+markers",
                name=f"{name} (Regular)",
                line=dict(color=color, dash="dash", width=2),
                marker=dict(symbol="circle", color=color, opacity=0.5),
            ),
            row=row,
            col=1,
        )
        # Fuel-adjusted (solid)
        fig.add_trace(
            go.Scatter(
                x=adj.index,
                y=adj.values,
                mode="lines+markers",
                name=f"{name} (Fuel Adjusted)",
                line=dict(color=color, dash="solid", width=3),
                marker=dict(symbol="circle", color=color),
            ),
            row=row,
            col=1,
        )
        # Zero reference line
        fig.add_shape(
            type="line",
            x0=reg.index.min(),
            x1=reg.index.max(),
            y0=0,
            y1=0,
            line=dict(color="gray", dash="dot"),
            row=row,
            col=1,
        )
        # Fuel-effect annotation
        min_lap = reg.index.min() if not reg.empty else 0
        max_lap = reg.index.max() if not reg.empty else 0
        total_fuel = (max_lap - min_lap) * lap_time_improvement_per_lap
        fig.add_annotation(
            text=f"Est. fuel effect: ~{total_fuel:.2f}s",
            xref=f"x{row}",
            yref=f"y{row}",
            x=min_lap,
            y=reg.values.min() if not reg.empty else 0,
            showarrow=False,
            font=dict(size=11, color=_FONT_COLOR),
            bgcolor="rgba(24,22,51,0.85)",
            bordercolor="rgba(167,139,250,0.4)",
            borderwidth=1,
            borderpad=4,
            row=row,
            col=1,
        )

    fig.update_layout(**_base_layout(
        height=350 * n,
        showlegend=True,
        margin=dict(t=60, b=40, l=40, r=40),
    ))
    fig.update_xaxes(title_text="Tyre age (laps)")
    fig.update_yaxes(title_text="Degradation (s)")
    _styled_axes(fig)
    return fig


def st_plot_fuel_adjusted_degradation(
    processed_race_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Fuel-adjusted degradation rate.

    When driver_colors is provided and driver_number is None (multi-driver mode),
    lines are colored by driver team color and compound is shown via dash style.
    driver_code_map maps DriverNumber (int) → driver code (str, e.g. "VER").
    """
    filtered = processed_race_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    if "FuelAdjustedDegAbsolute" not in filtered.columns:
        return None

    fig = go.Figure()

    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        # Group by driver then compound — driver color + compound dash
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num]
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            for cid in sorted(drv_data["CompoundID"].unique()):
                cmp_data = drv_data[drv_data["CompoundID"] == cid]
                cmp_name = COMPOUND_NAMES.get(cid, f"Cmp {cid}")
                fig.add_trace(go.Scatter(
                    x=cmp_data["TyreAge"],
                    y=cmp_data["FuelAdjustedDegAbsolute"],
                    mode="lines+markers",
                    name=f"{drv_label} ({cmp_name})",
                    line=dict(color=drv_color, width=2, dash=COMPOUND_DASHES.get(cid, "solid")),
                    marker=dict(size=4),
                    hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Deg: %{y:.3f} s/lap<extra></extra>",
                ))
    else:
        for cid in sorted(filtered["CompoundID"].unique()):
            name = COMPOUND_NAMES.get(cid, f"Unknown ({cid})")
            data = filtered[filtered["CompoundID"] == cid]
            fig.add_trace(go.Scatter(
                x=data["TyreAge"],
                y=data["FuelAdjustedDegAbsolute"],
                mode="lines+markers",
                name=name,
                line=dict(color=COMPOUND_COLORS.get(cid, "#a78bfa"), width=2),
                marker=dict(size=4),
                hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Deg: %{y:.3f} s/lap<extra></extra>",
            ))

    fig.update_layout(**_base_layout(
        xaxis_title="Tyre age (laps)",
        yaxis_title="Fuel-adjusted degradation (s/lap)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_fuel_adjusted_percentage_degradation(
    processed_race_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Fuel-adjusted percentage degradation.

    When driver_colors is provided and driver_number is None (multi-driver mode),
    lines are colored by driver team color and compound is shown via dash style.
    driver_code_map maps DriverNumber (int) → driver code (str, e.g. "VER").
    """
    filtered = processed_race_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    if "FuelAdjustedDegPercent" not in filtered.columns:
        return None

    fig = go.Figure()

    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num]
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            for cid in sorted(drv_data["CompoundID"].unique()):
                cmp_data = drv_data[drv_data["CompoundID"] == cid]
                cmp_name = COMPOUND_NAMES.get(cid, f"Cmp {cid}")
                fig.add_trace(go.Scatter(
                    x=cmp_data["TyreAge"],
                    y=cmp_data["FuelAdjustedDegPercent"],
                    mode="lines+markers",
                    name=f"{drv_label} ({cmp_name})",
                    line=dict(color=drv_color, width=2, dash=COMPOUND_DASHES.get(cid, "solid")),
                    marker=dict(size=4),
                    hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Deg: %{y:.2f}%<extra></extra>",
                ))
    else:
        for cid in sorted(filtered["CompoundID"].unique()):
            name = COMPOUND_NAMES.get(cid, f"Unknown ({cid})")
            data = filtered[filtered["CompoundID"] == cid]
            fig.add_trace(go.Scatter(
                x=data["TyreAge"],
                y=data["FuelAdjustedDegPercent"],
                mode="lines+markers",
                name=name,
                line=dict(color=COMPOUND_COLORS.get(cid, "#a78bfa"), width=2),
                marker=dict(size=4),
                hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Deg: %{y:.2f}%<extra></extra>",
            ))

    fig.update_layout(**_base_layout(
        xaxis_title="Tyre age (laps)",
        yaxis_title="Fuel-adjusted percentage degradation (%)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_degradation_rate(
    processed_race_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Raw degradation rate (s/lap).

    When driver_colors is provided and driver_number is None (multi-driver mode),
    lines are colored by driver team color and compound is shown via dash style.
    driver_code_map maps DriverNumber (int) → driver code (str, e.g. "VER").
    """
    filtered = processed_race_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    if "DegradationRate" not in filtered.columns:
        return None

    fig = go.Figure()
    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num]
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            for cid in sorted(drv_data["CompoundID"].unique()):
                cmp_data = drv_data[drv_data["CompoundID"] == cid]
                cmp_name = COMPOUND_NAMES.get(cid, f"Cmp {cid}")
                fig.add_trace(go.Scatter(
                    x=cmp_data["TyreAge"],
                    y=cmp_data["DegradationRate"],
                    mode="lines+markers",
                    name=f"{drv_label} ({cmp_name})",
                    line=dict(color=drv_color, width=2, dash=COMPOUND_DASHES.get(cid, "solid")),
                    marker=dict(size=4),
                    hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Rate: %{y:.3f} s/lap<extra></extra>",
                ))
    else:
        for cid in sorted(filtered["CompoundID"].unique()):
            name = COMPOUND_NAMES.get(cid, f"Unknown ({cid})")
            data = filtered[filtered["CompoundID"] == cid]
            fig.add_trace(go.Scatter(
                x=data["TyreAge"],
                y=data["DegradationRate"],
                mode="lines+markers",
                name=name,
                line=dict(color=COMPOUND_COLORS.get(cid, "#a78bfa"), width=2),
                marker=dict(size=4),
                hovertemplate="<b>%{fullData.name}</b><br>Tyre age: %{x} laps<br>Rate: %{y:.3f} s/lap<extra></extra>",
            ))

    fig.update_layout(**_base_layout(
        xaxis_title="Tyre age (laps)",
        yaxis_title="Degradation rate (s/lap)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_gap_evolution(
    gap_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Gap to car ahead/behind over laps with undercut and DRS reference lines.

    When driver_colors is provided and driver_number is None (multi-driver mode),
    each driver's gap-ahead trace uses their team color. Gap-behind shown dashed.
    driver_code_map maps DriverNumber (int) → driver code (str, e.g. "VER").
    """
    filtered = gap_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None and "DriverNumber" in filtered.columns:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    for col in ("GapToCarAhead", "LapNumber"):
        if col not in filtered.columns:
            return None

    filtered = filtered.sort_values("LapNumber")
    fig = go.Figure()

    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num].sort_values("LapNumber")
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            fig.add_trace(go.Scatter(
                x=drv_data["LapNumber"],
                y=drv_data["GapToCarAhead"],
                mode="lines",
                name=f"{drv_label} — gap ahead",
                line=dict(color=drv_color, width=2),
                hovertemplate=f"<b>{drv_label} gap ahead</b><br>Lap %{{x}}<br>%{{y:.2f}}s<extra></extra>",
            ))
            if "GapToCarBehind" in drv_data.columns:
                fig.add_trace(go.Scatter(
                    x=drv_data["LapNumber"],
                    y=drv_data["GapToCarBehind"],
                    mode="lines",
                    name=f"{drv_label} — gap behind",
                    line=dict(color=drv_color, width=1.5, dash="dash"),
                    hovertemplate=f"<b>{drv_label} gap behind</b><br>Lap %{{x}}<br>%{{y:.2f}}s<extra></extra>",
                ))
    else:
        fig.add_trace(go.Scatter(
            x=filtered["LapNumber"],
            y=filtered["GapToCarAhead"],
            mode="lines",
            name="Gap ahead",
            line=dict(color="#3b82f6", width=2),
            hovertemplate="<b>Gap ahead</b><br>Lap %{x}<br>%{y:.2f}s<extra></extra>",
        ))
        if "GapToCarBehind" in filtered.columns:
            fig.add_trace(go.Scatter(
                x=filtered["LapNumber"],
                y=filtered["GapToCarBehind"],
                mode="lines",
                name="Gap behind",
                line=dict(color="#ef4444", width=2),
                hovertemplate="<b>Gap behind</b><br>Lap %{x}<br>%{y:.2f}s<extra></extra>",
            ))

    # Reference lines (always shown)
    all_laps = filtered["LapNumber"].tolist()
    if all_laps:
        fig.add_trace(go.Scatter(
            x=all_laps, y=[2.0] * len(all_laps),
            mode="lines", name="Undercut window (2.0s)",
            line=dict(color="#22c55e", dash="dash", width=1),
        ))
        fig.add_trace(go.Scatter(
            x=all_laps, y=[1.0] * len(all_laps),
            mode="lines", name="DRS window (1.0s)",
            line=dict(color="#eab308", dash="dash", width=1),
        ))

    fig.update_layout(**_base_layout(
        xaxis_title="Lap",
        yaxis_title="Gap (s)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_undercut_opportunities(
    gap_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Coloured zones showing undercut / overcut / no-strategy windows."""
    filtered = gap_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None and "DriverNumber" in filtered.columns:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    for col in ("GapToCarAhead", "LapNumber"):
        if col not in filtered.columns:
            return None

    filtered = filtered.sort_values("LapNumber")
    laps = filtered["LapNumber"]
    gap_all = filtered["GapToCarAhead"]
    y_max = gap_all.max() + 1

    fig = go.Figure()
    # Zone fills (always shown — bottom → top)
    fig.add_trace(go.Scatter(
        x=laps, y=[0] * len(filtered),
        mode="lines", line=dict(width=0), showlegend=False,
    ))
    fig.add_trace(go.Scatter(
        x=laps, y=[2.0] * len(filtered),
        fill="tonexty", mode="lines",
        line=dict(color="#22c55e", dash="dash", width=1),
        fillcolor="rgba(34,197,94,0.12)",
        name="Undercut zone (<2.0s)",
    ))
    fig.add_trace(go.Scatter(
        x=laps, y=[3.5] * len(filtered),
        fill="tonexty", mode="lines",
        line=dict(color="#ef4444", dash="dash", width=1),
        fillcolor="rgba(234,179,8,0.10)",
        name="Overcut zone (2.0–3.5s)",
    ))
    fig.add_trace(go.Scatter(
        x=laps, y=[y_max] * len(filtered),
        fill="tonexty", mode="none",
        fillcolor="rgba(239,68,68,0.08)",
        name="No strategy zone (>3.5s)",
    ))

    # Gap traces on top — colored by driver if multi-driver mode
    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num].sort_values("LapNumber")
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            fig.add_trace(go.Scatter(
                x=drv_data["LapNumber"],
                y=drv_data["GapToCarAhead"],
                mode="lines",
                name=f"{drv_label} gap ahead",
                line=dict(color=drv_color, width=2),
                hovertemplate=f"<b>{drv_label}</b><br>Lap %{{x}}<br>%{{y:.2f}}s<extra></extra>",
            ))
    else:
        fig.add_trace(go.Scatter(
            x=laps, y=gap_all,
            mode="lines",
            name="Gap ahead",
            line=dict(color="#3b82f6", width=2),
            hovertemplate="<b>Gap ahead</b><br>Lap %{x}<br>%{y:.2f}s<extra></extra>",
        ))

    fig.update_layout(**_base_layout(
        xaxis_title="Lap",
        yaxis_title="Gap ahead (s)",
    ))
    _styled_axes(fig)
    return fig


def st_plot_gap_consistency(
    gap_data,
    driver_number=None,
    driver_colors: Optional[dict] = None,
    driver_code_map: Optional[dict] = None,
) -> Optional[go.Figure]:
    """Bar chart of consecutive laps in the same gap window (ahead/behind)."""
    filtered = gap_data.copy()
    if "LapNumber" in filtered.columns:
        filtered = filtered[
            (filtered["LapNumber"] >= 1) & (filtered["LapNumber"] <= MAX_LAPS)
        ]
    if driver_number is not None and "DriverNumber" in filtered.columns:
        filtered = filtered[filtered["DriverNumber"] == driver_number]
    if filtered.empty:
        return None

    for col in ("LapNumber", "consistent_gap_ahead_laps", "consistent_gap_behind_laps"):
        if col not in filtered.columns:
            return None

    filtered = filtered.sort_values("LapNumber")
    fig = go.Figure()

    multi_driver = driver_colors and driver_number is None and "DriverNumber" in filtered.columns
    if multi_driver:
        for drv_num in sorted(filtered["DriverNumber"].unique()):
            drv_data = filtered[filtered["DriverNumber"] == drv_num].sort_values("LapNumber")
            drv_color = driver_colors.get(drv_num, "#a78bfa")
            drv_label = driver_code_map.get(drv_num, str(drv_num)) if driver_code_map else str(drv_num)
            fig.add_trace(go.Bar(
                x=drv_data["LapNumber"],
                y=drv_data["consistent_gap_ahead_laps"],
                name=f"{drv_label} — gap ahead",
                marker_color=drv_color,
                hovertemplate=f"<b>{drv_label}</b><br>Lap %{{x}}<br>%{{y}} consecutive laps<extra></extra>",
            ))
    else:
        fig.add_trace(go.Bar(
            x=filtered["LapNumber"],
            y=filtered["consistent_gap_ahead_laps"],
            name="Consistent laps ahead",
            marker_color="#3b82f6",
            hovertemplate="Lap %{x}<br>%{y} consecutive laps<extra></extra>",
        ))
        fig.add_trace(go.Bar(
            x=filtered["LapNumber"],
            y=filtered["consistent_gap_behind_laps"],
            name="Consistent laps behind",
            marker_color="#ef4444",
            hovertemplate="Lap %{x}<br>%{y} consecutive laps<extra></extra>",
        ))

    fig.add_hline(
        y=3,
        line_dash="dash",
        line_color="#22c55e",
        annotation_text="Strategic threshold (3 laps)",
        annotation_font_color="#22c55e",
    )

    fig.update_layout(**_base_layout(
        xaxis_title="Lap",
        yaxis_title="Consecutive laps",
        barmode="group",
        bargap=0.15,
    ))
    _styled_axes(fig)
    return fig
