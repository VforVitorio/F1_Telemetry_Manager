"""Minimal Server-Sent-Events parsing shared by the SSE tests.

The chat stream frames each event as ``event: <name>\\ndata: <json>\\n\\n`` (see
``chat._sse``).  This is the Python mirror of what the SPA's TS ``RaceFeed``
parser must implement, so the same ``.sse`` fixtures pin both sides of the wire
(one fixture, two consumers — Testing audit T-7).
"""

from __future__ import annotations

import json
from typing import Any


def parse_sse(text: str) -> list[tuple[str | None, dict[str, Any] | None]]:
    """Parse an SSE body into ``(event, data)`` tuples.

    ``data`` is JSON-decoded; a frame missing either field yields ``None`` in
    that slot so a malformed stream surfaces as a shape mismatch rather than a
    crash.
    """
    events: list[tuple[str | None, dict[str, Any] | None]] = []
    for block in text.strip().split("\n\n"):
        if not block.strip():
            continue
        name: str | None = None
        data: dict[str, Any] | None = None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        events.append((name, data))
    return events


def event_sequence(text: str) -> list[str | None]:
    """Return just the ordered event names of an SSE body (the grammar spine)."""
    return [name for name, _ in parse_sse(text)]
