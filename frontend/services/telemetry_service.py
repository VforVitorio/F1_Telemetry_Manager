import requests
from config import API_BASE_URL

def fetch_telemetry_data(year, gp, session, drivers):
    # Extraer solo los números: "Driver 44" -> "44"
    driver_ids = [d.split()[1] for d in drivers]
    
    response = requests.get(
        f"{API_BASE_URL}/telemetry/data",
        params={
            "year": year,
            "gp": gp,
            "session": session,
            "drivers": ",".join(driver_ids)
        }
    )
    return response.json() if response.status_code == 200 else None