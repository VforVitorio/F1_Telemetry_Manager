"""Lap-by-lap race simulation generator for the SSE backend endpoint.

This module expresses the lap decision loop as a ``Generator[dict]`` so the backend
can stream ``start``, ``lap``, ``error`` and ``summary`` events to any SSE consumer
(``curl``, Arcade, future dashboards).

**It no longer carries its own copy of the decision logic.** ``_run_no_llm_path``
delegates to the shared engine (``src.strategy.inference.engine.run_lap``, ``no-llm``
profile) and only adapts the result into the dict shape the SSE event builder expects.

It used to be a hand-synced duplicate of the CLI's ``_run_no_llm`` body, alongside a
``guard_rails`` module duplicating the CLI's guard-rail block, both carrying "keep
these in sync by hand" breadcrumbs. They drifted, exactly as #166 proved they would:
the copy unpacked two values from a three-value helper (so every routed lap raised,
and N28/N30 were paid for and then discarded), it dropped the ``sc_currently_active``
routing argument, and its fallback stubs invented readings when a provider was
unreachable. Deleting the copy is what makes this surface inherit engine fixes
instead of missing every one of them.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Repo-root injection \u2014 ``src.agents.*`` imports must work even when this
# module is loaded standalone (smoke tests, MCP tools) without the FastAPI
# startup path having injected ``_REPO_ROOT`` first.
# ---------------------------------------------------------------------------
from backend.core.paths import get_data_root, get_repo_root

_REPO_ROOT = get_repo_root()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.utils.race_state_builder import build_race_state  # noqa: E402
from src.agents.strategy_orchestrator import (  # noqa: E402
    RaceState,
    run_strategy_orchestrator_from_state,
)
from src.simulation.replay_engine import RaceReplayEngine  # noqa: E402

logger = logging.getLogger(__name__)

ACTION_LITERALS = ("STAY_OUT", "PIT_NOW", "UNDERCUT", "OVERCUT", "ALERT", "DNF", "ERROR")


# ---------------------------------------------------------------------------
# Configuration + event schemas
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class SimConfig:
    """Inputs required to drive one simulation run end-to-end.

    ``driver2`` is an optional rival code the caller wants tracked explicitly
    in the gap stats of the final summary — independent of the generic
    ``rivals`` list that the state manager already emits per lap.

    ``interval_s`` is the artificial pause between ``lap`` events. The CLI
    uses this to give Rich panels enough wall-clock time to render; for SSE
    it is useful to demo Arcade's animation without running the race in
    real-time. Zero means batch as fast as the CPU allows.
    """

    year: int
    gp: str
    driver: str
    team: str
    driver2: Optional[str] = None
    lap_range: Optional[tuple[int, int]] = None
    risk_tolerance: float = 0.5
    no_llm: bool = False
    provider: str = "lmstudio"
    interval_s: float = 0.0


class StartEvent(BaseModel):
    """First event of the stream — lets the consumer lock the layout before
    any lap arrives. ``total_laps`` is authoritative (from metadata), while
    ``lap_start`` / ``lap_end`` reflect the effective window after applying
    ``lap_range`` if provided."""

    model_config = ConfigDict(extra="forbid")

    gp: str
    year: int
    driver: str
    driver2: Optional[str] = None
    team: str
    lap_start: int
    lap_end: int
    total_laps: int
    no_llm: bool
    provider: str
    timestamp: str


class LapDecision(BaseModel):
    """Per-lap decision payload \u2014 the contract Arcade (and curl probes) rely on.

    Fields mirror what the CLI's detail panel shows plus the strategic planning
    columns added for the orchestrator v2 schema. Optional fields stay ``None``
    for the no-LLM path where pace mode, risk posture and multi-lap planning
    are not produced.
    """

    model_config = ConfigDict(extra="forbid")

    lap_number: int
    compound: str
    tyre_life: int
    position: int
    lap_time_s: Optional[float]
    gap_ahead_s: float
    action: str
    confidence: float
    reasoning: str
    scenario_scores: dict[str, float] = Field(default_factory=dict)
    pace_mode: Optional[str] = None
    risk_posture: Optional[str] = None
    pit_lap_target: Optional[int] = None
    compound_next: Optional[str] = None
    undercut_target: Optional[str] = None
    agent_alerts: list[str] = Field(default_factory=list)
    guardrail_reason: Optional[str] = None


class ErrorEvent(BaseModel):
    """Emitted in place of a ``lap`` when a single lap blows up. The stream
    does not stop — subsequent laps keep flowing so the consumer can show a
    partial race instead of a hard failure."""

    model_config = ConfigDict(extra="forbid")

    lap: int
    message: str


class RunSummary(BaseModel):
    """Post-run aggregates \u2014 the six blocks the CLI prints plus five extras
    from the Streamlit post-run backlog that Arcade's final panel will reuse.

    ``mc_confidence_series`` is the lap-indexed list of confidences (0 for
    no-LLM, orchestrator confidence for LLM). ``reasoning_tokens`` is a
    coarse top-N token frequency over the concatenated reasoning strings,
    intended as a cheap keyword cloud (no tokenisation beyond whitespace).
    """

    model_config = ConfigDict(extra="forbid")

    status: dict[str, int]
    positions: dict[str, int]
    actions: dict[str, int]
    agents_fired: dict[str, Any]
    stint: dict[str, Any]
    timing: dict[str, float]
    gap_ahead: dict[str, float]
    mc_confidence_series: list[float]
    best_decision: dict[str, Any]
    worst_decision: dict[str, Any]
    time_compression: float
    reasoning_tokens: dict[str, int]


# ---------------------------------------------------------------------------
# Path / environment helpers
# ---------------------------------------------------------------------------


def _set_provider_env(provider: str) -> None:
    """Propagate the LLM provider choice to the orchestrator singleton.

    The orchestrator reads ``F1_LLM_PROVIDER`` the first time it builds its
    structured-output client (see ``strategy_orchestrator._get_orchestrator_llm``),
    so setting it here before any agent call is enough. This is a process-wide
    side effect \u2014 callers running multiple providers concurrently need their
    own process isolation.
    """
    os.environ["F1_LLM_PROVIDER"] = provider


def _data_root() -> Path:
    """Return the data root used by the CLI and every backend component.

    Routes through the shared resolver (``backend.core.paths.get_data_root``),
    which honours ``$F1_STRAT_DATA_ROOT`` and walks for a ``.git`` *directory*
    so the ``src/telemetry`` submodule gitlink no longer misresolves it (#27).
    """
    return get_data_root()


_laps_df_cache: dict[int, pd.DataFrame] = {}


def _load_laps_df(year: int) -> pd.DataFrame:
    """Load (and memoise) the featured laps parquet for ``year``.

    Kept as a small module-local cache (with raise-on-missing semantics the
    simulator relies on) rather than importing ``backend.utils.laps_cache``.
    """
    if year in _laps_df_cache:
        return _laps_df_cache[year]
    path = _data_root() / "processed" / f"laps_featured_{year}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"Featured laps parquet not found: {path}. "
            "Run the build pipeline or populate data/processed/."
        )
    df = pd.read_parquet(path)
    _laps_df_cache[year] = df
    return df


def _resolve_race_dir(year: int, gp: str) -> Path:
    """Locate the per-race folder that ``RaceReplayEngine`` consumes."""
    return _data_root() / "raw" / str(year) / gp


def _compute_gap_ahead(lap_state: dict[str, Any]) -> float:
    """Gap in seconds to the car directly ahead of our driver, or 0 if none.

    Mirrors the CLI's derivation at ``scripts/run_simulation_cli.py`` L1354-1358
    but kept inline here because the two copies are short and intentionally
    decoupled.
    """
    driver_st = lap_state.get("driver", {})
    rivals = lap_state.get("rivals", [])
    our_pos = driver_st.get("position", 99)
    car_ahead = next((r for r in rivals if r.get("position") == our_pos - 1), None)
    if not car_ahead:
        return 0.0
    return abs(car_ahead.get("interval_to_driver_s") or 0.0)


def _driver2_gap(lap_state: dict[str, Any], driver2: Optional[str]) -> Optional[float]:
    """Interval (s) between our driver and ``driver2`` for gap_ahead stats.

    Positive values mean ``driver2`` is behind us. ``None`` when the rival is
    not present in the lap (DNF, not yet started, different stint length).
    """
    if not driver2:
        return None
    for r in lap_state.get("rivals", []):
        if r.get("driver") == driver2:
            return r.get("interval_to_driver_s")
    return None


# ---------------------------------------------------------------------------
# Race state + decision pipeline
# ---------------------------------------------------------------------------


def _local_build_race_state(
    lap_state: dict[str, Any],
    prev_lap_time: float,
    risk_tolerance: float,
) -> RaceState:
    """Thin wrapper over the shared ``build_race_state`` helper.

    Computes ``gap_ahead_s`` from the rivals list and ``pace_delta_s`` against
    the previous lap's time so downstream agents get realistic inputs (the
    shared helper only handles static ``lap_state`` fields).
    """
    driver_st = lap_state.get("driver", {})
    cur_lap_time = driver_st.get("lap_time_s") or 0.0
    pace_delta = cur_lap_time - prev_lap_time if prev_lap_time else 0.0
    return build_race_state(
        lap_state,
        gap_ahead_s=_compute_gap_ahead(lap_state),
        pace_delta_s=pace_delta,
        risk_tolerance=risk_tolerance,
    )


def _run_no_llm_path(
    race_state: RaceState,
    lap_state: dict[str, Any],
    laps_df: pd.DataFrame,
) -> dict[str, Any]:
    """ML-only decision path — a thin adapter over the shared engine.

    This used to be a hand-maintained copy of the CLI's ``_run_no_llm`` body, and it
    had drifted in three ways that all silently degraded the stream:

    * It unpacked two values from ``_run_conditional_agents``, which returns three. The
      ValueError fired on EVERY routed lap and was swallowed by a bare ``except``, so
      N28 and N30 ran (paying for LLM and Qdrant calls) and their results were thrown
      away. On a path whose whole point is not to use an LLM.
    * It called ``_decide_agents_to_call`` without ``sc_currently_active``, so the SC
      routing added for the Qatar fix never reached this surface.
    * Its ``_safe_call`` stubs substituted invented readings (a 90.0 s lap, a 20-lap
      cliff) when the provider was unreachable and presented them as a decision. The
      engine's no-LLM profile builds no LLM clients at all, so there is nothing to
      degrade from and nothing to invent.

    Delegating means ``/simulate`` finally inherits the engine's fixes instead of
    skipping every one of them: the per-GP scoping, the SC coherence rail, the pit
    sentinels, the fuel baseline. The dict shape is kept because the SSE event builder
    branches on it; only the body is gone.

    Returns the same keys as before, so ``_result_to_decision`` is untouched.
    """
    from src.strategy.inference.engine import run_lap

    rec, agent_outputs, _timings = run_lap(
        race_state, laps_df, lap_state, profile="no-llm", return_agent_outputs=True
    )
    outputs = agent_outputs or {}

    return {
        "action": rec.action,
        "reasoning": rec.reasoning,
        "confidence": rec.confidence,
        # The engine hands back the raw MC dict ({scenario: {"score": ..., ...}}), the
        # same shape the old body flattened here. _coerce_scenario_scores downstream
        # accepts either, but flatten anyway to keep the emitted contract unchanged.
        "scenario_scores": {
            k: round(float(v["score"] if isinstance(v, dict) else v), 3)
            for k, v in (rec.scenario_scores or {}).items()
        },
        "regulation_context": rec.regulation_context or "",
        "guardrail_reason": outputs.get("guardrail_reason"),
        "_pit_out": outputs.get("pit_out"),
        "_tire_out": outputs.get("tire_out"),
        "_sit_out": outputs.get("situation_out"),
        "_pace_out": outputs.get("pace_out"),
        "_radio_out": outputs.get("radio_out"),
        "_rag_text": outputs.get("rag") or "",
        "_active_agents": set(outputs.get("active") or []),
    }


def _coerce_scenario_scores(raw: Any) -> dict[str, float]:
    """Flatten ``{scenario: {score: float, ...}}`` or ``{scenario: float}`` to
    a simple ``{scenario: float}`` dict. Both shapes show up in the wild:
    ``_run_mc_simulation`` returns the nested form, while the orchestrator
    re-attaches it post-synthesis and other code paths sometimes pre-flatten.
    """
    if not isinstance(raw, dict):
        return {}
    flat: dict[str, float] = {}
    for key, val in raw.items():
        if isinstance(val, dict):
            score = val.get("score")
            if score is not None:
                flat[key] = float(score)
        else:
            try:
                flat[key] = float(val)
            except (TypeError, ValueError):
                continue
    return flat


def _parse_lap_decision(
    result: Any,
    race_state: RaceState,
    lap_state: dict[str, Any],
    lap_time_s: Optional[float],
) -> LapDecision:
    """Normalise the heterogeneous result shape into a ``LapDecision``.

    The no-LLM path returns a dict with ``_pit_out`` and friends, while the
    LLM path returns a ``StrategyRecommendation`` Pydantic object. We branch
    on ``isinstance(result, dict)`` \u2014 the same pattern the CLI uses \u2014 to pull
    the 15 common fields without assuming either shape.
    """
    agent_alerts: list[str] = []
    guardrail_reason: Optional[str] = None

    if isinstance(result, dict):
        action = str(result.get("action", "ERROR"))
        confidence = float(result.get("confidence", 0.0))
        reasoning = str(result.get("reasoning", ""))
        scenario_scores = _coerce_scenario_scores(result.get("scenario_scores"))
        pace_mode = None
        risk_posture = None
        pit_out = result.get("_pit_out")
        pit_lap_target = getattr(pit_out, "recommended_lap", None)
        compound_next = getattr(pit_out, "compound_recommendation", None)
        undercut_target = getattr(pit_out, "undercut_target", None)
        radio_out = result.get("_radio_out")
        if radio_out is not None:
            raw_alerts = getattr(radio_out, "alerts", []) or []
            agent_alerts = [
                str(a.get("intent") or a.get("event_type") or "alert")
                if isinstance(a, dict)
                else str(a)
                for a in raw_alerts
            ]
        guardrail_reason = result.get("guardrail_reason")
    else:
        action = str(getattr(result, "action", "ERROR"))
        confidence = float(getattr(result, "confidence", 0.0))
        reasoning = str(getattr(result, "reasoning", ""))
        scenario_scores = _coerce_scenario_scores(getattr(result, "scenario_scores", {}))
        pace_mode = getattr(result, "pace_mode", None)
        risk_posture = getattr(result, "risk_posture", None)
        pit_lap_target = getattr(result, "pit_lap_target", None)
        compound_next = getattr(result, "compound_next", None)
        undercut_target = getattr(result, "undercut_target", None)

    return LapDecision(
        lap_number=race_state.lap,
        compound=race_state.compound,
        tyre_life=race_state.tyre_life,
        position=race_state.position,
        lap_time_s=lap_time_s,
        gap_ahead_s=race_state.gap_ahead_s,
        action=action,
        confidence=confidence,
        reasoning=reasoning,
        scenario_scores=scenario_scores,
        pace_mode=pace_mode,
        risk_posture=risk_posture,
        pit_lap_target=pit_lap_target,
        compound_next=compound_next,
        undercut_target=undercut_target,
        agent_alerts=agent_alerts,
        guardrail_reason=guardrail_reason,
    )


# ---------------------------------------------------------------------------
# Summary aggregation
# ---------------------------------------------------------------------------


@dataclass
class _SummaryState:
    """Mutable accumulator owned by ``simulate_race`` \u2014 one instance per run.

    Kept as a plain dataclass (not a Pydantic model) because the generator
    mutates it on every lap; Pydantic's revalidation would be wasteful here.
    """

    ok_laps: int = 0
    error_laps: int = 0
    start_position: Optional[int] = None
    last_position: Optional[int] = None
    action_counts: dict[str, int] = field(default_factory=dict)
    pit_agent_calls: int = 0
    rag_agent_calls: int = 0
    radio_alert_total: int = 0
    last_compound: Optional[str] = None
    last_tyre_life: int = 0
    compound_switches: int = 0
    lap_times_s: list[float] = field(default_factory=list)
    best_lap_s: float = 0.0
    worst_lap_s: float = 0.0
    gap_values: list[float] = field(default_factory=list)
    confidences: list[float] = field(default_factory=list)
    best_decision: dict[str, Any] = field(
        default_factory=lambda: {"lap": 0, "score": float("-inf"), "action": ""}
    )
    worst_decision: dict[str, Any] = field(
        default_factory=lambda: {"lap": 0, "score": float("inf"), "action": ""}
    )
    reasoning_blob: list[str] = field(default_factory=list)


def _accumulate(
    state: _SummaryState,
    decision: LapDecision,
    result: Any,
) -> None:
    """Fold a lap decision into the running summary aggregates.

    Call order matters for ``compound_switches``: we compare against the
    previous compound before overwriting it, mirroring the CLI at L2068-2072.
    """
    state.ok_laps += 1
    state.action_counts[decision.action] = state.action_counts.get(decision.action, 0) + 1

    if state.start_position is None:
        state.start_position = decision.position
    state.last_position = decision.position

    if state.last_compound is not None and decision.compound != state.last_compound:
        state.compound_switches += 1
    state.last_compound = decision.compound
    state.last_tyre_life = decision.tyre_life

    if decision.lap_time_s:
        lt = float(decision.lap_time_s)
        state.lap_times_s.append(lt)
        state.best_lap_s = min(state.best_lap_s, lt) if state.best_lap_s else lt
        state.worst_lap_s = max(state.worst_lap_s, lt)

    state.gap_values.append(float(decision.gap_ahead_s))
    state.confidences.append(float(decision.confidence))
    state.reasoning_blob.append(decision.reasoning)

    # Use the winning scenario's score when available; otherwise fall back to
    # confidence so best/worst still track something meaningful.
    score = decision.scenario_scores.get(decision.action, decision.confidence)
    if score > state.best_decision["score"]:
        state.best_decision = {"lap": decision.lap_number, "score": float(score), "action": decision.action}
    if score < state.worst_decision["score"]:
        state.worst_decision = {"lap": decision.lap_number, "score": float(score), "action": decision.action}

    if isinstance(result, dict):
        if result.get("_pit_out") is not None:
            state.pit_agent_calls += 1
        if result.get("_rag_text"):
            state.rag_agent_calls += 1
        radio_out = result.get("_radio_out")
        if radio_out is not None:
            state.radio_alert_total += len(getattr(radio_out, "alerts", []) or [])
    else:
        if getattr(result, "regulation_context", "") or "":
            state.rag_agent_calls += 1


def _top_tokens(blob: list[str], top_n: int = 10) -> dict[str, int]:
    """Coarse whitespace tokeniser returning the top-N most frequent words.

    Stop-list is intentionally tiny — this is a keyword cloud, not NLP. The
    goal is to give Arcade a cheap "what did the model talk about" chip.
    """
    from collections import Counter

    stop = {"the", "a", "an", "of", "to", "in", "on", "is", "and", "for",
            "with", "this", "that", "it", "as", "by", "at", "be", "or",
            "are", "was", "were", "but", "not", "our", "we", "you"}
    counter: Counter[str] = Counter()
    for line in blob:
        for tok in line.lower().split():
            stripped = "".join(ch for ch in tok if ch.isalpha())
            if len(stripped) < 3 or stripped in stop:
                continue
            counter[stripped] += 1
    return dict(counter.most_common(top_n))


def _finalize_summary(
    state: _SummaryState,
    wallclock_s: float,
    total_race_laps_seen: int,
) -> RunSummary:
    """Collapse the mutable accumulator into the immutable ``RunSummary``.

    ``time_compression`` approximates how much faster the simulation ran than
    the real race would have (real F1 laps take ~90s each). For batch runs
    this is a very large number; for ``interval_s>0`` runs it tends toward 1.
    """
    race_lap_times = [t for t in state.lap_times_s if t > 0]
    avg_lap = sum(race_lap_times) / len(race_lap_times) if race_lap_times else 0.0
    real_race_s = total_race_laps_seen * 90.0
    compression = real_race_s / wallclock_s if wallclock_s > 0 else 0.0

    start_pos = state.start_position or 0
    last_pos = state.last_position or 0

    gaps = [g for g in state.gap_values if g > 0]
    gap_stats = {
        "avg": sum(gaps) / len(gaps) if gaps else 0.0,
        "min": min(gaps) if gaps else 0.0,
        "max": max(gaps) if gaps else 0.0,
    }

    best = state.best_decision if state.best_decision["action"] else {"lap": 0, "score": 0.0, "action": ""}
    worst = state.worst_decision if state.worst_decision["action"] else {"lap": 0, "score": 0.0, "action": ""}

    return RunSummary(
        status={"ok_laps": state.ok_laps, "error_laps": state.error_laps},
        positions={"start": start_pos, "end": last_pos, "delta": start_pos - last_pos},
        actions=dict(state.action_counts),
        agents_fired={
            "pit": state.pit_agent_calls,
            "rag": state.rag_agent_calls,
            "radio": state.radio_alert_total,
            "radio_source": "none",  # radio corpus loader not wired in this module yet
        },
        stint={
            "final_compound": state.last_compound or "",
            "final_tyre_life": state.last_tyre_life,
            "compound_switches": state.compound_switches,
        },
        timing={
            "wallclock_s": round(wallclock_s, 2),
            "avg_lap_s": round(avg_lap, 3),
            "best_lap_s": round(state.best_lap_s, 3),
            "worst_lap_s": round(state.worst_lap_s, 3),
        },
        gap_ahead={
            "avg": round(gap_stats["avg"], 3),
            "min": round(gap_stats["min"], 3),
            "max": round(gap_stats["max"], 3),
        },
        mc_confidence_series=[round(c, 3) for c in state.confidences],
        best_decision=best,
        worst_decision=worst,
        time_compression=round(compression, 2),
        reasoning_tokens=_top_tokens(state.reasoning_blob),
    )


# ---------------------------------------------------------------------------
# Public generator
# ---------------------------------------------------------------------------


def simulate_race(config: SimConfig) -> Generator[dict[str, Any], None, None]:
    """Yield a ``start`` event, one ``lap`` per lap, and a closing ``summary``.

    The generator is exception-safe at the lap level: a per-lap failure emits
    an ``error`` event and the loop continues, so Arcade can keep animating
    with a ``waiting`` state rather than tearing down the session. A failure
    in setup (missing parquet, unreadable race dir) propagates instead \u2014 the
    endpoint wraps those as a final ``error`` frame before closing.
    """
    _set_provider_env(config.provider)

    laps_df = _load_laps_df(config.year)

    race_dir = _resolve_race_dir(config.year, config.gp)
    if not race_dir.exists():
        raise FileNotFoundError(f"Race directory not found: {race_dir}")

    engine = RaceReplayEngine(
        race_dir,
        driver_code=config.driver,
        team=config.team,
        interval_seconds=0.0,
    )
    total_laps = engine.total_laps
    lap_start = config.lap_range[0] if config.lap_range else 1
    lap_end = config.lap_range[1] if config.lap_range else total_laps

    yield {
        "type": "start",
        "data": StartEvent(
            gp=config.gp,
            year=config.year,
            driver=config.driver,
            driver2=config.driver2,
            team=config.team,
            lap_start=lap_start,
            lap_end=lap_end,
            total_laps=total_laps,
            no_llm=config.no_llm,
            provider=config.provider,
            timestamp=datetime.now(timezone.utc).isoformat(),
        ).model_dump(),
    }

    state = _SummaryState()
    prev_lap_time = 0.0
    laps_processed = 0
    sim_start = time.monotonic()

    for lap_state in engine.replay():
        lap_num = lap_state.get("lap_number", 0)
        if lap_num < lap_start or lap_num > lap_end:
            continue

        try:
            race_state = _local_build_race_state(lap_state, prev_lap_time, config.risk_tolerance)
            if config.no_llm:
                result = _run_no_llm_path(race_state, lap_state, laps_df)
            else:
                result = run_strategy_orchestrator_from_state(race_state, laps_df, lap_state)

            lap_time_s = lap_state.get("driver", {}).get("lap_time_s")
            decision = _parse_lap_decision(result, race_state, lap_state, lap_time_s)
            _accumulate(state, decision, result)

            yield {"type": "lap", "data": decision.model_dump()}

            if lap_time_s:
                prev_lap_time = float(lap_time_s)
            laps_processed += 1
        except Exception as exc:
            logger.exception("Simulation error on lap %s", lap_num)
            state.error_laps += 1
            yield {
                "type": "error",
                "data": ErrorEvent(lap=lap_num, message=str(exc)).model_dump(),
            }

        if config.interval_s > 0:
            time.sleep(config.interval_s)

    wallclock_s = time.monotonic() - sim_start
    yield {
        "type": "summary",
        "data": _finalize_summary(state, wallclock_s, laps_processed).model_dump(),
    }
