FROM python:3.10-slim

WORKDIR /app

# Install system deps: ffmpeg decodes the WebM/Opus audio that browsers emit
# from st.audio_input (Chrome default) so Whisper's pipeline can process it;
# libsndfile1 is required by soundfile/librosa for reading WAV + WebM alike.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast package manager)
RUN pip install --no-cache-dir uv

COPY backend/requirements.txt .

# setuptools needed by openai-whisper (pkg_resources) — must disable
# build isolation so uv uses the system setuptools during wheel build
RUN uv pip install --system setuptools wheel

# Install dependencies with uv
RUN uv pip install --system --no-build-isolation -r requirements.txt

COPY backend/ ./backend/

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
