from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="F1 Telemetry API")


# NOTE: we will need to change the allow_origins route to use env variables in config.py file
# with this we could either run it with Docker or without it
# import os

# BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8501"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/")
def root():
    return {"message": "F1 Telemetry API is running"}
