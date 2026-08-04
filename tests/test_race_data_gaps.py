"""A gap is a relation between cars, so it cannot be measured on one car (#193).

``/telemetry/race-data`` applied the driver filter before computing gaps, which
left a single-driver request diffing a frame containing only that driver: every
``GapToCarAhead`` came back null. The fix computes over the whole field first,
which also makes the result a pure function of ``(year, gp)`` and therefore
cacheable — the consistency pass is a nested Python loop over every driver and
every lap, and it was being paid on every request.
"""

from __future__ import annotations

import pytest

# These exercise backend modules whose own imports reach into the parent F1-StratLab
# checkout (``src.agents``). The submodule's CI clones this repository standalone, so
# there is no ``src`` there and collection ERRORED, turning the test job red on every
# pull request regardless of its contents. Skipping is the honest outcome: the code
# under test genuinely needs the parent, and it is exercised there.
pytest.importorskip("src", reason="needs the parent F1-StratLab checkout")

# The lite CI installs neither numpy nor pandas, yet the endpoint below imports
# both at module load time. Skip gracefully there rather than erroring during
# collection, matching how the other dep-heavy suites behave.
pytest.importorskip("numpy")
pytest.importorskip("pandas")

from backend.api.v1.endpoints.strategy import get_lap_state  # noqa: E402
from backend.api.v1.endpoints.telemetry import get_race_data  # noqa: E402
from backend.utils.laps_cache import get_laps_df  # noqa: E402

YEAR = 2025


def _gp_with_gaps() -> str:
    """A GP present in the featured parquet, or skip when data is absent."""
    df = get_laps_df(YEAR)
    if df is None:
        pytest.skip(f"featured parquet for {YEAR} not available in this environment")
    if "LapTime_s" not in df.columns or "Position" not in df.columns:
        pytest.skip("featured parquet carries no lap times or positions here")
    return str(df["GP_Name"].dropna().iloc[0])


def _gaps_for(payload: dict, driver: str) -> list:
    return [row.get("GapToCarAhead") for row in payload["race_data"] if row["Driver"] == driver]


def test_a_driver_filtered_request_reports_the_same_gaps_as_the_full_field():
    """The filter narrows which rows come back, never what the numbers mean."""
    gp = _gp_with_gaps()
    full = get_race_data(year=YEAR, gp=gp, driver=None)

    drivers = [row["Driver"] for row in full["race_data"]]
    assert drivers, f"no rows returned for {gp} {YEAR}"
    driver = max(set(drivers), key=drivers.count)

    filtered = get_race_data(year=YEAR, gp=gp, driver=driver)
    assert _gaps_for(filtered, driver) == _gaps_for(full, driver)


def test_a_single_driver_request_still_has_real_gaps():
    """The regression itself: not merely equal to the full field, but populated.

    Asserting equality alone would pass on a version that returned null in both
    cases, which is exactly what a future refactor of _compute_gaps could
    reintroduce.
    """
    gp = _gp_with_gaps()
    full = get_race_data(year=YEAR, gp=gp, driver=None)
    drivers = [row["Driver"] for row in full["race_data"]]
    driver = max(set(drivers), key=drivers.count)

    gaps = _gaps_for(get_race_data(year=YEAR, gp=gp, driver=driver), driver)
    assert any(gap is not None for gap in gaps), (
        f"every gap for {driver} at {gp} is null: the gaps are being computed after "
        f"the driver filter, on a frame with no other car in it"
    )


def test_the_cached_race_frame_is_not_mutated_between_requests():
    """The frame is shared, so a caller that adds a column must copy first.

    ``get_race_data`` appends a TyreAge alias and drops to a column subset. Doing
    that in place would corrupt the cached frame for every later request, and the
    symptom would be a second call returning fewer columns than the first.
    """
    gp = _gp_with_gaps()
    first = get_race_data(year=YEAR, gp=gp, driver=None)
    second = get_race_data(year=YEAR, gp=gp, driver=None)
    assert first == second


# ---------------------------------------------------------------------------
# An overcut needs to know who is in the pit lane
# ---------------------------------------------------------------------------


def test_lap_state_says_whether_each_rival_is_in_the_pit_lane():
    """Absence of this key is an assertion, not a silence.

    The projection reads ``is_pitting`` with a ``False`` default, so a producer
    that omits it is not saying "unknown", it is saying "nobody is stopping".
    OVERCUT keys off exactly that flag, so leaving it out made the candidate
    permanently ineligible through this endpoint while every other surface could
    reach it.

    ``None`` is the honest answer where the frame cannot support one: the
    featured parquet drops ``PitInTime``. It also drops the pit laps themselves,
    which is why a rival who genuinely IS in the pit lane arrives through the raw
    fallback, where the column survives.
    """
    gp = _gp_with_gaps()
    frame = get_laps_df(YEAR)
    row = frame[frame["GP_Name"] == gp].iloc[0]
    driver, lap = str(row["Driver"]), int(row["LapNumber"])

    state = get_lap_state(gp=gp, driver=driver, lap=lap, year=YEAR)
    rivals = state["rivals"]
    assert rivals, f"no rivals returned for {driver} at {gp} lap {lap}"
    for rival in rivals:
        assert "is_pitting" in rival, f"{rival['driver']} carries no pit-lane state"
        assert rival["is_pitting"] in (True, False, None)
