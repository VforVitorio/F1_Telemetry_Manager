
def get_telemetry_data_from_db(year: int, gp: str, session: str, drivers: list):
    print(f"Backend recibió -> Year: {year}, GP: {gp}, Session: {session}, Drivers: {drivers}")
    return {
        "year": year,
        "gp": gp, 
        "session": session,
        "drivers": drivers,
        "telemetry": []
    }

