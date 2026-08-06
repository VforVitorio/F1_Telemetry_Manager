"""Every agent entry point on the web side is handed ONE race, not the whole season.

The agents' lookups (`_get_lap_row`, `_get_position_map`, `_get_undercut_candidates`,
`_get_driver_stint`, the SC and overtake feature builders) filter by Driver and LapNumber
and never by GP. Handed the season, they resolve to whichever race sorts first in the file.

Measured on the augmented 2025 frame: `(VER, lap 20)` matches **21 rows across 21 Grands
Prix**, and `iloc[0]` picks Austin every time. A Model Lab run for Qatar computed its gap,
its DRS window and every N12/N14 feature from Austin's telemetry, then rendered the answer
as Qatar's.

The #429/#480 lesson had reached `run_lap`, `/recommend` and the tyre-eval route — each with
its own explanatory comment in this repository — and none of the four per-agent POST routes
or the five MCP tools the chat calls.
"""

from __future__ import annotations

from typing import NamedTuple

import pytest

pytest.importorskip("src", reason="needs the parent F1-StratLab checkout")

from backend.core.paths import get_data_root  # noqa: E402
from backend.utils.laps_cache import get_laps_df, scope_to_race  # noqa: E402

_FEATURED = get_data_root() / "processed" / "laps_featured_2025.parquet"
pytestmark = pytest.mark.skipif(not _FEATURED.exists(), reason="featured parquet absent")

# Functions in the two web-facing modules that hand a laps frame to an agent: the four
# per-agent POST routes, /recommend, the tyre-eval route, and the five MCP tools. Pinned
# EXACTLY, so a new entry point has to be looked at rather than silently joining the set.
_FRAME_PASSING_CALL_SITES = 11


def _lap_state(gp: str, driver: str, lap: int) -> dict:
    return {
        "lap_number": lap,
        "driver": {"driver": driver, "lap_number": lap},
        "session_meta": {"gp_name": gp, "year": 2025, "driver": driver},
    }


def test_the_season_frame_really_does_resolve_to_the_wrong_race():
    """The premise. Without it the assertions below could hold for a trivial reason.

    If this ever stops being true — because the frame gained a GP-aware index, say — the
    scoping is no longer load-bearing and the tests after it are measuring nothing.
    """
    season = get_laps_df(2025)
    assert season is not None

    rows = season[(season["Driver"] == "VER") & (season["LapNumber"] == 20)]
    assert rows["GP_Name"].nunique() > 1, "a (driver, lap) key is unique across the season"
    assert str(rows.iloc[0]["GP_Name"]) != "Lusail", (
        "the first row already happens to be the race we ask for below, so the check "
        "would pass without any scoping"
    )


@pytest.mark.parametrize("gp", ["Lusail", "Sakhir", "Monaco"])
def test_scoping_resolves_the_requested_race_not_the_first_in_the_file(gp):
    """The effect, not the call: the row an agent would pick belongs to the right GP."""
    season = get_laps_df(2025)
    scoped = scope_to_race(season, _lap_state(gp, "VER", 20))

    rows = scoped[(scoped["Driver"] == "VER") & (scoped["LapNumber"] == 20)]
    assert not rows.empty, f"{gp}: scoping left no row for the driver's own lap"
    assert set(rows["GP_Name"].astype(str)) == {gp}
    assert rows["GP_Name"].nunique() == 1


def test_the_metadata_spelling_of_a_race_also_resolves():
    """`session_meta.gp_name` arrives in whichever of the four spellings the caller holds.

    Miami is the race where they differ, and PR 3's resolver is what makes this work — so
    if someone replaces `_scope_laps_to_gp` here with a plain `==` mask, this fails.
    """
    season = get_laps_df(2025)
    scoped = scope_to_race(season, _lap_state("Miami Gardens", "VER", 20))

    assert scoped["GP_Name"].nunique() == 1
    assert str(scoped["GP_Name"].iloc[0]) == "Miami"


def test_an_unresolvable_race_keeps_the_full_frame_rather_than_an_empty_one():
    """Handing an agent an empty frame is worse than the bug this fixes (#429's own rule)."""
    season = get_laps_df(2025)
    scoped = scope_to_race(season, _lap_state("Nowhere Grand Prix", "VER", 20))

    assert len(scoped) == len(season)


def test_an_explicit_gp_name_wins_over_the_lap_state():
    """`/recommend` accepts a `gp_name` field, and the first version of this dropped it.

    A caller that fills the field but not the meta would otherwise get the whole season
    back — the exact bug the helper exists to kill, reintroduced through the fix for it.
    """
    season = get_laps_df(2025)
    scoped = scope_to_race(season, _lap_state("Sakhir", "VER", 20), gp_name="Lusail")

    assert set(scoped["GP_Name"].astype(str)) == {"Lusail"}


@pytest.mark.parametrize(
    "lap_state",
    [
        {"session_meta": None},
        {},
        {"session_meta": {"gp_name": None}},
        {"session_meta": {}},
    ],
    ids=["meta-is-null", "no-meta", "name-is-null", "empty-meta"],
)
def test_a_malformed_lap_state_falls_back_instead_of_raising(lap_state):
    """`{"session_meta": null}` is a present key holding None, so the two-arg get never fires.

    The chained `.get` raised AttributeError there — a 500 where the honest answer is the
    same loud fallback an unknown GP already takes. Fourth form of this trap in this
    project, after dict.get, Series.get and getattr.
    """
    season = get_laps_df(2025)
    assert len(scope_to_race(season, lap_state)) == len(season)


def test_the_helper_does_not_drag_in_the_agent_family():
    """It used to import `engine`, which builds the radio agent's three NLP models.

    Measured at 16.7 s and a worker holding RoBERTa, the NER head, the RAG agent and the
    orchestrator in RAM and VRAM to serve a tyre request. `src/agents/__init__` is lazy for
    precisely that reason, and importing the helper from `engine` undid it one layer up.
    """
    import subprocess
    import sys

    probe = (
        "import sys; from src.strategy.inference.scoping import _scope_laps_to_gp; "
        "print(','.join(m for m in sys.modules if m.startswith('src.agents.')))"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe],
        capture_output=True,
        text=True,
        cwd=str(__import__("pathlib").Path(__file__).parent.parent.parent.parent),
    )
    assert result.returncode == 0, result.stderr[-500:]
    loaded = [name for name in result.stdout.strip().split(",") if name]
    assert loaded == [], f"the scoping helper pulled in agent modules: {loaded}"


def test_scoping_twice_changes_nothing():
    """Callers already scoped upstream (`run_lap`, `/recommend`) must lose nothing."""
    season = get_laps_df(2025)
    once = scope_to_race(season, _lap_state("Lusail", "VER", 20))
    twice = scope_to_race(once, _lap_state("Lusail", "VER", 20))

    assert len(once) == len(twice)


def test_every_web_entry_point_scopes_before_calling_an_agent():
    """The enumeration, because this defect is one-site-fixed-nine-times-missed.

    Reads the SOURCE FILES rather than importing them: the failure mode is a new call site
    added later without the scope, no runtime assertion catches that, and importing
    `mcp_tools` needs fastmcp, which CI deliberately does not install.
    """
    from pathlib import Path

    backend_root = Path(__file__).parent.parent / "backend"
    sources = {
        "strategy.py": backend_root / "api" / "v1" / "endpoints" / "strategy.py",
        "mcp_tools.py": backend_root / "mcp_tools.py",
    }

    unscoped: list[str] = []
    examined = 0
    for name, path in sources.items():
        for function in _top_level_functions(path.read_text(encoding="utf-8")):
            # Per function, and looking for the two tokens anywhere in it: the call is
            # written across several lines in one module and on one line in the other, so
            # a per-line match sees five of the nine sites and reports the rest as absent
            # rather than as unscoped — which is how this assertion first went green.
            if "_from_state(" not in function.source or "laps_df" not in function.source:
                continue  # no frame passed at all (the pace agent) — nothing to scope
            examined += 1
            if not any(token in function.source for token in ("_scope_to_race", "gp_df")):
                calls = [line.strip() for line in function.body if "_from_state(" in line]
                unscoped.append(f"{name}:{function.line} {function.name}(): {calls[0]}")

    # Non-vacuity, and the floor is the MEASURED count rather than the one in the prose.
    # It was first written as 9 — the four HTTP routes plus the five MCP tools — while the
    # scan actually reaches 11, because /recommend and the tyre-eval route pass a frame
    # too. A floor two below the real number lets two sites disappear in silence, which is
    # the same "guard that asserts nothing" this file exists to prevent.
    assert examined == _FRAME_PASSING_CALL_SITES, (
        f"{examined} frame-passing agent call sites found, expected "
        f"{_FRAME_PASSING_CALL_SITES}. Fewer means the scan has stopped seeing them and "
        "guards nothing; more means a new entry point arrived — check it scopes, then "
        "raise this number deliberately"
    )

    assert unscoped == [], (
        "an agent is handed a laps frame that was never narrowed to one race — it will "
        f"resolve (Driver, LapNumber) against the whole season: {unscoped}"
    )


class _Function(NamedTuple):
    name: str
    line: int
    body: list[str]

    @property
    def source(self) -> str:
        return "\n".join(self.body)


def _top_level_functions(source: str) -> list[_Function]:
    """Split a module into its top-level `def` blocks.

    Per FUNCTION, not per line: the scope can be applied at the call or one line earlier
    on the variable, and a line-based check would force the code into whichever shape the
    grep happened to expect rather than reading what it actually does.
    """
    lines = source.splitlines()
    starts = [
        (index, line)
        for index, line in enumerate(lines)
        if line.startswith(("def ", "async def "))
    ]

    functions: list[_Function] = []
    for position, (index, line) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        name = line.split("(")[0].removeprefix("async ").removeprefix("def ").strip()
        functions.append(_Function(name=name, line=index + 1, body=lines[index:end]))
    return functions
