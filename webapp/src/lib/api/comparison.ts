// Comparison API types + typed fetch for the head-to-head telemetry endpoint
// (GET /api/v1/comparison/compare). The endpoint returns a bare `Dict`, so the
// generated OpenAPI schema types its body as `{ [k]: unknown }`; we hand-write
// the real shape here (one place, so every consumer gets real types) and narrow
// the `unknown` at the boundary — same pattern as lib/api/strategy.ts.
//
// --- WHERE TO CHANGE IF THE BACKEND CONTRACT CHANGES ---
// backend/api/v1/endpoints/comparison.py        (endpoint + Q-phase metadata)
// backend/services/comparison_service.py         (payload shape: prepare_comparison_data)
//   NOTE on delta sign: prepare_comparison_data's docstring says "positive =
//   pilot1 ahead", but the ACTUAL math (time1 - time2, cumsum, scaled by
//   lap_time1 - lap_time2) makes POSITIVE = pilot1 SLOWER / behind. The port in
//   buildReplayModel.ts follows the math (spec §6), not the stale docstring.

import { api } from './client'

// ── Payload shape (mirrors comparison_service.prepare_comparison_data) ───────

/** One driver's synchronised fastest-lap telemetry on the common 500-pt grid. */
export interface ComparisonPilot {
  /** Common distance grid (metres) — identical for both pilots. */
  distance: number[]
  /** This pilot's own racing line (already rotated into the shared frame). */
  x: number[]
  y: number[]
  speed: number[]
  throttle: number[]
  brake: number[]
  /** Real lap time in seconds (drives the time-domain replay + result banner). */
  lap_time: number
  /** Team colour hex (payload ships it; getDriverColor is a fallback only). */
  color: string
  /** Three-letter code / display name. */
  name: string
  /** Source lap number in the session. */
  lap: number
}

/** Centreline (averaged trajectory) + per-point microsector-dominance colours. */
export interface ComparisonCircuit {
  x: number[]
  y: number[]
  /** One hex per point = the colour of the driver who dominated that
   *  microsector (25 sectors × ~20 pts). Length matches x/y. */
  colors: string[]
}

/** Track-fit + qualifying-fairness metadata. `qualifying_phase`/`warning` are
 *  present ONLY for Q sessions (absent/undefined for Race, Sprint, Practice). */
export interface ComparisonMetadata {
  rotation: number
  aspect_ratio: number
  qualifying_phase?: string | null
  warning?: string | null
}

/** The full compare response. */
export interface ComparisonPayload {
  circuit: ComparisonCircuit
  pilot1: ComparisonPilot
  pilot2: ComparisonPilot
  /** Speed-integrated time delta, scaled to the real lap-time gap. + = pilot1
   *  slower here (see the sign note in the file header). Length = 500. */
  delta: number[]
  metadata: ComparisonMetadata
}

/** Query the compare endpoint identifies (drives the query key + toRaw). */
export interface ComparisonParams {
  year: number
  gp: string
  session: string
  driver1: string
  driver2: string
}

// ── Error carrying HTTP status so the UI can branch (404 driver-not-found) ───

export class ComparisonApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ComparisonApiError'
    this.status = status
    this.body = body
  }
  /** 404 = a driver had no valid lap in the session (bad code / DNS / no data). */
  get isNotFound(): boolean {
    return this.status === 404
  }
}

// ── Narrowing ────────────────────────────────────────────────────────────────

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number')
}

function narrowPilot(raw: unknown, which: string): ComparisonPilot {
  const p = raw as Record<string, unknown> | null
  if (!p || !isNumberArray(p.distance) || !isNumberArray(p.speed) || !isNumberArray(p.x)) {
    throw new ComparisonApiError(502, `Malformed ${which} telemetry in compare response`, raw)
  }
  return {
    distance: p.distance,
    x: p.x,
    y: isNumberArray(p.y) ? p.y : [],
    speed: p.speed,
    throttle: isNumberArray(p.throttle) ? p.throttle : [],
    brake: isNumberArray(p.brake) ? p.brake : [],
    lap_time: typeof p.lap_time === 'number' ? p.lap_time : 0,
    color: typeof p.color === 'string' ? p.color : '#888888',
    name: typeof p.name === 'string' ? p.name : which,
    lap: typeof p.lap === 'number' ? p.lap : 0,
  }
}

/** Validate + coerce the `unknown` compare body into a typed ComparisonPayload,
 *  throwing a 502 ComparisonApiError if the core telemetry arrays are missing. */
export function narrowComparison(raw: unknown): ComparisonPayload {
  const d = raw as Record<string, unknown> | null
  if (!d || typeof d !== 'object') {
    throw new ComparisonApiError(502, 'Empty compare response', raw)
  }
  const circuitRaw = (d.circuit ?? {}) as Record<string, unknown>
  const metaRaw = (d.metadata ?? {}) as Record<string, unknown>
  const circuit: ComparisonCircuit = {
    x: isNumberArray(circuitRaw.x) ? circuitRaw.x : [],
    y: isNumberArray(circuitRaw.y) ? circuitRaw.y : [],
    colors: Array.isArray(circuitRaw.colors) ? circuitRaw.colors.map(String) : [],
  }
  const metadata: ComparisonMetadata = {
    rotation: typeof metaRaw.rotation === 'number' ? metaRaw.rotation : 0,
    aspect_ratio: typeof metaRaw.aspect_ratio === 'number' ? metaRaw.aspect_ratio : 1,
    qualifying_phase:
      typeof metaRaw.qualifying_phase === 'string' ? metaRaw.qualifying_phase : null,
    warning: typeof metaRaw.warning === 'string' ? metaRaw.warning : null,
  }
  return {
    circuit,
    pilot1: narrowPilot(d.pilot1, 'pilot1'),
    pilot2: narrowPilot(d.pilot2, 'pilot2'),
    delta: isNumberArray(d.delta) ? d.delta : [],
    metadata,
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a head-to-head comparison. Cold FastF1 sessions are slow (the endpoint
 * itself is cached in-process), so callers gate this behind an explicit COMPARE
 * action, not reactively. Throws a ComparisonApiError carrying the HTTP status
 * (404 = driver/lap not found) so the page can show a tailored message.
 */
export async function fetchComparison(
  params: ComparisonParams,
  signal?: AbortSignal,
): Promise<ComparisonPayload> {
  const { data, error, response } = await api.GET('/api/v1/comparison/compare', {
    params: { query: params },
    signal,
  })
  if (error || !data) {
    const status = response?.status ?? 500
    const detail = (error as { detail?: unknown } | null)?.detail
    const message = typeof detail === 'string' ? detail : `Comparison failed (${status})`
    throw new ComparisonApiError(status, message, error)
  }
  return narrowComparison(data)
}
