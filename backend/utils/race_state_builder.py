"""Re-export shim over the canonical ``build_race_state`` (#784/#786).

The lap_state -> RaceState mapping that used to live here was one of four
divergent copies of the same logic (CLI, Arcade, this module, plus the
simulator's gap helper). The single canonical implementation now lives in the
parent repo at ``src/agents/race_state_builder.py``, next to the ``RaceState``
schema it builds and the constants it needs, so the backend can no longer
drift from the other two surfaces.

Why this file still exists: three call sites import
``from backend.utils.race_state_builder import build_race_state``
(``services/simulation/simulator.py``, ``api/v1/endpoints/strategy.py``,
``mcp_tools.py``). Keeping the public name here means zero changes to them,
and the shim is the seam that documents where the canonical implementation
actually lives. Importing ``src.agents.*`` at module scope is a pre-existing
property of this module (it imported ``src.agents.position_projection`` the
same way before #786), not a new failure mode: every backend entry point
sys.path-inserts the parent repo root (``backend/core/paths.py``) and
docker-compose mounts ``../../src`` into the container.
"""

from src.agents.race_state_builder import build_race_state

__all__ = ["build_race_state"]
