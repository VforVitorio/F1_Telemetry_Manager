import os
from pathlib import Path

from dotenv import load_dotenv

# Walk up to repo root (.git marker) so we find the .env at the repo root
# regardless of which directory uvicorn is launched from.
_d = Path(__file__).resolve().parent
while not (_d / ".git").exists() and _d != _d.parent:
    _d = _d.parent
load_dotenv(_d / ".env")
# Also load a local .env in src/telemetry/ if it exists (overrides)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")

# Supabase 
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")