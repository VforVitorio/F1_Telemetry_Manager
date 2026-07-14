// Telemetry response types + light runtime narrowing.
//
// The generated OpenAPI schema types every telemetry 200 body as `unknown`
// (the backend ships no response models), so the typed client returns `unknown`
// and we narrow here — one place, so callers get real types. The backend is the
// same app (trusted), so these are light casts with safe fallbacks, not full
// schema validation (that would be over-engineering for an in-house contract).
//
// --- WHERE TO CHANGE IF THE BACKEND CONTRACT CHANGES ---
// backend/services/telemetry/telemetry_service.py (lap-times/lap-telemetry shapes)
// backend/services/telemetry_service.py::get_circuit_domination_data (domination shape)

/** One lap on the lap-time chart. `compound` is lowercase from FastF1. */
export interface LapTime {
  driver: string
  lap_number: number
  lap_time: number // seconds
  is_valid: boolean // IsPersonalBest (see parity note in dashboard queries)
  compound: string // 'soft' | 'medium' | 'hard' | 'intermediate' | 'inter' | 'wet' | 'unknown'
}

/** Full channel telemetry for a single (driver, lap). One call = all 7 channels. */
export interface LapTelemetry {
  driver: string
  lap_number: number
  distance: number[]
  time: number[]
  speed: number[]
  throttle: number[]
  brake: number[]
  rpm: number[]
  gear: number[]
  drs: number[]
}

/** Microsector dominance map: colors[i] paints the segment point[i]→point[i+1]. */
export interface CircuitDomination {
  x: number[]
  y: number[]
  colors: string[]
  drivers: { driver: string; color: string }[]
}

export interface DriverOption {
  code: string
  name: string
}

/** Pull a string[] out of a `{ [key]: string[] }` wrapper, tolerating a bad shape. */
export function narrowStringList(data: unknown, key: string): string[] {
  const record = data as Record<string, unknown> | null
  const list = record?.[key]
  return Array.isArray(list) ? (list as string[]) : []
}

export function narrowDrivers(data: unknown): DriverOption[] {
  const record = data as { drivers?: unknown } | null
  const list = record?.drivers
  return Array.isArray(list) ? (list as DriverOption[]) : []
}

export function narrowLapTimes(data: unknown): LapTime[] {
  const record = data as { lap_times?: unknown } | null
  const list = record?.lap_times
  return Array.isArray(list) ? (list as LapTime[]) : []
}

export function narrowLapTelemetry(data: unknown): LapTelemetry | null {
  const record = data as LapTelemetry | null
  // Every channel must be an array: the backend returns `{}` (→ null here) for
  // laps without telemetry (pit / out / incomplete laps), and a partial body
  // would crash the channel `.map(...)` downstream. All-or-nothing is safest.
  if (
    !record ||
    !Array.isArray(record.distance) ||
    !Array.isArray(record.time) ||
    !Array.isArray(record.speed) ||
    !Array.isArray(record.throttle) ||
    !Array.isArray(record.brake) ||
    !Array.isArray(record.rpm) ||
    !Array.isArray(record.gear) ||
    !Array.isArray(record.drs)
  ) {
    return null
  }
  return record
}

export function narrowCircuitDomination(data: unknown): CircuitDomination | null {
  const record = data as CircuitDomination | null
  if (!record || !Array.isArray(record.x) || !Array.isArray(record.colors)) return null
  return record
}
