# syntax=docker/dockerfile:1.7

FROM python:3.11-slim

# Keep the installer out of the image's Python environment and pin it to the
# version used by the local and CI checks.
COPY --from=ghcr.io/astral-sh/uv:0.9.13 /uv /uvx /bin/

WORKDIR /app

# Keep dependency installation in its own layer. The lock is the source of
# truth for the complete backend and parent strategy-engine runtime.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --no-editable

COPY backend/ ./backend/

EXPOSE 8000

# Security A1 (#224): bind to loopback by default. Expose the container
# explicitly with F1_HOST=0.0.0.0 - which also makes F1_API_KEY mandatory
# (the startup guard in core/auth.py refuses to boot on a non-localhost bind
# without a key). Shell form so ${F1_HOST}/${F1_PORT} expand at runtime.
CMD uvicorn backend.main:app --host "${F1_HOST:-127.0.0.1}" --port "${F1_PORT:-8000}" --reload
