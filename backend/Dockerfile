FROM python:3.10-slim

WORKDIR /app

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
