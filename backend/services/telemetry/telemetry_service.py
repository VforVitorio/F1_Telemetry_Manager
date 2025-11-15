from .fastf1_client import SessionData
import pandas as pd
import fastf1
from typing import List, Dict


def get_telemetry_data_from_db(year: int, gp: str, session: str, drivers: list):
    print(f"Backend recibió -> Year: {year}, GP: {gp}, Session: {session}, Drivers: {drivers}")

    session_data = SessionData(
        year=year,
        circuit=gp,
        current_session=session,
        drivers=drivers
    )

    laps_data = session_data.get_driver_lap_times()

    print(laps_data)

    # Reemplazar NaN y valores infinitos antes de serializar
    if not laps_data.empty:
        laps_data = laps_data.fillna(0)
        laps_data = laps_data.replace([float('inf'), float('-inf')], 0)

    return {
        "year": year,
        "gp": gp,
        "session": session,
        "drivers": drivers,
        "laps": laps_data.to_dict('records') if not laps_data.empty else []
    }


def get_available_gps(year: int) -> List[str]:
    """
    Get list of available Grand Prix for a year using FastF1.

    Args:
        year: Season year (e.g., 2024)

    Returns:
        List of GP names
    """
    try:
        schedule = fastf1.get_event_schedule(year)
        # Filter events that are GPs (exclude testing)
        gp_events = schedule[schedule['EventFormat'] != 'testing']
        # Get unique event names
        gp_names = gp_events['EventName'].unique().tolist()
        print(f"GPs found for {year}: {gp_names}")
        return gp_names
    except Exception as e:
        print(f"Error getting GPs for {year}: {e}")
        return []


def get_available_sessions(year: int, gp: str) -> List[str]:
    """
    Get available sessions for a specific GP.

    Args:
        year: Season year
        gp: GP name

    Returns:
        List of available session names
    """
    try:
        # Standard F1 sessions
        session_names = ['FP1', 'FP2', 'FP3', 'Q', 'R']

        # Try to verify which sessions exist
        sessions = []
        for session_name in session_names:
            try:
                session = fastf1.get_session(year, gp, session_name)
                if session is not None:
                    sessions.append(session_name)
            except:
                continue

        print(f"Available sessions for {year} {gp}: {sessions}")
        return sessions if sessions else session_names
    except Exception as e:
        print(f"Error getting sessions for {year} {gp}: {e}")
        return ['FP1', 'FP2', 'FP3', 'Q', 'R']


def get_available_drivers(year: int, gp: str, session: str) -> List[Dict[str, str]]:
    """
    Get drivers that participated in a specific session.

    Args:
        year: Season year
        gp: GP name
        session: Session name

    Returns:
        List of dicts with 'code' and 'name' for each driver
    """
    try:
        session_data = SessionData(year=year, circuit=gp, current_session=session)
        laps = session_data.session_data.laps

        if laps.empty:
            print(f"No lap data for {year} {gp} {session}")
            return []

        # Get unique drivers
        drivers = []
        unique_drivers = laps['Driver'].unique()

        for driver_code in unique_drivers:
            # Try to get full driver name
            driver_info = laps[laps['Driver'] == driver_code].iloc[0]
            full_name = driver_info.get('FullName', driver_code)

            # Extract last name if available
            if isinstance(full_name, str) and ' ' in full_name:
                last_name = full_name.split()[-1]
            else:
                last_name = driver_code

            drivers.append({
                'code': driver_code,
                'name': last_name
            })

        # Sort alphabetically by code
        drivers.sort(key=lambda x: x['code'])

        print(f"Drivers found for {year} {gp} {session}: {[d['code'] for d in drivers]}")
        return drivers
    except Exception as e:
        print(f"Error getting drivers for {year} {gp} {session}: {e}")
        return []


def get_lap_times(year: int, gp: str, session: str, drivers: List[str]) -> List[Dict]:
    """
    Get lap times for specified drivers in a session.

    Args:
        year: Season year
        gp: GP name
        session: Session name
        drivers: List of driver codes

    Returns:
        List of dicts with lap time data for each driver
    """
    try:
        # Use SessionData class with drivers parameter
        session_data = SessionData(year=year, circuit=gp, current_session=session, drivers=drivers)

        # Use the get_driver_lap_times method to get filtered laps
        laps = session_data.get_driver_lap_times(drivers=drivers)

        if laps.empty:
            print(f"No lap data for {year} {gp} {session} with drivers {drivers}")
            return []

        print(f"Found {len(laps)} laps for drivers {drivers}")

        result = []

        # Iterate through all laps
        for _, lap in laps.iterrows():
            # Convert LapTime to seconds
            lap_time_seconds = None
            if pd.notna(lap.get('LapTime')):
                try:
                    lap_time_td = lap['LapTime']
                    lap_time_seconds = lap_time_td.total_seconds()
                except:
                    pass

            if lap_time_seconds:
                result.append({
                    'driver': lap['Driver'],
                    'lap_number': int(lap['LapNumber']),
                    'lap_time': lap_time_seconds,
                    'is_valid': bool(lap.get('IsPersonalBest', False))
                })

        print(f"Lap times found: {len(result)} laps for {len(drivers)} drivers")
        return result
    except Exception as e:
        print(f"Error getting lap times for {year} {gp} {session}: {e}")
        import traceback
        traceback.print_exc()
        return []