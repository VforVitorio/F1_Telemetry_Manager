from .fastf1_client import SessionData
import pandas as pd
import numpy as np
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

        print(f"Found {len(laps)} total laps for drivers {drivers}")

        # Filter for valid laps with telemetry
        # Only include laps that:
        # 1. Have accurate timing (IsAccurate == True)
        # 2. Have a valid lap time
        # 3. Are not pit entry laps (PitInTime is NaN)
        # 4. Are not pit exit laps (PitOutTime is NaN)
        laps_filtered = laps.loc[
            (laps['IsAccurate'] == True) &
            (laps['LapTime'].notna()) &
            (laps['PitOutTime'].isna()) &
            (laps['PitInTime'].isna())
        ]

        print(f"Filtered to {len(laps_filtered)} valid laps (excluded pit laps and inaccurate laps)")

        # Additional filter: Verify each lap has COMPLETE telemetry data for ALL TELEMETRY GRAPHS
        # This ensures that all telemetry graphs (Speed, Throttle, Brake, RPM, Gear, DRS, Delta)
        # can be painted for the selected laps.
        #
        # NOTE: X, Y (GPS) are NOT required here because:
        # - Circuit Domination uses its own API endpoint (get_circuit_domination)
        # - Distance can be calculated from Speed and Time if GPS is missing
        #
        # Required columns from FastF1 for telemetry graphs:
        # - Speed: For speed graph
        # - Throttle: For throttle graph
        # - Brake: For brake graph
        # - RPM: For RPM graph
        # - nGear: For gear graph (FastF1 uses 'nGear' not 'Gear')
        # - DRS: For DRS graph
        # - Time: For delta graph and distance calculation

        REQUIRED_COLUMNS = ['Speed', 'Throttle', 'Brake', 'RPM', 'nGear', 'DRS', 'Time']

        laps_with_complete_telemetry = []
        for idx, lap_data in laps_filtered.iterrows():
            try:
                # Try to get telemetry for this lap
                telemetry = lap_data.get_car_data()

                # Check if telemetry exists and is not empty
                if telemetry is None or telemetry.empty:
                    continue

                # Verify ALL required columns exist
                missing_columns = [col for col in REQUIRED_COLUMNS if col not in telemetry.columns]
                if missing_columns:
                    print(f"Lap {lap_data.get('LapNumber', '?')} for {lap_data.get('Driver', '?')} missing columns: {missing_columns}")
                    continue

                # Verify each required column has valid data (not all NaN)
                has_valid_data = True
                for col in REQUIRED_COLUMNS:
                    if telemetry[col].isna().all():
                        print(f"Lap {lap_data.get('LapNumber', '?')} for {lap_data.get('Driver', '?')}: column '{col}' has no valid data")
                        has_valid_data = False
                        break

                # Only include lap if all columns have valid data
                if has_valid_data:
                    laps_with_complete_telemetry.append(idx)

            except Exception as e:
                # Skip laps that fail to load telemetry
                print(f"Skipping lap {lap_data.get('LapNumber', '?')} for {lap_data.get('Driver', '?')}: {e}")
                continue

        # Filter to only laps with complete telemetry data
        if laps_with_complete_telemetry:
            laps_filtered = laps_filtered.loc[laps_with_complete_telemetry]
            print(f"✓ Verified {len(laps_filtered)} laps have COMPLETE telemetry data for ALL graphs")
        else:
            print("⚠ No laps with complete telemetry data found")
            laps_filtered = pd.DataFrame()  # Empty DataFrame

        result = []

        # Iterate through filtered laps
        for _, lap in laps_filtered.iterrows():
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


def get_lap_telemetry(year: int, gp: str, session: str, driver: str, lap_number: int) -> Dict:
    """
    Get telemetry data for a specific lap.

    Args:
        year: Season year
        gp: GP name
        session: Session name
        driver: Driver code
        lap_number: Lap number to get telemetry for

    Returns:
        Dict with telemetry data (distance, speed, throttle, brake, rpm, gear, drs)
    """
    try:
        # Load session data
        session_data = SessionData(year=year, circuit=gp, current_session=session, drivers=[driver])

        # Get the specific lap
        laps = session_data.get_driver_lap_times(drivers=[driver])

        if laps.empty:
            print(f"No lap data for {driver} in {year} {gp} {session}")
            return {}

        # Filter for the specific lap number
        lap = laps[laps['LapNumber'] == lap_number]

        if lap.empty:
            print(f"No lap {lap_number} found for {driver}")
            return {}

        # Get the lap data
        lap_data = lap.iloc[0]

        # Check if this is a valid lap (not in/out lap)
        # Skip laps that are pit laps or out laps as they often don't have complete telemetry
        if pd.notna(lap_data.get('PitInTime')) or pd.notna(lap_data.get('PitOutTime')):
            print(f"Lap {lap_number} is a pit lap - telemetry may be incomplete")
            # Continue anyway but user should be aware

        # Try to get telemetry for the lap with error handling
        # Use get_car_data() instead of get_telemetry() to avoid pandas interpolate issues
        telemetry = None
        try:
            # get_car_data() returns car telemetry without interpolation issues
            telemetry = lap_data.get_car_data()
        except AttributeError as e:
            print(f"AttributeError getting car data for lap {lap_number}: {e}")
            return {}
        except Exception as e:
            print(f"Unexpected error getting car data for lap {lap_number}: {e}")
            import traceback
            traceback.print_exc()
            return {}

        if telemetry is None or telemetry.empty:
            print(f"No telemetry data for lap {lap_number} of {driver}")
            return {}

        # Add distance if not present (get_car_data doesn't always include it)
        # Priority: 1) FastF1's Distance, 2) Calculate from GPS, 3) Calculate from Speed and Time
        if 'Distance' not in telemetry.columns or telemetry['Distance'].isna().all():
            # Fallback 1: Calculate from GPS coordinates if available
            try:
                if 'X' in telemetry.columns and 'Y' in telemetry.columns:
                    # Filter out NaN values
                    mask = ~telemetry['X'].isna() & ~telemetry['Y'].isna()

                    if mask.sum() > 0:
                        # Convert mm to meters
                        x_m = telemetry.loc[mask, 'X'].to_numpy() / 1000
                        y_m = telemetry.loc[mask, 'Y'].to_numpy() / 1000

                        # Calculate cumulative distance from GPS coordinates (Euclidean distance)
                        distances = np.sqrt(np.diff(x_m)**2 + np.diff(y_m)**2)
                        cumulative_distance = np.insert(np.cumsum(distances), 0, 0)

                        # Assign back to telemetry DataFrame
                        telemetry.loc[mask, 'Distance'] = cumulative_distance
                        print(f"✓ Calculated distance from GPS for lap {lap_number}")
                    else:
                        # GPS exists but no valid data - try Speed/Time fallback
                        raise ValueError("No valid GPS data")
                else:
                    # No GPS columns - try Speed/Time fallback
                    raise ValueError("No GPS columns available")
            except Exception as gps_error:
                # Fallback 2: Calculate from Speed and Time when GPS is not available
                print(f"GPS not available for lap {lap_number}, calculating distance from Speed and Time")
                try:
                    if 'Speed' in telemetry.columns and 'Time' in telemetry.columns:
                        # Convert speed from km/h to m/s
                        speed_ms = telemetry['Speed'] / 3.6

                        # Calculate time differences in seconds
                        if pd.api.types.is_timedelta64_dtype(telemetry['Time']):
                            time_seconds = telemetry['Time'].dt.total_seconds()
                        else:
                            time_seconds = telemetry['Time']

                        # Calculate distance increments (speed * time_diff)
                        time_diff = time_seconds.diff().fillna(0)
                        distance_increments = speed_ms * time_diff

                        # Cumulative distance
                        telemetry['Distance'] = distance_increments.cumsum()
                        print(f"✓ Calculated distance from Speed/Time for lap {lap_number}")
                    else:
                        print(f"❌ Cannot calculate distance: missing Speed or Time columns for lap {lap_number}")
                        return {}
                except Exception as e:
                    print(f"❌ Could not calculate distance from Speed/Time for lap {lap_number}: {e}")
                    import traceback
                    traceback.print_exc()
                    return {}

        # Verify we have minimum required columns
        required_columns = ['Speed']
        missing_cols = [col for col in required_columns if col not in telemetry.columns]
        if missing_cols:
            print(f"Missing required columns for lap {lap_number}: {missing_cols}")
            return {}

        # Convert telemetry to dict format
        # Clean NaN and inf values
        telemetry_clean = telemetry.fillna(0)
        telemetry_clean = telemetry_clean.replace([float('inf'), float('-inf')], 0)

        # Convert Time to seconds for delta calculation
        time_seconds = []
        if 'Time' in telemetry_clean.columns:
            try:
                # Time is a timedelta, convert to seconds
                time_seconds = telemetry_clean['Time'].dt.total_seconds().tolist()
            except Exception as e:
                print(f"Could not convert Time to seconds: {e}")
                time_seconds = []

        result = {
            'driver': driver,
            'lap_number': lap_number,
            'distance': telemetry_clean['Distance'].tolist() if 'Distance' in telemetry_clean.columns else [],
            'time': time_seconds,
            'speed': telemetry_clean['Speed'].tolist() if 'Speed' in telemetry_clean.columns else [],
            'throttle': telemetry_clean['Throttle'].tolist() if 'Throttle' in telemetry_clean.columns else [],
            'brake': telemetry_clean['Brake'].tolist() if 'Brake' in telemetry_clean.columns else [],
            'rpm': telemetry_clean['RPM'].tolist() if 'RPM' in telemetry_clean.columns else [],
            'gear': telemetry_clean['nGear'].tolist() if 'nGear' in telemetry_clean.columns else [],
            'drs': telemetry_clean['DRS'].tolist() if 'DRS' in telemetry_clean.columns else [],
        }

        # Verify we actually got data
        if not result['distance'] or not result['speed']:
            print(f"Telemetry data is empty after processing for lap {lap_number}")
            return {}

        print(f"Telemetry data retrieved for {driver} lap {lap_number}: {len(result['distance'])} data points")
        return result

    except Exception as e:
        print(f"Error getting telemetry for {driver} lap {lap_number}: {e}")
        import traceback
        traceback.print_exc()
        return {}