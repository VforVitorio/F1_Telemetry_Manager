"""
Strategy Service

HTTP client for the 7 strategy endpoints exposed by the FastAPI backend.
Each method follows the triple-return pattern (success, data, error) used
by TelemetryService so callers handle results consistently.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import requests
from config import API_BASE_URL

logger = logging.getLogger(__name__)

_STRATEGY_URL = f"{API_BASE_URL}/strategy"
_TIMEOUT = 300  # ML inference on first call loads roberta + SetFit + BERT-large + BGE-m3


class StrategyService:
    """HTTP client for the /api/v1/strategy/* endpoints."""

    @staticmethod
    def get_pace(
        lap_state: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the Pace Agent (N25) for a single lap."""
        return StrategyService._post("pace", {"lap_state": lap_state})

    @staticmethod
    def get_pace_range(
        year: int, gp: str, driver: str, lap_start: int, lap_end: int,
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Batch pace predictions across a lap range."""
        return StrategyService._post("pace-range", {
            "year": year, "gp": gp, "driver": driver,
            "lap_start": lap_start, "lap_end": lap_end,
        })

    @staticmethod
    def get_tire(
        lap_state: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the Tire Agent (N26) for a single lap."""
        return StrategyService._post("tire", {"lap_state": lap_state})

    @staticmethod
    def get_situation(
        lap_state: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the Race Situation Agent (N27) for a single lap."""
        return StrategyService._post("situation", {"lap_state": lap_state})

    @staticmethod
    def get_pit(
        lap_state: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the Pit Strategy Agent (N28) for a single lap."""
        return StrategyService._post("pit", {"lap_state": lap_state})

    @staticmethod
    def get_radio(
        lap_state: Dict[str, Any],
        radio_msgs: Optional[List[Dict[str, Any]]] = None,
        rcm_events: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the Radio Agent (N29) for a single lap."""
        payload: Dict[str, Any] = {"lap_state": lap_state}
        if radio_msgs:
            payload["radio_msgs"] = radio_msgs
        if rcm_events:
            payload["rcm_events"] = rcm_events
        return StrategyService._post("radio", payload)

    @staticmethod
    def get_rag(
        question: str,
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Query FIA regulations via the RAG Agent (N30)."""
        return StrategyService._post("rag", {"question": question})

    @staticmethod
    def get_recommendation(
        lap_state: Dict[str, Any],
        gap_ahead_s: float = 2.0,
        pace_delta_s: float = 0.0,
        risk_tolerance: float = 0.5,
        radio_msgs: Optional[List[Dict[str, Any]]] = None,
        rcm_events: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """Run the full Strategy Orchestrator (N31)."""
        payload: Dict[str, Any] = {
            "lap_state": lap_state,
            "gap_ahead_s": gap_ahead_s,
            "pace_delta_s": pace_delta_s,
            "risk_tolerance": risk_tolerance,
        }
        if radio_msgs:
            payload["radio_msgs"] = radio_msgs
        if rcm_events:
            payload["rcm_events"] = rcm_events
        return StrategyService._post("recommend", payload)

    # ------------------------------------------------------------------
    # Selector helpers (GET endpoints for Phase 2)
    # ------------------------------------------------------------------

    @staticmethod
    def get_available_gps(
        year: int = 2025,
    ) -> Tuple[bool, Optional[List[str]], Optional[str]]:
        """Fetch GP names available in the featured parquet."""
        ok, data, err = StrategyService._get("available-gps", {"year": year})
        if ok and data:
            return True, data.get("gps", []), None
        return False, None, err

    @staticmethod
    def get_available_drivers(
        gp: str,
        year: int = 2025,
    ) -> Tuple[bool, Optional[List[str]], Optional[str]]:
        """Fetch driver codes for a GP from the featured parquet."""
        ok, data, err = StrategyService._get(
            "available-drivers", {"gp": gp, "year": year}
        )
        if ok and data:
            return True, data.get("drivers", []), None
        return False, None, err

    @staticmethod
    def get_lap_range(
        gp: str,
        driver: str,
        year: int = 2025,
    ) -> Tuple[bool, Optional[Dict[str, int]], Optional[str]]:
        """Fetch min/max lap numbers for a driver in a GP."""
        return StrategyService._get(
            "lap-range", {"gp": gp, "driver": driver, "year": year}
        )

    @staticmethod
    def get_lap_state(
        gp: str,
        driver: str,
        lap: int,
        year: int = 2025,
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """Build a canonical lap_state dict from parquet data."""
        return StrategyService._get(
            "lap-state", {"gp": gp, "driver": driver, "lap": lap, "year": year}
        )

    # ------------------------------------------------------------------
    # Radio corpus helpers (Phase 2 — radio lookup)
    # ------------------------------------------------------------------

    @staticmethod
    def get_radio_available_gps(
        year: int = 2025,
    ) -> Tuple[bool, Optional[List[str]], Optional[str]]:
        """Fetch GP names that have a radio corpus."""
        ok, data, err = StrategyService._get("radio-available-gps", {"year": year})
        if ok and data:
            return True, data.get("gps", []), None
        return False, None, err

    @staticmethod
    def get_radio_laps(
        gp: str,
        year: int = 2025,
        driver: Optional[str] = None,
    ) -> Tuple[bool, Optional[List[Dict]], Optional[str]]:
        """Fetch drivers and their laps that have radio messages."""
        params: Dict[str, Any] = {"gp": gp, "year": year}
        if driver:
            params["driver"] = driver
        ok, data, err = StrategyService._get("radio-laps", params)
        if ok and data:
            return True, data.get("drivers", []), None
        return False, None, err

    @staticmethod
    def get_radio_transcript(
        gp: str,
        driver: str,
        lap: int,
        year: int = 2025,
    ) -> Tuple[bool, Optional[List[Dict]], Optional[str]]:
        """Fetch the transcript for a specific driver/lap radio message."""
        ok, data, err = StrategyService._get(
            "radio-transcript",
            {"gp": gp, "driver": driver, "lap": lap, "year": year},
        )
        if ok and data:
            return True, data.get("messages", []), None
        return False, None, err

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_detail(response: requests.Response) -> str:
        """Extract error detail from a response without crashing on non-JSON."""
        try:
            return str(response.json().get("detail", response.text))
        except (ValueError, AttributeError):
            return response.text or f"HTTP {response.status_code}"

    @staticmethod
    def _get(
        endpoint: str,
        params: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """GET a strategy sub-endpoint and normalise the response."""
        url = f"{_STRATEGY_URL}/{endpoint}"
        try:
            response = requests.get(url, params=params, timeout=_TIMEOUT)

            if response.status_code == 200:
                return True, response.json(), None

            detail = StrategyService._safe_detail(response)
            error_msg = f"Strategy/{endpoint} {response.status_code}: {detail}"
            logger.warning(error_msg)
            return False, None, error_msg

        except requests.ConnectionError:
            error = "Backend unavailable. Make sure the server is running."
            logger.error("Strategy/%s connection error", endpoint)
            return False, None, error
        except requests.Timeout:
            error = f"Strategy/{endpoint} timed out after {_TIMEOUT}s."
            logger.error(error)
            return False, None, error
        except Exception as exc:
            error = f"Strategy/{endpoint} unexpected error: {exc}"
            logger.error(error, exc_info=True)
            return False, None, error

    @staticmethod
    def _post(
        endpoint: str,
        payload: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """POST to a strategy sub-endpoint and normalise the response."""
        url = f"{_STRATEGY_URL}/{endpoint}"
        try:
            response = requests.post(url, json=payload, timeout=_TIMEOUT)

            if response.status_code == 200:
                data = response.json()
                return True, data.get("result", data), None

            detail = StrategyService._safe_detail(response)
            error_msg = f"Strategy/{endpoint} {response.status_code}: {detail}"
            logger.warning(error_msg)
            return False, None, error_msg

        except requests.ConnectionError:
            error = "Backend unavailable. Make sure the server is running."
            logger.error("Strategy/%s connection error", endpoint)
            return False, None, error
        except requests.Timeout:
            error = f"Strategy/{endpoint} timed out after {_TIMEOUT}s."
            logger.error(error)
            return False, None, error
        except Exception as exc:
            error = f"Strategy/{endpoint} unexpected error: {exc}"
            logger.error(error, exc_info=True)
            return False, None, error
