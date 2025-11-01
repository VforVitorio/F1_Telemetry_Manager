from .fastf1_client import SessionData
import pandas as pd

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