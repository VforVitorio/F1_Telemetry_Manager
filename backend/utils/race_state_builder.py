"""Build a RaceState from a raw lap_state dict."""

from typing import Any, Dict, List, Optional, Tuple


def _targeting_against_rival(
    lap_state: Dict[str, Any],
    rival: str,
    fallback_gap_s: float,
    fallback_pace_s: float,
) -> Tuple[float, float]:
    """Gap and pace delta of our driver measured against a chosen ``rival``.

    Returns ``(gap_ahead_s, pace_delta_s)`` framed around the rival the user
    picked in the Strategy tab, so the recommendation reasons about the duel the
    user actually asked for instead of about whichever car happens to sit one
    position ahead (#431). Both values land on the RaceState, which feeds N27's
    overtake scoring inputs and the orchestrator's synthesis prompt.

    gap_ahead_s is the absolute on-track interval to the rival, read from the
    rival's ``interval_to_driver_s`` (rival elapsed time minus ours: the sign
    encodes ahead/behind, the magnitude is the gap). This is the same
    driver-relative interval RaceStateManager already emits per rival, mirrored
    onto the /lap-state rivals so both callers carry it.

    pace_delta_s is our last lap time minus the rival's, matching N27's
    convention (negative = we are faster).

    Falls back to the caller-supplied values when the rival is absent from this
    lap (e.g. it crashed out and the liveness filter dropped it, #428/#430) or
    when a lap time is missing, so a stale selection degrades to current
    behaviour rather than to a fabricated zero.
    """
    rivals = lap_state.get("rivals", []) or []
    match = next((r for r in rivals if r.get("driver") == rival), None)
    if match is None:
        return fallback_gap_s, fallback_pace_s

    interval = match.get("interval_to_driver_s")
    gap_ahead_s = abs(float(interval)) if interval is not None else fallback_gap_s

    driver_lap_s = lap_state.get("driver", {}).get("lap_time_s")
    rival_lap_s = match.get("lap_time_s")
    if driver_lap_s and rival_lap_s:
        pace_delta_s = float(driver_lap_s) - float(rival_lap_s)
    else:
        pace_delta_s = fallback_pace_s

    return round(gap_ahead_s, 3), round(pace_delta_s, 3)


def build_race_state(
    lap_state: Dict[str, Any],
    *,
    gap_ahead_s: float = 2.0,
    pace_delta_s: float = 0.0,
    risk_tolerance: float = 0.5,
    radio_msgs: Optional[List[dict]] = None,
    rcm_events: Optional[List[dict]] = None,
    rival: Optional[str] = None,
):
    """Construct a RaceState from a raw lap_state dict.

    Centralises the field extraction logic that was previously duplicated
    in strategy.py (endpoint) and strategy_handler.py (chat handler).

    When ``rival`` is set, ``gap_ahead_s`` and ``pace_delta_s`` are recomputed
    against that specific car (the one the user selected in the Strategy tab)
    rather than the positional car ahead, so the recommendation is framed around
    the duel the user asked about (#431). When it is unset, or the rival is not
    classified on this lap, the caller-supplied values are used unchanged, so the
    no-rival path behaves exactly as before.
    """
    from src.agents.strategy_orchestrator import RaceState

    drv = lap_state.get("driver", {})
    weather = lap_state.get("weather", {})
    meta = lap_state.get("session_meta", {})

    if rival:
        gap_ahead_s, pace_delta_s = _targeting_against_rival(
            lap_state,
            rival,
            gap_ahead_s,
            pace_delta_s,
        )

    # `.get("position", 10)` was a dead default: RaceStateManager (and, since
    # #465, this same API's own get_lap_state) report an unresolved position by
    # keeping the "position" KEY with a None VALUE, and dict.get's default only
    # ever fires when the key itself is MISSING -- so an incomplete/out-lap
    # silently built a RaceState with position=None instead of the intended
    # fallback of 10. RaceState.position is a required, non-optional int
    # (`src/agents/strategy_orchestrator.py`, out of scope for this module), so
    # an unresolved position is surfaced here as an explicit, readable failure
    # instead of a None quietly reaching a field that must never hold one (#465).
    position = drv.get("position")
    if position is None:
        raise ValueError(
            "Cannot build RaceState: driver position is unknown for this lap "
            "(likely an incomplete or out-lap). Choose a different lap."
        )

    return RaceState(
        driver=drv.get("driver", "UNK"),
        lap=lap_state.get("lap_number", 1),
        total_laps=meta.get("total_laps", 57),
        position=position,
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
