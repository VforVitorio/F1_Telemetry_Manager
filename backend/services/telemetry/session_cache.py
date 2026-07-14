"""In-process cache of loaded FastF1 sessions.

Loading + parsing a FastF1 session (telemetry + laps + weather) costs 2-15s and,
without a cache, runs on EVERY ``SessionData(...)`` construction — from disk each
time. A single dashboard interaction builds 4-6 ``SessionData`` objects for the
SAME session (lap-times, each lap-telemetry, circuit-domination, driver list), so
the same parse used to run 4-6x, serialized. This caches the loaded session by
``(year, gp, session)`` with a small LRU and a per-key lock, so concurrent
requests for the same session wait for ONE load instead of stampeding.

Loaded FastF1 sessions are read-only after ``load()``, so sharing a single object
across requests is safe (all downstream use is reads: ``laps.pick_drivers``,
``get_car_data``, ``pick_fastest`` …).

--- WHERE TO CHANGE IF THE LOAD CONTRACT CHANGES ---
``fastf1_client.SessionData._load_session`` delegates here; the endpoints just
build ``SessionData`` as before. Raise ``_MAXSIZE`` only with memory in mind (a
race session with telemetry is hundreds of MB).
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Dict, Tuple

import fastf1

# A race session with telemetry is hundreds of MB; 2 covers the common
# dashboard-then-comparison pattern without unbounded growth.
_MAXSIZE = 2

_Key = Tuple[int, str, str]

_cache: "OrderedDict[_Key, object]" = OrderedDict()
_cache_lock = threading.Lock()          # guards _cache structure
_key_locks: Dict[_Key, threading.Lock] = {}
_key_locks_guard = threading.Lock()


def _lock_for(key: _Key) -> threading.Lock:
    """Return the dedicated load-lock for a key, creating it once."""
    with _key_locks_guard:
        lock = _key_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _key_locks[key] = lock
        return lock


def get_loaded_session(year: int, gp: str, session: str):
    """Return a fully-loaded FastF1 Session for (year, gp, session), cached.

    The first call for a key parses from disk (slow); later calls return the same
    object instantly. Concurrent first-calls for the same key are serialized by a
    per-key lock so the parse runs exactly once (no thundering herd).
    """
    key: _Key = (year, gp, session)

    # Fast path: already cached.
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]

    # Slow path: exactly one loader per key.
    with _lock_for(key):
        # Another thread may have loaded it while we waited for the lock.
        with _cache_lock:
            if key in _cache:
                _cache.move_to_end(key)
                return _cache[key]

        loaded = fastf1.get_session(year, gp, session)
        loaded.load(telemetry=True, laps=True, weather=True)

        with _cache_lock:
            _cache[key] = loaded
            _cache.move_to_end(key)
            while len(_cache) > _MAXSIZE:
                _cache.popitem(last=False)
        return loaded


def prewarm_session(year: int, gp: str, session: str) -> None:
    """Load a session into the cache without returning it (fire-and-forget).

    Called from the prewarm endpoint so the parse starts while the user is still
    picking drivers, turning "30s after the click" into "the charts fall in".
    """
    get_loaded_session(year, gp, session)
