"""Strategic guard-rails for the no-LLM path of the simulation generator.

These constants and the ``apply_guard_rails`` helper are a verbatim duplicate
of the guard-rail block at ``scripts/run_simulation_cli.py`` L1504-L1535. The
CLI is the TFG's product PMV and is intentionally not refactored, so both
copies must be kept in sync by hand. If you change a rule here, mirror it in
the CLI (or vice versa). A divergence silently changes strategy decisions,
which defeats the paired-path design.

The rules mirror the LLM-mode prompt-level guard-rails enforced by the
orchestrator in ``src/agents/strategy_orchestrator.py``:

1. No pit action before lap 5 — tyres cannot realistically degrade in 1-4 laps.
2. No pit action in the last 3 laps unless the tyre cliff is imminent
   (laps_to_cliff_p10 < 2) — pit cost (~22s) dwarfs the tyre gain (~1.5s).
3. Minimum stint length per compound — SOFT 8, MEDIUM 12, HARD 15 — to avoid
   throwing away fresh rubber on a premature stop.
"""

from typing import Optional

PIT_ACTIONS = frozenset({"PIT_NOW", "UNDERCUT", "OVERCUT", "REACTIVE_SC"})
NO_PIT_BEFORE_LAP = 5
NO_PIT_LAST_N_LAPS = 3
CLIFF_P10_SAFE = 2  # laps_to_cliff_p10 >= this means the late-race pit is wasted
MIN_STINT_LAPS = {"SOFT": 8, "MEDIUM": 12, "HARD": 15}
DEFAULT_MIN_STINT = 10  # fallback for unknown compounds (INT, WET, UNKNOWN)


def apply_guard_rails(
    action: str,
    lap: int,
    total_laps: int,
    compound: str,
    tyre_life: int,
    cliff_p10: float = 99.0,
) -> tuple[str, Optional[str]]:
    """Override ``action`` with ``STAY_OUT`` when a hard constraint fires.

    ``cliff_p10`` is the P10 estimate of remaining laps before the tyre cliff
    from the N26 tire agent; a large sentinel (99.0) is used when the agent
    output is unavailable so the late-race rule still enforces a safe default.

    Returns a ``(action, reason)`` tuple. ``reason`` is ``None`` when no rail
    fired; otherwise it is the human-readable explanation the caller puts in
    the lap-decision reasoning field for telemetry and Arcade debug panels.
    """
    if action not in PIT_ACTIONS:
        return action, None

    remaining_laps = total_laps - lap

    if lap < NO_PIT_BEFORE_LAP:
        return "STAY_OUT", f"guard-rail: pit window not open (lap < {NO_PIT_BEFORE_LAP})"

    if remaining_laps <= NO_PIT_LAST_N_LAPS and cliff_p10 >= CLIFF_P10_SAFE:
        return "STAY_OUT", f"guard-rail: too late to pit (\u2264{NO_PIT_LAST_N_LAPS} laps left)"

    min_life = MIN_STINT_LAPS.get(compound, DEFAULT_MIN_STINT)
    if tyre_life < min_life:
        return (
            "STAY_OUT",
            f"guard-rail: minimum stint not reached ({compound} {tyre_life}/{min_life} laps)",
        )

    return action, None
