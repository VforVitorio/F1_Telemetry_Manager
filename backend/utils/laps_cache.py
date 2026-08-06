"""Cached loader for the featured laps parquet (multi-year).

The featured parquet is missing three columns the models were trained on, so this
loader restores them from the raw per-race parquets on the way in. See
:func:`_augment_from_raw` for why that happens here rather than in the file.
"""

import logging
from typing import Dict, Optional

import pandas as pd

from backend.core.paths import get_data_root

logger = logging.getLogger(__name__)

_cache: Dict[int, pd.DataFrame] = {}

# The featured parquet's missing columns are restored by the PARENT package, because the
# parent owns the data layer and every consumer needs the same answer. This module used
# to carry its own copy, which meant the backend was fixed and the CLI — `f1-sim`, the
# TFG's PMV — read the parquet straight from disk and shipped the degraded overtake gap
# on 100% of calls. One implementation, every consumer.
from src.f1_strat_manager.laps_augment import augment_featured_laps  # noqa: E402


def get_laps_df(year: int = 2025) -> Optional[pd.DataFrame]:
    """Load the featured parquet for *year*, augmented from raw, and cache it."""
    if year in _cache:
        return _cache[year]
    path = get_data_root() / "processed" / f"laps_featured_{year}.parquet"
    if not path.exists():
        logger.warning("Featured parquet not found: %s", path)
        return None
    # The backend's data root honours $F1_STRAT_DATA_ROOT and its own .git walk, so
    # pass it in rather than letting the parent resolve one that misses the submodule
    # gitlink (#27).
    df = augment_featured_laps(pd.read_parquet(path), year, data_root=get_data_root())
    _cache[year] = df
    logger.info("Loaded laps_df %d: %d rows", year, len(df))
    return df


def require_laps_df(year: int = 2025) -> pd.DataFrame:
    """Like get_laps_df but raises HTTPException(503) if unavailable.

    Returns the WHOLE SEASON. Anything that hands this to an agent must narrow it with
    :func:`scope_to_race` first — see that function for what happens otherwise.
    """
    from fastapi import HTTPException

    df = get_laps_df(year)
    if df is None:
        raise HTTPException(
            status_code=503,
            detail=f"Featured parquet (data/processed/laps_featured_{year}.parquet) not available.",
        )
    return df


def scope_to_race(laps_df: pd.DataFrame, lap_state: dict) -> pd.DataFrame:
    """Narrow a season frame to the one race a ``lap_state`` describes.

    THE ONE PLACE THIS IS DONE, and that is the point. Every agent lookup that takes a
    laps frame (``_get_lap_row``, ``_get_position_map``, ``_get_undercut_candidates``,
    ``_get_driver_stint``, the SC and overtake feature builders) filters by Driver and
    LapNumber but never by GP. Handed the whole season, they resolve to whichever race
    sorts first in the file: measured on the augmented 2025 frame, ``(VER, lap 20)``
    matches **21 rows across 21 Grands Prix** and every one of those lookups picks Austin.

    So a Model Lab run for Qatar computed its gap, its DRS window and every N12/N14 feature
    from Austin's telemetry, and the page rendered the answer as Qatar's.

    This is the #429/#480 lesson, which had reached ``run_lap`` and ``/recommend`` and the
    tyre-eval route — each with its own explanatory comment in this very repository — and
    none of the five per-agent POST routes or the five MCP tools the chat calls. Ten sites,
    one rule, so it lives here rather than being written an eleventh time.

    Delegates to the parent's ``_scope_laps_to_gp``: it already resolves the four spellings
    of a GP name and already falls back to the unscoped frame, loudly, rather than handing
    an agent an empty one. Applying it twice is a no-op, so a caller that was already
    scoped upstream loses nothing.
    """
    from src.strategy.inference.engine import _scope_laps_to_gp

    return _scope_laps_to_gp(laps_df, lap_state)
