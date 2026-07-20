// URL search-param contract for the Race Analysis tab. Selector state lives in
// the URL so a link reproduces the whole view. Same raw↔component boundary as
// dashboard/comparison: the URL carries `drivers` as a comma string, the
// component sees an array. Differences from those tabs: no `session` (Race is
// always the 2025 featured parquet), drivers cap THREE, and extra view params —
// `tab` (which of the 5 areas), `compound` (tyre filter), `rdriver`/`rlap` (the
// selected radio message), `q` (a Regulations query to prefill).
//
// The year is a constant, not a URL param: the featured parquet only covers
// 2025. Data is fetched once per GP and filtered client-side, so there is no
// explicit "load" gate (unlike Comparison's `compare`) — picking a GP is
// deliberate enough. POSTs (radio Analyse, RAG ask) never auto-fire: a deep
// link prefills the selection, the user still presses the button.

export const RACE_YEAR = 2025
export const MAX_DRIVERS = 3

export const RACE_TABS = ['tyres', 'gaps', 'dataset', 'radio', 'regs'] as const
export type RaceTab = (typeof RACE_TABS)[number]
const DEFAULT_TAB: RaceTab = 'tyres'

/** Component-facing selection (drivers as an array, tab always concrete). */
export interface RaceSearch {
  gp?: string
  drivers: string[]
  tab: RaceTab
  /** Active compound filter on the Tyres tab (e.g. 'SOFT'), if any. */
  compound?: string
  /** Selected radio message: driver code + lap number (the Radio tab). */
  rdriver?: string
  rlap?: number
  /** A Regulations query to prefill (deep-link only; never auto-fires). */
  q?: string
}

/** URL / validated selection (drivers comma-joined). */
export interface RawRaceSearch {
  gp?: string
  drivers?: string
  tab?: RaceTab
  compound?: string
  rdriver?: string
  rlap?: number
  q?: string
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function coerceLap(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function coerceTab(raw: unknown): RaceTab {
  return RACE_TABS.includes(raw as RaceTab) ? (raw as RaceTab) : DEFAULT_TAB
}

/**
 * Normalise a raw drivers param (array or comma string) to a comma string capped
 * at THREE. Codes are upper-cased + de-duplicated so a hand-edited URL can't make
 * duplicate series or a case mismatch, and a longer link truncates gracefully.
 */
function capDriversCsv(raw: unknown): string | undefined {
  let list: string[] = []
  if (Array.isArray(raw)) list = raw.map(String).filter(Boolean)
  else if (typeof raw === 'string' && raw !== '') list = raw.split(',').filter(Boolean)
  const normalized = [...new Set(list.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const capped = normalized.slice(0, MAX_DRIVERS)
  return capped.length > 0 ? capped.join(',') : undefined
}

/**
 * `validateSearch` for /race: coerce the raw router search. `gp` gates the data
 * selection (drivers / compound / radio message are meaningless without a loaded
 * race); `tab` and `q` are independent so Regulations works with nothing loaded.
 * A radio lap needs its radio driver.
 */
export function validateRaceSearch(raw: Record<string, unknown>): RawRaceSearch {
  const gp = coerceStr(raw.gp)
  const drivers = gp ? capDriversCsv(raw.drivers) : undefined
  const tab = coerceTab(raw.tab)
  const compound = gp ? coerceStr(raw.compound)?.toUpperCase() : undefined
  const rdriver = gp ? coerceStr(raw.rdriver)?.toUpperCase() : undefined
  const rlap = gp && rdriver ? coerceLap(raw.rlap) : undefined
  const q = coerceStr(raw.q)
  return {
    ...(gp ? { gp } : {}),
    ...(drivers ? { drivers } : {}),
    tab,
    ...(compound ? { compound } : {}),
    ...(rdriver ? { rdriver } : {}),
    ...(rlap != null ? { rlap } : {}),
    ...(q ? { q } : {}),
  }
}

/**
 * Apply a single-key selection patch. The only cascade is GP: changing the race
 * clears the drivers, the compound filter, and the selected radio message (they
 * belonged to the old race). Re-picking the SAME GP is a no-op returning the
 * ORIGINAL object (referential equality) so callers can `if (next === s) return`.
 * `tab` and `q` never cascade. Pure — no navigation, no side effects.
 */
export function applyRacePatch(search: RaceSearch, patch: Partial<RaceSearch>): RaceSearch {
  if ('gp' in patch && patch.gp === search.gp) return search

  const next: RaceSearch = { ...search, ...patch }
  if ('gp' in patch) {
    next.drivers = []
    next.compound = undefined
    next.rdriver = undefined
    next.rlap = undefined
  } else if ('drivers' in patch) {
    next.drivers = next.drivers.slice(0, MAX_DRIVERS)
  }
  return next
}

/** URL shape → component shape. */
export function fromRaw(raw: RawRaceSearch): RaceSearch {
  return {
    gp: raw.gp,
    drivers: raw.drivers ? raw.drivers.split(',').filter(Boolean).slice(0, MAX_DRIVERS) : [],
    tab: raw.tab ?? DEFAULT_TAB,
    compound: raw.compound,
    rdriver: raw.rdriver,
    rlap: raw.rlap,
    q: raw.q,
  }
}

/** Component shape → URL shape (empty fields dropped so the URL stays clean; the
 *  default tab is omitted too). */
export function toRaw(search: RaceSearch): RawRaceSearch {
  const drivers =
    search.drivers.length > 0 ? search.drivers.slice(0, MAX_DRIVERS).join(',') : undefined
  return {
    ...(search.gp ? { gp: search.gp } : {}),
    ...(drivers ? { drivers } : {}),
    ...(search.tab !== DEFAULT_TAB ? { tab: search.tab } : {}),
    ...(search.gp && search.compound ? { compound: search.compound } : {}),
    ...(search.gp && search.rdriver ? { rdriver: search.rdriver } : {}),
    ...(search.gp && search.rdriver && search.rlap != null ? { rlap: search.rlap } : {}),
    ...(search.q ? { q: search.q } : {}),
  }
}

/** True once a race is loaded (its data tabs — Tyres/Gaps/Dataset — can render).
 *  Radio needs only the GP too; Regulations needs nothing. */
export function hasRace(search: RaceSearch): boolean {
  return !!search.gp
}
