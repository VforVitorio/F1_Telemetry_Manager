from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import FRONTEND_URL
from backend.api.v1.endpoints import auth

app = FastAPI(title="F1 Telemetry API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Añade el router de autenticación
app.include_router(auth.router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}