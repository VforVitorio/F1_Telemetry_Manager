"""
Telemetry Service

This module handles API calls to the backend for fetching F1 telemetry data.
"""

import requests
from config import BACKEND_URL
from typing import Optional, Dict, List
import logging

logger = logging.getLogger(__name__)


class TelemetryService:
    """
    Service for fetching telemetry data from the backend API.
    """

    @staticmethod
    def get_circuit_domination(
        year: int,
        gp: str,
        session: str,
        drivers: List[str]
    ) -> tuple[bool, Optional[Dict], Optional[str]]:
        """
        Fetch circuit domination data from the backend.

        Args:
            year: Racing season year (e.g., 2024)
            gp: Grand Prix name (e.g., 'Spain', 'Belgium')
            session: Session type ('FP1', 'FP2', 'FP3', 'Q', 'R')
            drivers: List of driver codes (e.g., ['VER', 'LEC'])

        Returns:
            Tuple of (success: bool, data: dict or None, error: str or None)

            On success, data contains:
                - x: List of x coordinates
                - y: List of y coordinates
                - colors: List of hex color strings for each segment
        """
        try:
            # Convert drivers list to comma-separated string
            drivers_str = ','.join(drivers)

            # Build query parameters
            params = {
                'year': year,
                'gp': gp,
                'session': session,
                'drivers': drivers_str
            }

            logger.info(f"Fetching circuit domination: {params}")

            # Make GET request to backend
            response = requests.get(
                f"{BACKEND_URL}/api/v1/circuit-domination",
                params=params,
                timeout=30  # 30 second timeout for FastF1 data loading
            )

            if response.status_code == 200:
                data = response.json()
                logger.info(f"Successfully fetched {len(data.get('x', []))} points")
                return True, data, None

            elif response.status_code == 404:
                error_detail = response.json().get('detail', 'Session or data not found')
                logger.warning(f"404 error: {error_detail}")
                return False, None, error_detail

            elif response.status_code == 400:
                error_detail = response.json().get('detail', 'Invalid parameters')
                logger.warning(f"400 error: {error_detail}")
                return False, None, error_detail

            else:
                error_msg = f"Server error: {response.status_code}"
                logger.error(error_msg)
                return False, None, error_msg

        except requests.exceptions.Timeout:
            error_msg = "Request timeout. FastF1 data loading can take time on first access."
            logger.error(error_msg)
            return False, None, error_msg

        except requests.exceptions.ConnectionError:
            error_msg = "Cannot connect to backend server. Is it running?"
            logger.error(error_msg)
            return False, None, error_msg

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return False, None, error_msg
