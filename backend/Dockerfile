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

# Security A1 (#224): bind to loopback by default. Expose the container
# explicitly with F1_HOST=0.0.0.0 — which also makes F1_API_KEY mandatory
# (the startup guard in core/auth.py refuses to boot on a non-localhost bind
# without a key). Shell form so ${F1_HOST}/${F1_PORT} expand at runtime.
CMD uvicorn backend.main:app --host "${F1_HOST:-127.0.0.1}" --port "${F1_PORT:-8000}" --reload
