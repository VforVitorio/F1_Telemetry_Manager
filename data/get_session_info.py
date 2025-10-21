import fastf1
import pandas as pd


class SessionData:
    def __init__(self, year, circuit, current_session, driver=None):
        self.year: int = year
        self.circuit: str = circuit
        self.current_session: str = current_session
        self.driver: str = driver
        self.telemetry = True
        self.laps = True
        self.weather = True
        self.session_data = self._load_session()

    def _load_session(self):
        session = fastf1.get_session(
            self.year, self.circuit, self.current_session)
        
        session.load(
            telemetry=self.telemetry,
            laps=self.laps,
            weather=self.weather
        )
        return session

    def get_driver_lap_times(self, driver=None):
        """
        Gets the lap times of a specific driver

        Args:
            driver (str): 3-letter driver code (e.g., 'VER', 'HAM')
                         or driver number as a string. If not specified,
                         uses the driver from the constructor.

        Returns:
            pandas.DataFrame: DataFrame with the driver's lap data
        """
        # Use the driver from the parameter or the constructor
        target_driver = driver if driver is not None else self.driver

        if target_driver is None:
            raise ValueError(
                "A driver must be specified, either in the constructor or as a parameter"
                )

        # Filter laps by driver
        driver_laps = self.session_data.laps.pick_drivers(target_driver)

        if driver_laps.empty:
            print(f"No laps found for driver {target_driver}")
            return pd.DataFrame()

        return driver_laps

    def show_driver_lap_times(self, driver=None, show_all_columns=False):
        """
        Displays the lap times of a driver in a readable format

        Args:
            driver (str): 3-letter driver code or number as a string
            show_all_columns (bool): Whether to show all columns or just the main ones
        """
        driver_laps = self.get_driver_lap_times(driver)

        if driver_laps.empty:
            return

        target_driver = driver if driver is not None else self.driver
        print(f"\n=== LAP TIMES - DRIVER: {target_driver} ===")
        print(
            f"Session: {self.session_data.name} - {self.session_data.event['EventName']} {self.year}")
        print(f"Total laps: {len(driver_laps)}")

        if show_all_columns:
            # Show all relevant columns
            columns_to_show = ['LapNumber', 'LapTime', 'Sector1Time', 'Sector2Time',
                               'Sector3Time', 'SpeedI1', 'SpeedI2', 'SpeedFL', 'Compound',
                               'TyreLife', 'TrackStatus']
        else:
            # Show only the main columns
            columns_to_show = ['LapNumber', 'LapTime',
                               'Sector1Time', 'Sector2Time', 'Sector3Time']

        # Filter only the columns that exist in the data
        available_columns = [
            col for col in columns_to_show if col in driver_laps.columns]

        # Display the data
        display_data = driver_laps[available_columns].copy()

        # Format times for better readability
        time_columns = ['LapTime', 'Sector1Time', 'Sector2Time', 'Sector3Time']
        for col in time_columns:
            if col in display_data.columns:
                display_data[col] = display_data[col].apply(
                    lambda x: str(x).split(' ')[-1] if pd.notna(x) else 'N/A'
                )

        print("\n" + display_data.to_string(index=False))

        # Display additional statistics
        valid_lap_times = driver_laps['LapTime'].dropna()
        if not valid_lap_times.empty:
            fastest_lap = valid_lap_times.min()
            slowest_lap = valid_lap_times.max()
            avg_lap = valid_lap_times.mean()

            print(f"\n=== STATISTICS ===")
            print(f"Fastest lap: {str(fastest_lap).split(' ')[-1]}")
            print(f"Slowest lap: {str(slowest_lap).split(' ')[-1]}")
            print(f"Average time: {str(avg_lap).split(' ')[-1]}")

    def compare_drivers(self, drivers_list):
        """
        Compares the lap times of multiple drivers

        Args:
            drivers_list (list): List of driver codes to compare
        """
        print(f"\n=== DRIVER COMPARISON ===")
        print(
            f"Session: {self.session_data.name} - {self.session_data.event['EventName']} {self.year}")

        comparison_data = []

        for driver in drivers_list:
            driver_laps = self.get_driver_lap_times(driver)
            if not driver_laps.empty:
                valid_times = driver_laps['LapTime'].dropna()
                if not valid_times.empty:
                    fastest_time = valid_times.min()
                    avg_time = valid_times.mean()
                    total_laps = len(driver_laps)

                    comparison_data.append({
                        'Driver': driver,
                        'Fastest Time': str(fastest_time).split(' ')[-1],
                        'Average Time': str(avg_time).split(' ')[-1],
                        'Total Laps': total_laps
                    })

        if comparison_data:
            comparison_df = pd.DataFrame(comparison_data)
            print("\n" + comparison_df.to_string(index=False))


if __name__ == '__main__':

    test = SessionData(
        year=2019,
        circuit='Monza',
        current_session='Q',
        driver='LEC'
    )

    print(f"Session loaded: {test.session_data}")
    print(f"Circuit: {test.session_data.event['EventName']}")
    print(f"Session: {test.session_data.name}")
    print(f"Total laps: {len(test.session_data.laps)}")

    test.show_driver_lap_times()

    test.show_driver_lap_times('HAM')

    test.show_driver_lap_times('VER', show_all_columns=True)

    test.compare_drivers(['LEC', 'HAM', 'VER', 'BOT'])

    test2 = SessionData(
        year=2019,
        circuit='Monza',
        current_session='Q'
    )

    test2.show_driver_lap_times('GAS')
