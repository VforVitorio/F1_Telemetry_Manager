"""Shared serialization helpers for agent outputs."""

from dataclasses import asdict, is_dataclass
from typing import Any, Dict


def agent_output_to_dict(obj: Any) -> Dict[str, Any]:
    """Convert a dataclass or Pydantic model to a plain JSON-serialisable dict.

    Handles three cases in order:
    - dataclass -> dataclasses.asdict()
    - Pydantic v2 -> model_dump()
    - Pydantic v1 -> dict()
    - fallback -> vars()
    """
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return vars(obj)
