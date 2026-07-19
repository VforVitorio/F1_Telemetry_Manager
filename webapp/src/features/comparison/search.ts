// URL search-param contract for the Comparison tab. Selector state (year / GP /
// session / drivers) lives in the URL — same shape as the Dashboard so the
// cross-link "Go to comparison" carries context — but capped at TWO drivers, plus
// an optional `t` moment-link that reproduces a paused instant of the replay
// (`?…&drivers=VER,LEC&t=34.2`). Same raw↔component boundary as
// dashboard/search.ts; the cap-2 + `t` are the only differences.

export const MAX_DRIVERS = 2

/** Component-facing selection (drivers as an array, t as a number). */
export interface ComparisonSearch {
  year?: number
  gp?: string
  session?: string
  drivers: string[]
  /** The explicit COMPARE gate: the (expensive) fetch runs only when this is
   *  set. The button sets it; changing any selector clears it. A deep link with
   *  `compare=1` reproduces a loaded comparison. */
  compare?: boolean
  /** Optional replay moment (seconds), applied once on load then owned by the
   *  share button. Clamped to [0, duration] at apply time (duration isn't known
   *  here). */
  t?: number
}

/** URL / validated selection (drivers comma-joined). */
export interface RawComparisonSearch {
  year?: number
  gp?: string
  session?: string
  drivers?: string
  compare?: boolean
  t?: number
}

function coerceYear(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function coerceMoment(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) || n < 0 ? undefined : n
}

function coerceBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true
  return undefined
}

/**
 * Normalise a raw drivers param (array or comma string) to a comma string capped
 * at TWO. Codes are upper-cased + de-duplicated so a hand-edited URL can't make
 * duplicate series or a case mismatch, and a 3-driver Dashboard link truncates
 * gracefully to the first two.
 */
function capDriversCsv(raw: unknown): string | undefined {
  let list: string[] = []
  if (Array.isArray(raw)) list = raw.map(String).filter(Boolean)
  else if (typeof raw === 'string' && raw !== '') list = raw.split(',').filter(Boolean)
  const normalized = [...new Set(list.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const capped = normalized.slice(0, MAX_DRIVERS)
  return capped.length > 0 ? capped.join(',') : undefined
}

/** `validateSearch` for /comparison: coerce raw router search AND enforce the
 *  cascade (drivers need a session, session needs a GP, GP needs a year). `t` is
 *  kept only when a full 2-driver selection exists (it's meaningless otherwise). */
export function validateComparisonSearch(raw: Record<string, unknown>): RawComparisonSearch {
  const year = coerceYear(raw.year)
  const gp = year != null ? coerceStr(raw.gp) : undefined
  const session = gp ? coerceStr(raw.session) : undefined
  const drivers = session ? capDriversCsv(raw.drivers) : undefined
  const hasTwo = !!drivers && drivers.split(',').length === MAX_DRIVERS
  const compare = hasTwo ? coerceBool(raw.compare) : undefined
  const t = compare ? coerceMoment(raw.t) : undefined
  return {
    ...(year != null ? { year } : {}),
    ...(gp ? { gp } : {}),
    ...(session ? { session } : {}),
    ...(drivers ? { drivers } : {}),
    ...(compare ? { compare } : {}),
    ...(t != null ? { t } : {}),
  }
}

/**
 * Apply a single-key selection patch with the cascading reset of dependent
 * levels (year → GP → session → drivers). Changing anything upstream of a level
 * clears it; changing a selector also drops the `t` moment-link (it belonged to
 * the old comparison). Re-picking the SAME upstream value is a no-op returning
 * the ORIGINAL object (referential equality) so callers can `if (next === s) return`.
 * Pure — no navigation, no side effects.
 */
export function applyComparisonPatch(
  search: ComparisonSearch,
  patch: Partial<ComparisonSearch>,
): ComparisonSearch {
  if ('year' in patch && patch.year === search.year) return search
  if ('gp' in patch && patch.gp === search.gp) return search
  if ('session' in patch && patch.session === search.session) return search

  const next: ComparisonSearch = { ...search, ...patch }
  // Any selector edit invalidates a loaded comparison and its moment link → back
  // to idle, COMPARE re-armed. (A `compare`/`t` patch itself skips all of these.)
  if ('year' in patch) {
    next.gp = undefined
    next.session = undefined
    next.drivers = []
    next.compare = undefined
    next.t = undefined
  } else if ('gp' in patch) {
    next.session = undefined
    next.drivers = []
    next.compare = undefined
    next.t = undefined
  } else if ('session' in patch) {
    next.drivers = []
    next.compare = undefined
    next.t = undefined
  } else if ('drivers' in patch) {
    next.drivers = next.drivers.slice(0, MAX_DRIVERS)
    next.compare = undefined
    next.t = undefined
  }
  return next
}

/** URL shape → component shape. */
export function fromRaw(raw: RawComparisonSearch): ComparisonSearch {
  return {
    year: raw.year,
    gp: raw.gp,
    session: raw.session,
    drivers: raw.drivers ? raw.drivers.split(',').filter(Boolean).slice(0, MAX_DRIVERS) : [],
    compare: raw.compare,
    t: raw.t,
  }
}

/** Component shape → URL shape (empty fields dropped so the URL stays clean). */
export function toRaw(search: ComparisonSearch): RawComparisonSearch {
  const drivers =
    search.drivers.length > 0 ? search.drivers.slice(0, MAX_DRIVERS).join(',') : undefined
  const hasTwo = !!drivers && drivers.split(',').length === MAX_DRIVERS
  const compare = hasTwo && search.compare ? true : undefined
  return {
    ...(search.year != null ? { year: search.year } : {}),
    ...(search.gp ? { gp: search.gp } : {}),
    ...(search.session ? { session: search.session } : {}),
    ...(drivers ? { drivers } : {}),
    ...(compare ? { compare } : {}),
    ...(compare && search.t != null ? { t: search.t } : {}),
  }
}

/** True once a runnable comparison is fully specified (year+gp+session+2 drivers). */
export function isComparable(search: ComparisonSearch): boolean {
  return (
    search.year != null && !!search.gp && !!search.session && search.drivers.length === MAX_DRIVERS
  )
}

/** True once the (expensive) compare fetch should run: fully specified AND the
 *  COMPARE gate is set. */
export function shouldFetch(search: ComparisonSearch): boolean {
  return isComparable(search) && !!search.compare
}
