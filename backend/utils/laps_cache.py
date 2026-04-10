"""Cached loader for the featured laps parquet."""

import logging
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve()
while not (_REPO_ROOT / ".git").exists():
    _REPO_ROOT = _REPO_ROOT.parent

_cache: Optional[pd.DataFrame] = None


def get_laps_df() -> Optional[pd.DataFrame]:
    """Load the featured parquet once and cache it in memory."""
    global _cache
    if _cache is not None:
        return _cache
    path = _REPO_ROOT / "data" / "processed" / "laps_featured_2025.parquet"
    if not path.exists():
        logger.warning("Featured parquet not found: %s", path)
        return None
    _cache = pd.read_parquet(path)
    logger.info("Loaded laps_df: %d rows", len(_cache))
    return _cache


def require_laps_df() -> pd.DataFrame:
    """Like get_laps_df but raises HTTPException(503) if unavailable."""
    from fastapi import HTTPException

    df = get_laps_df()
    if df is None:
        raise HTTPException(
            status_code=503,
            detail="Featured parquet (data/processed/laps_featured_2025.parquet) not available.",
        )
    return df
