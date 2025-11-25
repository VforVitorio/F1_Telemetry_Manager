from backend.api.v1.endpoints import auth, circuit_domination, comparison, telemetry, chat, voice
from backend.core.config import FRONTEND_URL
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
import sys
from pathlib import Path

# Add parent directory to path so 'backend' module can be found
backend_parent = Path(__file__).resolve().parent.parent
if str(backend_parent) not in sys.path:
    sys.path.insert(0, str(backend_parent))


app = FastAPI(title="F1 Telemetry API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth.router, prefix="/api/v1")

# Add telemetry router
app.include_router(telemetry.router, prefix="/api/v1")

# Add circuit domination router
app.include_router(circuit_domination.router, prefix="/api/v1")

# Add comparison router
app.include_router(comparison.router, prefix="/api/v1")

# Add chat router
app.include_router(chat.router, prefix="/api/v1")

# Add voice router
app.include_router(voice.router, prefix="/api/v1/voice", tags=["voice"])


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}
