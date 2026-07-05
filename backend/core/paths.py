"""Repo-root and data-root resolution for the telemetry backend.

Single source of truth for "which directory is the repo / holds the data",
shared by every module that used to carry its own ``.git`` walker.  Those
walkers tested ``(dir / ".git").exists()``, which is satisfied by the **gitlink
file** at ``src/telemetry/.git`` — so a bare-metal backend resolved the repo
root to the submodule and every parquet path 503'd (#27).  The fix is to look
for a ``.git`` *directory* and to honour ``$F1_STRAT_DATA_ROOT`` (set by
docker-compose to ``/app/data``).

--- WHERE TO CHANGE IF PATH RESOLUTION CHANGES ---
Every site that needs the repo root (sys.path injection so ``src.agents`` /
``src.f1_strat_manager`` import) or the data root (parquet + radio corpus)
imports from here: ``core/config.py``, ``utils/laps_cache.py``,
``mcp_tools.py``, ``api/v1/endpoints/strategy.py``,
``services/simulation/simulator.py``.
"""

from __future__ import annotations

import os
from pathlib import Path

_DOCKER_FALLBACK = Path("/app")


def _find_git_root(start: Path) -> Path | None:
    """Walk up from *start* for a directory containing a ``.git`` **directory**.

    A ``.git`` *file* (the submodule gitlink) is deliberately ignored — treating
    it as the repo root is the #27 bug that broke every bare-metal data path.
    """
    for candidate in (start, *start.parents):
        if (candidate / ".git").is_dir():
            return candidate
    return None


def get_repo_root() -> Path:
    """Resolve the repository root; fall back to ``/app`` (the Docker mount)."""
    return _find_git_root(Path(__file__).resolve().parent) or _DOCKER_FALLBACK


def get_data_root() -> Path:
    """Resolve the ``data/`` directory.

    Precedence: ``$F1_STRAT_DATA_ROOT`` (docker-compose sets ``/app/data``) →
    ``<repo root>/data``.
    """
    override = os.getenv("F1_STRAT_DATA_ROOT")
    if override:
        return Path(override).expanduser()
    return get_repo_root() / "data"
