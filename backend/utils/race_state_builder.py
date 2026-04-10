"""Build a RaceState from a raw lap_state dict."""

from typing import Any, Dict, List, Optional


def build_race_state(
    lap_state: Dict[str, Any],
    *,
    gap_ahead_s: float = 2.0,
    pace_delta_s: float = 0.0,
    risk_tolerance: float = 0.5,
    radio_msgs: Optional[List[dict]] = None,
    rcm_events: Optional[List[dict]] = None,
):
    """Construct a RaceState from a raw lap_state dict.

    Centralises the field extraction logic that was previously duplicated
    in strategy.py (endpoint) and strategy_handler.py (chat handler).
    """
    from src.agents.strategy_orchestrator import RaceState

    drv = lap_state.get("driver", {})
    weather = lap_state.get("weather", {})
    meta = lap_state.get("session_meta", {})

    return RaceState(
        driver=drv.get("driver", "UNK"),
        lap=lap_state.get("lap_number", 1),
        total_laps=meta.get("total_laps", 57),
        position=drv.get("position", 10),
        compound=drv.get("compound", "MEDIUM"),
        tyre_life=drv.get("tyre_life", 1),
        gap_ahead_s=float(gap_ahead_s),
        pace_delta_s=float(pace_delta_s),
        air_temp=float(weather.get("air_temp", 25.0)),
        track_temp=float(weather.get("track_temp", 35.0)),
        rainfall=bool(weather.get("rainfall", False)),
        radio_msgs=radio_msgs or [],
        rcm_events=rcm_events or [],
        risk_tolerance=float(risk_tolerance),
    )
