"""Allowlisted GP names and contained race/corpus paths for backend callers."""

import sys
from pathlib import Path, PureWindowsPath

from backend.core.paths import get_data_root, get_repo_root

# The backend also runs from the submodule working directory.
if str(get_repo_root()) not in sys.path:
    sys.path.insert(0, str(get_repo_root()))


class InvalidGPError(ValueError):
    """Refuse unknown identifiers or paths outside the configured data root."""


def validate_gp_name(gp: str) -> str:
    """Return a canonical friendly GP name, refusing path syntax before any I/O."""
    if not isinstance(gp, str) or not gp.strip():
        raise InvalidGPError("Unknown or invalid Grand Prix")
    name = gp.strip()
    if any(char in name for char in ("/", "\\", ":", "\x00")) or PureWindowsPath(name).drive:
        raise InvalidGPError("Unknown or invalid Grand Prix")
    from src.arcade.config import GP_TO_LOCATION
    from src.f1_strat_manager.gp_slugs import (
        COUNTRY_SLUG_BY_GP,
        canonical_gp_name,
        slug_from_event_name,
    )

    candidates = {**GP_TO_LOCATION, **COUNTRY_SLUG_BY_GP}
    for alias, value in candidates.items():
        if name.casefold() == alias.casefold():
            name = canonical_gp_name(value if alias in GP_TO_LOCATION else alias)
            break
    name = slug_from_event_name(name) or canonical_gp_name(name.replace(" ", "_"))
    for friendly, slug in COUNTRY_SLUG_BY_GP.items():
        if name.casefold() in {friendly.casefold(), slug.casefold()}:
            return next(key for key, value in COUNTRY_SLUG_BY_GP.items() if value == slug)
    raise InvalidGPError("Unknown or invalid Grand Prix")


def contained_data_path(*parts: str) -> Path:
    """Resolve a data path and reject links escaping its root or year directory.

    Each prefix must stay under its resolved parent. This includes existing
    symlinks and Windows junctions, even when the final file does not exist.
    """
    parent = get_data_root().resolve()
    for part in parts:
        try:
            candidate = (parent / part).resolve()
        except (OSError, RuntimeError) as exc:
            raise InvalidGPError("Race data path is unavailable") from exc
        if candidate == parent or not candidate.is_relative_to(parent):
            raise InvalidGPError("Race data path is unavailable")
        parent = candidate
    return parent


def resolve_race_dir(year: int, gp: str) -> Path:
    """Return an allowlisted raw race folder, checking replay files for escapes."""
    friendly = validate_gp_name(gp)
    from src.arcade.config import GP_TO_LOCATION

    folder = GP_TO_LOCATION.get(friendly, friendly)
    names = dict.fromkeys((folder, folder.replace(" ", "_"), friendly, friendly.replace(" ", "_")))
    for name in names:
        candidate = contained_data_path("raw", str(year), name)
        for filename in ("laps.parquet", "weather.parquet", "metadata.json"):
            contained_data_path("raw", str(year), name, filename)
        if candidate.is_dir():
            return candidate
    return contained_data_path("raw", str(year), folder.replace(" ", "_"))


def resolve_radio_slug(gp: str) -> str:
    """Return the radio corpus slug, independently of the raw folder spelling."""
    friendly = validate_gp_name(gp)
    from src.f1_strat_manager.gp_slugs import COUNTRY_SLUG_BY_GP

    return COUNTRY_SLUG_BY_GP[friendly]


def validate_radio_paths(year: int, gp: str) -> str:
    """Validate corpus files before a radio runner or loader receives a GP."""
    slug = resolve_radio_slug(gp)
    for filename in ("radios.parquet", "rcm.parquet"):
        contained_data_path("processed", "race_radios", str(year), slug, filename)
    contained_data_path("processed", "radio_nlp", str(year), slug, "transcripts.json")
    return slug
