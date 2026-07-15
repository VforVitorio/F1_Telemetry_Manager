// URL search-param contract for the Strategy tab. The scenario config lives in
// the URL — `?gp=...&driver=NOR&rival=PIA&laps=8-28&risk=0.55` reproduces the
// screen so a scenario is a shareable link (the big UX unlock). Same raw↔component
// boundary as the Dashboard's search.ts.
//
// Deep links reproduce the CONFIG only — they never auto-fire the orchestrator
// run (an LLM call, rate-limited, non-deterministic). A shared link lands on a
// prefilled idle state with Run highlighted (wired in StrategyPage).
//
// Two shapes, one boundary:
//  - RawStrategySearch — what lives in the URL / what `validateSearch` returns.
//    `laps` is the string "a-b"; `risk` a number.
//  - StrategySearch — the component-facing shape (`laps` as a [start, end] tuple,
//    `risk` always present with the 0.5 default applied).
// Year is a constant (the featured parquet is 2025-only), so it is NOT in the URL.

export const STRATEGY_YEAR = 2025
export const DEFAULT_RISK = 0.5

/** Component-facing scenario config. */
export interface StrategySearch {
  gp?: string
  driver?: string
  rival?: string
  /** [start, end] lap window; the orchestrator analyses the END lap. */
  laps?: [number, number]
  risk: number
}

/** URL / validated scenario config. */
export interface RawStrategySearch {
  gp?: string
  driver?: string
  rival?: string
  laps?: string
  risk?: number
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function clampRisk(raw: unknown): number {
  const n = Number(raw)
  if (Number.isNaN(n)) return DEFAULT_RISK
  return Math.min(1, Math.max(0, n))
}

/** Parse a "a-b" lap window into an ordered [start, end] tuple, or undefined. */
function parseLaps(raw: unknown): [number, number] | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const parts = raw.split('-').map((p) => Number(p.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return undefined
  const [a, b] = parts
  return a <= b ? [a, b] : [b, a]
}

/**
 * `validateSearch` for the /strategy route: coerce raw router search AND enforce
 * the cascade (rival/laps need a driver, driver needs a GP). A hand-edited link
 * with an orphan rival or lap window therefore drops it instead of rendering a
 * broken half-selected state. `rival` is dropped when it equals `driver`.
 */
export function validateStrategySearch(raw: Record<string, unknown>): RawStrategySearch {
  const gp = coerceStr(raw.gp)
  const driver = gp ? coerceStr(raw.driver) : undefined
  const rivalRaw = driver ? coerceStr(raw.rival) : undefined
  const rival = rivalRaw && rivalRaw !== driver ? rivalRaw : undefined
  const laps = driver ? parseLaps(raw.laps) : undefined
  // Only carry risk in the URL when it was explicitly set — so every field is
  // optional at the boundary and `<Link to="/strategy">` (no search) compiles,
  // with fromRaw applying the 0.5 default.
  const hasRisk = raw.risk != null && raw.risk !== ''
  const risk = hasRisk ? clampRisk(raw.risk) : undefined
  return {
    ...(gp ? { gp } : {}),
    ...(driver ? { driver } : {}),
    ...(rival ? { rival } : {}),
    ...(laps ? { laps: `${laps[0]}-${laps[1]}` } : {}),
    ...(risk != null ? { risk } : {}),
  }
}

/**
 * Apply a single-key scenario patch with the cascading reset of dependent
 * levels. Changing an upstream level clears everything below it (gp → driver →
 * rival + laps). Re-picking the SAME upstream value is a no-op and returns the
 * ORIGINAL object (referential equality), so callers can `if (next === search)
 * return` to skip a redundant navigate. Pure — no navigation, no side effects.
 */
export function applyStrategyPatch(
  search: StrategySearch,
  patch: Partial<StrategySearch>,
): StrategySearch {
  if ('gp' in patch && patch.gp === search.gp) return search
  if ('driver' in patch && patch.driver === search.driver) return search

  const next: StrategySearch = { ...search, ...patch }
  if ('gp' in patch) {
    next.driver = undefined
    next.rival = undefined
    next.laps = undefined
  } else if ('driver' in patch) {
    next.rival = undefined
    next.laps = undefined
  }
  // A rival equal to the driver is meaningless (you can't duel yourself).
  if (next.rival && next.rival === next.driver) next.rival = undefined
  return next
}

/** URL shape → component shape. */
export function fromRaw(raw: RawStrategySearch): StrategySearch {
  return {
    gp: raw.gp,
    driver: raw.driver,
    rival: raw.rival,
    laps: parseLaps(raw.laps),
    risk: raw.risk != null ? clampRisk(raw.risk) : DEFAULT_RISK,
  }
}

/** Component shape → URL shape (empty fields dropped; default risk omitted). */
export function toRaw(search: StrategySearch): RawStrategySearch {
  return {
    ...(search.gp ? { gp: search.gp } : {}),
    ...(search.driver ? { driver: search.driver } : {}),
    ...(search.rival && search.rival !== search.driver ? { rival: search.rival } : {}),
    ...(search.laps ? { laps: `${search.laps[0]}-${search.laps[1]}` } : {}),
    ...(search.risk !== DEFAULT_RISK ? { risk: search.risk } : {}),
  }
}

/** The lap the orchestrator analyses = the right edge of the lap window. */
export function analysedLap(search: StrategySearch): number | undefined {
  return search.laps?.[1]
}
