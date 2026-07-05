"""Tests for the shared repo-root / data-root resolver (#27).

The bug these pin: a ``.git`` *file* (the submodule gitlink at
``src/telemetry/.git``) must NOT be mistaken for the repo root, and
``$F1_STRAT_DATA_ROOT`` must win when set.
"""

from __future__ import annotations

from pathlib import Path

from backend.core import paths


def _make_tree(root: Path) -> Path:
    """Build root with a real ``.git`` dir + a nested submodule with a ``.git`` file.

    Returns the deep directory a walker would start from.
    """
    (root / ".git").mkdir()
    sub = root / "src" / "telemetry"
    sub.mkdir(parents=True)
    (sub / ".git").write_text("gitdir: ../../.git/modules/telemetry\n")
    deep = sub / "backend" / "core"
    deep.mkdir(parents=True)
    return deep


def test_find_git_root_ignores_gitlink_file(tmp_path):
    deep = _make_tree(tmp_path)
    assert paths._find_git_root(deep) == tmp_path


def test_find_git_root_returns_none_without_git(tmp_path):
    # No .git anywhere → None (get_repo_root then falls back to /app).
    d = tmp_path / "a" / "b"
    d.mkdir(parents=True)
    assert paths._find_git_root(d) is None


def test_get_data_root_honors_env_override(tmp_path, monkeypatch):
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(tmp_path / "mydata"))
    assert paths.get_data_root() == Path(str(tmp_path / "mydata"))


def test_get_data_root_defaults_to_repo_data(monkeypatch):
    monkeypatch.delenv("F1_STRAT_DATA_ROOT", raising=False)
    assert paths.get_data_root() == paths.get_repo_root() / "data"
