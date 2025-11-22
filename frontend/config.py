import os

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")
API_BASE_URL = f"{BACKEND_URL}/api/v1"