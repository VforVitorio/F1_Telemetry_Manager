"""Cached loader for the featured laps parquet (multi-year)."""

import logging
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent
while not (_REPO_ROOT / ".git").exists() and _REPO_ROOT != _REPO_ROOT.parent:
    _REPO_ROOT = _REPO_ROOT.parent
# Docker fallback: no .git found → assume /app is the mount point
if not (_REPO_ROOT / ".git").exists():
    _REPO_ROOT = Path("/app")

_cache: Dict[int, pd.DataFrame] = {}


def get_laps_df(year: int = 2025) -> Optional[pd.DataFrame]:
    """Load the featured parquet for *year* and cache it in memory."""
    if year in _cache:
        return _cache[year]
    path = _REPO_ROOT / "data" / "processed" / f"laps_featured_{year}.parquet"
    if not path.exists():
        logger.warning("Featured parquet not found: %s", path)
        return None
    df = pd.read_parquet(path)
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
