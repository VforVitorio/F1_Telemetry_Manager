"""No-LLM regression tests for the strategy-engine backend audit (#442/#465/#486/#435).

Every assertion here is either a deterministic unit check or a check against
the REAL featured parquet -- never a live LLM / orchestrator run, matching the
verification doctrine the whole audit sprint used (see the fix commentary in
``backend/api/v1/endpoints/strategy.py`` and ``backend/mcp_tools.py``).

Tests that need the featured parquet skip (rather than fail) when it is not
present in the current environment, since ``data/`` is fetched from Hugging
Face Hub on first run and may be absent in a bare checkout.
"""

from __future__ import annotations

import pytest

# The lite CI installs neither pandas nor fastmcp, yet the backend modules below
# import both at module load time. Skip the whole suite gracefully there instead of
# erroring at collection, matching how the other dep-heavy suites behave.
pd = pytest.importorskip("pandas")
pytest.importorskip("fastmcp")

from backend.api.v1.endpoints.strategy import (  # noqa: E402  (after importorskip)
    _build_lap_state_from_row,
    _safe_none,
    get_lap_state,
)
from backend.mcp_tools import (  # noqa: E402
    ToolInputError,
    _normalize_driver_code,
    _normalize_lap,
    _normalize_year,
)
from backend.utils.laps_cache import get_laps_df  # noqa: E402

# ---------------------------------------------------------------------------
# #442 -- MCP normalizers must refuse bad input, never silently substitute
# ---------------------------------------------------------------------------


def test_normalize_year_refuses_unparseable_input():
    """A garbled year must raise, not silently become 2025."""
    with pytest.raises(ToolInputError):
        _normalize_year("banana")


def test_normalize_lap_refuses_unparseable_input():
    """A garbled lap must raise, not silently become lap 1."""
    with pytest.raises(ToolInputError):
        _normalize_lap("twenty-five")


def test_normalize_driver_code_refuses_unmatched_name():
    """Pin for the trigram-fallback bug: "Pereira" must never become "PER".

    Nobody named Pereira raced in 2023-2025; the old fallback took the first
    three letters of any unmatched input and matched them against the real
    code list, so "Pereira"[:3] == "PER" silently resolved to Sergio Perez.
    """
    with pytest.raises(ToolInputError):
        _normalize_driver_code("Pereira")


def test_normalize_driver_code_still_resolves_real_codes_and_surnames():
    """The fix must not break the legitimate resolution paths."""
    assert _normalize_driver_code("ver") == "VER"
    assert _normalize_driver_code("Verstappen") == "VER"
    assert _normalize_driver_code("Max Verstappen") == "VER"


# ---------------------------------------------------------------------------
# #465 F5 -- NaN must stay absent (None), never a searchable 0 sentinel
# ---------------------------------------------------------------------------


def test_safe_none_returns_none_for_nan():
    """The core of F5: an absent reading must come back as None, not 0."""
    assert _safe_none(float("nan")) is None
    assert _safe_none(pd.NA) is None


def test_safe_none_passes_through_real_values_including_zero():
    """0 is a real, distinct reading (e.g. a fresh tyre) and must survive."""
    assert _safe_none(3) == 3
    assert _safe_none(0) == 0


# ---------------------------------------------------------------------------
# Shared: pull one real row (and its GP-scoped frame) from the parquet
# ---------------------------------------------------------------------------


def _first_row_with_prev_lap_time(year: int = 2025):
    """One real row from the featured parquet with a resolvable Prev_LapTime.

    Skips the test (rather than failing) when the featured parquet is not
    available in this environment -- data is fetched from Hugging Face Hub
    on first run and may be absent here.
    """
    df = get_laps_df(year)
    if df is None:
        pytest.skip(f"featured parquet for {year} not available in this environment")
    if "Prev_LapTime" not in df.columns:
        pytest.skip("featured parquet has no Prev_LapTime column in this environment")

    candidates = df[df["Prev_LapTime"].notna()]
    if candidates.empty:
        pytest.skip("no row with a resolvable Prev_LapTime in the featured parquet")

    row = candidates.iloc[0]
    gp_df = df[df["GP_Name"] == row["GP_Name"]]
    return row, gp_df


def _to_seconds(val) -> float:
    """Mirror the production helper: accept a raw seconds float or a timedelta."""
    if hasattr(val, "total_seconds"):
        return float(val.total_seconds())
    return float(val)


# ---------------------------------------------------------------------------
# #486 / #435 -- track_temp_start and prev_lap_time must reach lap_state
# ---------------------------------------------------------------------------


def test_build_lap_state_from_row_includes_track_temp_start_and_prev_lap_time():
    """_build_lap_state_from_row must carry both fields (#486, #435)."""
    row, gp_df = _first_row_with_prev_lap_time()
    total_laps = int(gp_df["LapNumber"].max())

    lap_state = _build_lap_state_from_row(row, gp_df, str(row["GP_Name"]), 2025, total_laps)

    assert "track_temp_start" in lap_state["session_meta"]
    assert "prev_lap_time" in lap_state["driver"]

    # track_temp_start must be the session's chronologically FIRST TrackTemp
    # reading, not this lap's own value re-served as a constant (#486).
    expected_start = float(gp_df.sort_values("LapNumber")["TrackTemp"].dropna().iloc[0])
    assert lap_state["session_meta"]["track_temp_start"] == pytest.approx(expected_start)

    # prev_lap_time must come from the featured parquet's own Prev_LapTime
    # column, never this lap's own lap_time_s reused as a stand-in (#435).
    expected_prev = _to_seconds(row["Prev_LapTime"])
    assert lap_state["driver"]["prev_lap_time"] == pytest.approx(expected_prev)


def test_get_lap_state_includes_track_temp_start_and_prev_lap_time():
    """The /lap-state producer must carry both fields too (#486, #435)."""
    row, _gp_df = _first_row_with_prev_lap_time()
    gp, driver, lap = str(row["GP_Name"]), str(row["Driver"]), int(row["LapNumber"])

    state = get_lap_state(gp=gp, driver=driver, lap=lap, year=2025)

    assert "track_temp_start" in state["session_meta"]
    assert state["session_meta"]["track_temp_start"] is not None
    assert "prev_lap_time" in state["driver"]
    expected_prev = _to_seconds(row["Prev_LapTime"])
    assert state["driver"]["prev_lap_time"] == pytest.approx(expected_prev)


# ---------------------------------------------------------------------------
# #465 F5 (integration) -- get_lap_state must round-trip NaN as None
# ---------------------------------------------------------------------------


def test_get_lap_state_tyre_life_and_speed_st_never_coerced_when_nan():
    """Cross-check get_lap_state's output against the real source row.

    Whatever this dataset's TyreLife/SpeedST happens to be for the sampled
    row, the assertion is meaningful either way: a NaN source value must come
    back as None (the #465 fix); a real value must survive unchanged.
    """
    row, _gp_df = _first_row_with_prev_lap_time()
    gp, driver, lap = str(row["GP_Name"]), str(row["Driver"]), int(row["LapNumber"])

    state = get_lap_state(gp=gp, driver=driver, lap=lap, year=2025)
    drv = state["driver"]

    src_tyre_life = row.get("TyreLife")
    if pd.isna(src_tyre_life):
        assert drv["tyre_life"] is None
    else:
        assert drv["tyre_life"] == int(src_tyre_life)

    src_speed_st = row.get("SpeedST")
    if pd.isna(src_speed_st):
        assert drv["speed_st"] is None
    else:
        assert drv["speed_st"] == pytest.approx(float(src_speed_st))
