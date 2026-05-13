"""
Stage Tracker — Lightweight per-request progress reporter.

Keeps a process-global dict of ``{request_id: stage_label}`` so the chat
endpoint can advertise what it is doing right now (extracting intent,
loading models, calling a tool, summarising with the LLM, etc.) and the
Streamlit frontend can poll ``/chat/status`` to mirror real progress in
its spinner instead of rotating through fake labels.

Design notes:
- One single dict, guarded by a lock for thread-safety.
- Entries are removed when the request finishes via ``clear_stage`` so
  the dict does not grow without bound.
- If two requests overlap (rare in dev), each one tracks its own
  ``request_id`` so the spinner shows the right stage per session.
- Falls back to the empty string when an id has no current stage; the
  frontend treats that as "no update yet".
"""

from __future__ import annotations

import threading
from typing import Dict

_lock = threading.Lock()
_stages: Dict[str, str] = {}


def set_stage(request_id: str, stage: str) -> None:
    """Record the current stage for *request_id*.

    Called at checkpoints inside the chat endpoint so any pollers can
    see what step the backend is currently working on.
    """
    if not request_id:
        return
    with _lock:
        _stages[request_id] = stage


def get_stage(request_id: str) -> str:
    """Return the latest stage for *request_id* or empty string when unknown."""
    if not request_id:
        return ""
    with _lock:
        return _stages.get(request_id, "")


def clear_stage(request_id: str) -> None:
    """Drop the entry for *request_id* once the request is done."""
    if not request_id:
        return
    with _lock:
        _stages.pop(request_id, None)
