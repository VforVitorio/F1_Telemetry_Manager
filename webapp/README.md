# F1 StratLab webapp (React SPA)

Local telemetry SPA that replaces the Streamlit UI (migration epic #25). It runs
beside the untouched Streamlit tree (`../frontend/`) during the strangler
migration; the FastAPI backend is unchanged and shared.

## Stack

React 19 · Vite · TypeScript (strict) · Vitest · oxlint · Prettier · Bun (package manager).

## Develop

```bash
bun install
bun run dev        # http://localhost:5173, proxies /api -> http://localhost:8000
```

The dev server needs the FastAPI backend on `:8000` (repo-root `docker-compose.yml`,
service `backend`). The `/api` proxy in `vite.config.ts` mirrors the nginx proxy
in `nginx.conf`, so the client is always same-origin (zero CORS).

## Checks

```bash
bun run typecheck  # tsc -b
bun run lint       # oxlint
bun run test       # vitest run
bun run build      # tsc -b && vite build -> dist/
bun run format:check
```

## Docker

```bash
docker compose up webapp   # http://localhost:3000, nginx serves dist/ + proxies /api -> backend:8000
```

At cutover (issue #43) this service takes `:8501` and `webapp/` is renamed to `frontend/`.
