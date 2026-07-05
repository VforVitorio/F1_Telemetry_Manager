import os
from pathlib import Path

from dotenv import load_dotenv

from backend.core.paths import get_repo_root

# Load the repo-root .env, then the submodule-local .env below as an override.
load_dotenv(get_repo_root() / ".env")
# Also load a local .env in src/telemetry/ if it exists (overrides)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")