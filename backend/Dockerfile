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

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
