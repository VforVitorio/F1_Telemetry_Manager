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

    @staticmethod
    def get_available_gps(year: int) -> tuple[bool, Optional[List[str]], Optional[str]]:
        """
        Fetch available Grand Prix events for a specific year.

        Args:
            year: Racing season year (e.g., 2024)

        Returns:
            Tuple of (success: bool, gp_list: list or None, error: str or None)
        """
        try:
            params = {'year': year}
            logger.info(f"Fetching GPs for year: {year}")

            response = requests.get(
                f"{BACKEND_URL}/api/v1/telemetry/gps",
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                gp_list = data.get('gps', [])
                logger.info(f"Successfully fetched {len(gp_list)} GPs")
                return True, gp_list, None

            else:
                error_msg = f"Server error: {response.status_code}"
                logger.error(error_msg)
                return False, None, error_msg

        except requests.exceptions.Timeout:
            error_msg = "Request timeout"
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

    @staticmethod
    def get_available_sessions(year: int, gp: str) -> tuple[bool, Optional[List[str]], Optional[str]]:
        """
        Fetch available sessions for a specific Grand Prix.

        Args:
            year: Racing season year (e.g., 2024)
            gp: Grand Prix name (e.g., 'Spain', 'Belgium')

        Returns:
            Tuple of (success: bool, session_list: list or None, error: str or None)
        """
        try:
            params = {'year': year, 'gp': gp}
            logger.info(f"Fetching sessions for: {year} {gp}")

            response = requests.get(
                f"{BACKEND_URL}/api/v1/telemetry/sessions",
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                session_list = data.get('sessions', [])
                logger.info(f"Successfully fetched {len(session_list)} sessions")
                return True, session_list, None

            else:
                error_msg = f"Server error: {response.status_code}"
                logger.error(error_msg)
                return False, None, error_msg

        except requests.exceptions.Timeout:
            error_msg = "Request timeout"
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

    @staticmethod
    def get_available_drivers(
        year: int,
        gp: str,
        session: str
    ) -> tuple[bool, Optional[List[Dict]], Optional[str]]:
        """
        Fetch available drivers for a specific session.

        Args:
            year: Racing season year (e.g., 2024)
            gp: Grand Prix name (e.g., 'Spain', 'Belgium')
            session: Session type ('FP1', 'FP2', 'FP3', 'Q', 'R')

        Returns:
            Tuple of (success: bool, driver_list: list or None, error: str or None)

            On success, driver_list contains:
                - List of dicts with 'code' and 'name' fields
        """
        try:
            params = {'year': year, 'gp': gp, 'session': session}
            logger.info(f"Fetching drivers for: {year} {gp} {session}")

            response = requests.get(
                f"{BACKEND_URL}/api/v1/telemetry/drivers",
                params=params,
                timeout=30  # 30 second timeout for FastF1 data loading
            )

            if response.status_code == 200:
                data = response.json()
                driver_list = data.get('drivers', [])
                logger.info(f"Successfully fetched {len(driver_list)} drivers")
                return True, driver_list, None

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

    @staticmethod
    def get_lap_times(
        year: int,
        gp: str,
        session: str,
        drivers: List[str]
    ) -> tuple[bool, Optional[List[Dict]], Optional[str]]:
        """
        Fetch lap times for specified drivers in a session.

        Args:
            year: Racing season year (e.g., 2024)
            gp: Grand Prix name (e.g., 'Spain', 'Belgium')
            session: Session type ('FP1', 'FP2', 'FP3', 'Q', 'R')
            drivers: List of driver codes (e.g., ['VER', 'LEC'])

        Returns:
            Tuple of (success: bool, lap_times: list or None, error: str or None)

            On success, lap_times contains:
                - List of dicts with 'driver', 'lap_number', 'lap_time', 'is_valid'
        """
        try:
            # Convert drivers list to comma-separated string
            drivers_str = ','.join(drivers)

            params = {'year': year, 'gp': gp, 'session': session, 'drivers': drivers_str}
            logger.info(f"Fetching lap times for: {year} {gp} {session} - {drivers}")

            response = requests.get(
                f"{BACKEND_URL}/api/v1/telemetry/lap-times",
                params=params,
                timeout=30  # 30 second timeout for FastF1 data loading
            )

            if response.status_code == 200:
                data = response.json()
                lap_times = data.get('lap_times', [])
                logger.info(f"Successfully fetched {len(lap_times)} lap times")
                return True, lap_times, None

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
