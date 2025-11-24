from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import FRONTEND_URL
from backend.api.v1.endpoints import auth, circuit_domination, comparison, telemetry, chat

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


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}