// URL search-param contract for the Dashboard. Selector state (year / GP /
// session / drivers) lives in the URL so a link like
// `?year=2023&gp=Monaco Grand Prix&session=R&drivers=VER,LEC` reproduces the
// screen (the big UX unlock, U2-1). This is the single source of truth read by
// the selectors toolbar AND every data query on the page.
//
// Two shapes, one boundary:
//  - RawDashboardSearch — what lives in the URL / what `validateSearch` returns.
//    `drivers` is a comma-joined string so the URL stays `?drivers=VER,LEC`.
//  - DashboardSearch — the component-facing shape (`drivers` as an array).
// The page converts raw↔component; every component only ever sees the array
// shape. The 3-driver cap is enforced at this boundary, so a hand-edited URL
// cannot exceed it.

export const MAX_DRIVERS = 3

/** Component-facing selection (drivers as an array). */
export interface DashboardSearch {
  year?: number
  gp?: string
  session?: string
  drivers: string[]
}

/** URL / validated selection (drivers comma-joined). */
export interface RawDashboardSearch {
  year?: number
  gp?: string
  session?: string
  drivers?: string
}

function coerceYear(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

/**
 * Normalise a raw drivers param (array or comma string) to a capped comma
 * string. Driver codes are upper-cased and de-duplicated so a hand-edited URL
 * like `?drivers=ver,VER,lec` can't produce duplicate chart series or a
 * case-mismatch against the backend's upper-case driver rows.
 */
function capDriversCsv(raw: unknown): string | undefined {
  let list: string[] = []
  if (Array.isArray(raw)) list = raw.map(String).filter(Boolean)
  else if (typeof raw === 'string' && raw !== '') list = raw.split(',').filter(Boolean)
  const normalized = [...new Set(list.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const capped = normalized.slice(0, MAX_DRIVERS)
  return capped.length > 0 ? capped.join(',') : undefined
}

/** `validateSearch` for the /dashboard route: coerce raw router search AND
 *  enforce the cascade (drivers need a session, session needs a GP, GP needs a
 *  year). A hand-truncated link like `?drivers=VER,LEC` therefore drops the
 *  orphan drivers instead of rendering the page in a broken half-selected state. */
export function validateDashboardSearch(raw: Record<string, unknown>): RawDashboardSearch {
  const year = coerceYear(raw.year)
  const gp = year != null ? coerceStr(raw.gp) : undefined
  const session = gp ? coerceStr(raw.session) : undefined
  const drivers = session ? capDriversCsv(raw.drivers) : undefined
  return {
    ...(year != null ? { year } : {}),
    ...(gp ? { gp } : {}),
    ...(session ? { session } : {}),
    ...(drivers ? { drivers } : {}),
  }
}

/**
 * Apply a single-key selection patch with the cascading reset of dependent
 * levels — the shared selector logic behind both the Dashboard's URL and the
 * Home launcher's local state. Changing an upstream level (year → GP →
 * session → drivers) clears everything below it; re-picking the SAME upstream
 * value is a no-op and returns the ORIGINAL object unchanged (referential
 * equality), so callers can `if (next === search) return` to skip a redundant
 * navigate/prewarm. Pure — no navigation, no side effects; the caller wires
 * those.
 */
export function applySelectionPatch(
  search: DashboardSearch,
  patch: Partial<DashboardSearch>,
): DashboardSearch {
  if ('year' in patch && patch.year === search.year) return search
  if ('gp' in patch && patch.gp === search.gp) return search
  if ('session' in patch && patch.session === search.session) return search

  const next: DashboardSearch = { ...search, ...patch }
  if ('year' in patch) {
    next.gp = undefined
    next.session = undefined
    next.drivers = []
  } else if ('gp' in patch) {
    next.session = undefined
    next.drivers = []
  } else if ('session' in patch) {
    next.drivers = []
  }
  return next
}

/** URL shape → component shape. */
export function fromRaw(raw: RawDashboardSearch): DashboardSearch {
  return {
    year: raw.year,
    gp: raw.gp,
    session: raw.session,
    drivers: raw.drivers ? raw.drivers.split(',').filter(Boolean).slice(0, MAX_DRIVERS) : [],
  }
}

/** Component shape → URL shape (empty fields dropped so the URL stays clean). */
export function toRaw(search: DashboardSearch): RawDashboardSearch {
  const drivers =
    search.drivers.length > 0 ? search.drivers.slice(0, MAX_DRIVERS).join(',') : undefined
  return {
    ...(search.year != null ? { year: search.year } : {}),
    ...(search.gp ? { gp: search.gp } : {}),
    ...(search.session ? { session: search.session } : {}),
    ...(drivers ? { drivers } : {}),
  }
}
