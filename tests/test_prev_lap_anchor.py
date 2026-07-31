"""#746 — the previous-lap anchor must reproduce N04's transform, not lap_number - 1.

The fallback used to filter on `LapNumber == lap_number - 1` with no `Stint` scoping
and no quality filter, so it anchored on the OUT-LAP after every stop. Measured on
Lusail 2025, NOR: lap 27 anchored on lap 26's 107.589 s instead of 85.304 s, about
22 s wrong. `_predict` adds a delta to that anchor with no NaN branch, so the fallback
was WORSE than having none: the 90.0 placeholder it replaced is about 5 s off there.

N04 computes `Prev_LapTime` as a groupby shift over Year/GP/Driver/Stint applied AFTER
`filter_baseline_laps` (IsAccurate & ~Deleted & < 180 s & LapNumber > 1), so the
trained-on value is the previous SURVIVING lap inside the same stint.

These tests exist because #746 asked for them and the fix shipped without any: gate G3
found the most intricate function of that wave was its only untested one.
"""

from __future__ import annotations

import pandas as pd
import pytest

from backend.api.v1.endpoints.strategy import _prev_lap_time_for_row


def _raw_frame() -> pd.DataFrame:
    """Raw-parquet shape: LapTime as a timedelta, quality flags present.

    Laps 24-25 are stint 1; 26 is the out-lap of stint 2 and is flagged inaccurate,
    the way FastF1 marks it. Times are the real Lusail 2025 NOR values the issue
    measured.
    """
    return pd.DataFrame(
        {
            "Driver": ["NOR"] * 5,
            "Stint": [1, 1, 2, 2, 2],
            "LapNumber": [24, 25, 26, 27, 28],
            "LapTime": pd.to_timedelta([85.9, 86.1, 107.589, 85.304, 85.065], unit="s"),
            "IsAccurate": [True, True, False, True, True],
            "Deleted": [False] * 5,
        }
    )


def _row(frame: pd.DataFrame, lap: int) -> pd.Series:
    return frame[frame["LapNumber"] == lap].iloc[0]


def test_the_lap_after_a_stop_is_not_anchored_on_the_out_lap():
    """The defect, stated as the value it must never return.

    107.589 is the out-lap. Anchoring lap 28 there instead of on lap 27's 85.304 is
    the 22 s error, and it is the whole reason this function was rewritten.
    """
    frame = _raw_frame()

    assert _prev_lap_time_for_row(_row(frame, 28), frame, "NOR") == pytest.approx(85.304)


def test_the_first_surviving_lap_of_a_stint_has_no_anchor():
    """None, not a number: N04 has NaN here and the pace agent's placeholder is what
    the model was trained to see. Inventing a value would be the #435 defect again."""
    frame = _raw_frame()

    assert _prev_lap_time_for_row(_row(frame, 27), frame, "NOR") is None


def test_an_anchor_never_crosses_a_stint_boundary():
    """Lap 26 opens stint 2, so stint 1's laps are not candidates however good they are.

    Without this the out-lap would be anchored on lap 25 and look perfectly plausible,
    which is worse than returning nothing.
    """
    frame = _raw_frame()

    assert _prev_lap_time_for_row(_row(frame, 26), frame, "NOR") is None


def test_the_featured_column_wins_when_it_is_there():
    """N04's own value is preferred over any reconstruction of it."""
    frame = _raw_frame()
    row = _row(frame, 28).copy()
    row["Prev_LapTime"] = 84.2

    assert _prev_lap_time_for_row(row, frame, "NOR") == pytest.approx(84.2)


def test_both_frame_shapes_are_served():
    """The featured frame carries LapTime_s in seconds and no quality flags; the raw
    one carries LapTime as a timedelta and both flags. Reading only one name raised
    KeyError on the other, which the first draft of this function did."""
    featured = pd.DataFrame(
        {
            "Driver": ["NOR"] * 3,
            "Stint": [2, 2, 2],
            "LapNumber": [26, 27, 28],
            "LapTime_s": [107.589, 85.304, 85.065],
        }
    )

    assert _prev_lap_time_for_row(_row(featured, 28), featured, "NOR") == pytest.approx(85.304)


def test_a_frame_without_stints_degrades_to_none_rather_than_guessing():
    """No Stint column means the scoping cannot be honoured, and an unscoped anchor is
    the defect this function exists to remove."""
    frame = _raw_frame().drop(columns=["Stint"])
    row = _raw_frame()
    row = _row(row, 28)

    assert _prev_lap_time_for_row(row, frame, "NOR") is None
