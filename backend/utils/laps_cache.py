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

# Columns N04 drops from the featured parquet that the agents were nonetheless trained
# on, mapped to the name the training code expects.
#
# `Time` is the important one: N04's drop list calls it "already converted to *_s", but
# no `Time_s` survives in the output, so the session-elapsed information is genuinely
# gone — while N11 trained the overtake gap as `abs(row_x["Time_s"] - row_y["Time_s"])`.
# Without it the agent falls back to a lap-time difference, so two cars 20 s apart but
# lapping within 0.5 s of each other read as "in the DRS window" (#447).
#
# `PitInTime` is deliberately NOT restored here, even though the raw frame has it: a car
# only carries a PitInTime on the lap it actually pits, and those are precisely the laps
# N04's `IsAccurate` filter drops. Measured: 44/1067 raw Lusail laps have one, and 0% of
# them survive into the featured frame — so a merge can only ever restore nulls. The SC
# model's `active_pitstop_count` has to be derived from `Stint`/`TyreLife` resets instead;
# tracked in #447 rather than faked with a column that is structurally always empty.
_RAW_COLUMNS_TO_RESTORE: Dict[str, str] = {
    "Time": "Time_s",          # timedelta -> seconds, matching the trained feature
    "TrackStatus": "TrackStatus",
}

_JOIN_KEYS = ["GP_Name", "Driver", "LapNumber"]

# Inverted from gp_slugs.FOLDER_ALIASES (which is keyed folder -> friendly) so the one
# place that owns circuit renames stays the one place. Reversing at import keeps this
# from becoming a second, drifting copy.
try:
    from src.f1_strat_manager.gp_slugs import FOLDER_ALIASES as _FOLDER_ALIASES

    _FRIENDLY_TO_FOLDER: Dict[str, str] = {v: k for k, v in _FOLDER_ALIASES.items()}
except Exception:  # pragma: no cover - the parent package is absent in some deploys
    _FRIENDLY_TO_FOLDER = {"Miami": "Miami_Gardens"}


def _raw_race_dir(year: int, gp_name: str):
    """Raw per-race directory for a featured `GP_Name`.

    Three forms have to be tried, and the third is not optional: the raw dirs mostly
    match `GP_Name` exactly, the underscore variant covers the space-vs-underscore forms
    FastF1 emits (`Marina Bay` -> `Marina_Bay`), and a small number of circuits were
    simply renamed on disk (`Miami` -> `Miami_Gardens`). Skipping the rename cost Miami
    its whole augmentation on the first pass — 3.8% of the season silently unfixed —
    which is exactly the silent-miss class this epic is about. `FOLDER_ALIASES` in
    `gp_slugs` already owns that mapping; it is keyed folder -> friendly, so invert it
    rather than write a second copy.
    """
    base = get_data_root() / "raw" / str(year)
    for candidate in (
        base / gp_name,
        base / gp_name.replace(" ", "_"),
        base / _FRIENDLY_TO_FOLDER.get(gp_name, gp_name),
    ):
        if candidate.exists():
            return candidate
    return base / gp_name


def _augment_from_raw(df: pd.DataFrame, year: int) -> pd.DataFrame:
    """Restore `Time_s` / `TrackStatus` onto the featured frame.

    --- WHERE TO CHANGE IF THE ARTEFACT CHANGES ---
    This runs at LOAD time on purpose, not as a rewrite of the parquet. The featured
    parquet is published on Hugging Face and pulled by `scripts/download_data.py`, so a
    locally-patched file would be silently reverted by the next download; and its only
    producer is a read-only notebook (N04). Merging here is immune to both: nothing to
    re-upload, no divergence from the published dataset, and no fork of the pipeline.

    The join is safe: `(GP_Name, Driver, LapNumber)` is unique in the featured frame and
    every featured row is a subset of raw. A race whose raw parquet is absent is skipped
    with a warning rather than failing the request — the agents' existing fallbacks then
    behave exactly as they do today, which is the pre-#447 status quo, not a new failure.
    """
    if "GP_Name" not in df.columns:
        return df

    frames = []
    missing: list[str] = []
    for gp_name in df["GP_Name"].dropna().unique():
        path = _raw_race_dir(year, str(gp_name)) / "laps.parquet"
        if not path.exists():
            missing.append(str(gp_name))
            continue
        raw = pd.read_parquet(path)
        if not set(_RAW_COLUMNS_TO_RESTORE).issubset(raw.columns):
            missing.append(str(gp_name))
            continue
        slice_ = raw[["Driver", "LapNumber", *_RAW_COLUMNS_TO_RESTORE]].copy()
        slice_["GP_Name"] = gp_name
        # `Time` is a session-elapsed timedelta; the models were trained on seconds.
        slice_["Time"] = pd.to_timedelta(slice_["Time"]).dt.total_seconds()
        frames.append(slice_.rename(columns=_RAW_COLUMNS_TO_RESTORE))

    if missing:
        logger.warning(
            "Raw laps unavailable for %d GP(s) in %d: %s — their laps keep the "
            "pre-#447 behaviour (overtake gap degrades to a lap-time delta)",
            len(missing), year, sorted(missing),
        )
    if not frames:
        return df

    augmented = df.merge(pd.concat(frames, ignore_index=True), on=_JOIN_KEYS, how="left")
    restored = augmented["Time_s"].notna().sum()
    logger.info(
        "Restored Time_s/TrackStatus onto %d/%d laps of %d from the raw "
        "parquets (#447)", restored, len(augmented), year,
    )
    return augmented


def get_laps_df(year: int = 2025) -> Optional[pd.DataFrame]:
    """Load the featured parquet for *year*, augmented from raw, and cache it."""
    if year in _cache:
        return _cache[year]
    path = get_data_root() / "processed" / f"laps_featured_{year}.parquet"
    if not path.exists():
        logger.warning("Featured parquet not found: %s", path)
        return None
    df = _augment_from_raw(pd.read_parquet(path), year)
    _cache[year] = df
    logger.info("Loaded laps_df %d: %d rows", year, len(df))
    return df


def require_laps_df(year: int = 2025) -> pd.DataFrame:
    """Like get_laps_df but raises HTTPException(503) if unavailable."""
    from fastapi import HTTPException

    df = get_laps_df(year)
    if df is None:
        raise HTTPException(
            status_code=503,
            detail=f"Featured parquet (data/processed/laps_featured_{year}.parquet) not available.",
        )
    return df
