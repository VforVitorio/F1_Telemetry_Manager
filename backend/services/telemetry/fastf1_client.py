import fastf1
import pandas as pd
from typing import List, Optional


class SessionData:
    def __init__(self, year, circuit, current_session, drivers: Optional[List[str]] = None):
        self.year: int = year
        self.circuit: str = circuit
        self.current_session: str = current_session
        self.drivers: List[str] = drivers or []
        self.telemetry = True
        self.laps = True
        self.weather = True
        self.session_data = self._load_session()

    def _load_session(self):
        session = fastf1.get_session(self.year, self.circuit, self.current_session)
        session.load(telemetry=self.telemetry, laps=self.laps, weather=self.weather)
        return session

    def get_driver_lap_times(self, drivers: Optional[List[str]] = None):
        """
        Gets lap times for multiple drivers

        Args:
            drivers: List of driver codes/numbers. Uses constructor drivers if not specified.

        Returns:
            pandas.DataFrame: Combined lap data for all drivers
        """
        target_drivers = drivers if drivers is not None else self.drivers

        if not target_drivers:
            raise ValueError("Drivers list cannot be empty")

        driver_laps = self.session_data.laps.pick_drivers(target_drivers)

        if driver_laps.empty:
            print(f"No laps found for drivers {target_drivers}")
            return pd.DataFrame()

        return driver_laps

    def show_driver_lap_times(self, drivers: Optional[List[str]] = None, show_all_columns=False):
        """Displays lap times for multiple drivers"""
        driver_laps = self.get_driver_lap_times(drivers)

        if driver_laps.empty:
            return

        target_drivers = drivers if drivers is not None else self.drivers
        print(f"\n=== LAP TIMES - DRIVERS: {', '.join(target_drivers)} ===")
        print(f"Session: {self.session_data.name} - {self.session_data.event['EventName']} {self.year}")
        print(f"Total laps: {len(driver_laps)}")

        columns_to_show = (['LapNumber', 'Driver', 'LapTime', 'Sector1Time', 'Sector2Time',
                           'Sector3Time', 'SpeedI1', 'SpeedI2', 'SpeedFL', 'Compound',
                           'TyreLife', 'TrackStatus'] if show_all_columns 
                          else ['LapNumber', 'Driver', 'LapTime', 'Sector1Time', 'Sector2Time', 'Sector3Time'])

        available_columns = [col for col in columns_to_show if col in driver_laps.columns]
        display_data = driver_laps[available_columns].copy()

        time_columns = ['LapTime', 'Sector1Time', 'Sector2Time', 'Sector3Time']
        for col in time_columns:
            if col in display_data.columns:
                display_data[col] = display_data[col].apply(
                    lambda x: str(x).split(' ')[-1] if pd.notna(x) else 'N/A'
                )

        print("\n" + display_data.to_string(index=False))

    def compare_drivers(self, drivers_list: List[str]):
        """Compares lap times of multiple drivers"""
        print(f"\n=== DRIVER COMPARISON ===")
        print(f"Session: {self.session_data.name} - {self.session_data.event['EventName']} {self.year}")

        comparison_data = []

        for driver in drivers_list:
            driver_laps = self.session_data.laps.pick_driver(driver)
            if not driver_laps.empty:
                valid_times = driver_laps['LapTime'].dropna()
                if not valid_times.empty:
                    comparison_data.append({
                        'Driver': driver,
                        'Fastest Time': str(valid_times.min()).split(' ')[-1],
                        'Average Time': str(valid_times.mean()).split(' ')[-1],
                        'Total Laps': len(driver_laps)
                    })

        if comparison_data:
            print("\n" + pd.DataFrame(comparison_data).to_string(index=False))