import createClient from 'openapi-fetch'
import type { paths } from './schema'

// Typed REST client over the FastAPI backend, generated from its OpenAPI schema
// (see `bun run gen:api`). Every path/method/body/response is checked at compile
// time against the 39-endpoint contract.
//
// baseUrl is empty by default: the generated paths already carry the `/api/v1`
// prefix, and nginx (prod) + the Vite dev proxy both forward `/api/*` to the
// backend on :8000, so the client is always same-origin (zero CORS). Set
// VITE_API_BASE only to point at a backend on a different origin.
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_BASE ?? '' })
