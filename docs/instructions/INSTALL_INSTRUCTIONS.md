# F1 Telemetry Manager installation

This is the current installation guide for the FastAPI backend and React web
app. The former voice and Streamlit setup is historical and is not part of the
active runtime.

## Prerequisites

- Python 3.11 or 3.12
- uv 0.9.13 or newer
- Docker Desktop for the containerized stack
- Node.js and npm, or Bun, for local webapp development
- The parent F1 StratLab repository, including its data and model caches, for
  strategy endpoints and full simulation

## Local backend

From the telemetry submodule directory:

```bash
uv sync --frozen --extra dev
uv run python backend/verify_dependencies.py
uv run uvicorn backend.main:app --reload --port 8000
```

The project runtime is resolved from `pyproject.toml` and `uv.lock`. The
optional `dev` extra adds pytest and coverage tools. There is no second active
dependency manifest for the backend.

## Local webapp

In a second terminal:

```bash
cd webapp
npm install
npm run dev
```

The Vite development server runs on port 5173 and proxies API calls to the
backend on port 8000.

## Docker stack

From the parent F1 StratLab repository:

```bash
docker compose up --build
```

The stack exposes the backend on port 8000 and the React webapp on port 8501.
The backend image uses Python 3.11, copies a pinned uv binary, and installs the
full runtime with `uv sync --frozen --no-dev --no-install-project`. The host
data directory is read-only except for the nested FastF1 cache and the RAG
directory, which are writable mounts.

## Verification

The submodule CI reproduces the lightweight test path:

```bash
uv sync --frozen --only-group ci --no-install-project
uv run --frozen --no-sync ruff check --select E9,F63,F7,F82 .
uv run --frozen --no-sync pytest tests/ -q
```

The full backend runtime can be checked with:

```bash
uv sync --frozen --no-dev
uv run python backend/verify_dependencies.py
```

Strategy and simulation endpoints require the parent repository's data and
model files. No LLM call is needed for the health check or for the `no_llm`
simulation path.
