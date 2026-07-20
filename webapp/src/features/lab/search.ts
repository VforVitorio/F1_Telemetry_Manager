// URL search-param contract for the Model Lab. The bench config lives in the
// URL so a model + race moment is a shareable link: `?model=tyres&gp=Austin&
// driver=NOR&lap=18&laps=8-28`. Same raw<->component boundary as the Dashboard
// and Strategy search files.
//
// Deep links reproduce the CONFIG only, they never auto-run a model (an ML/LLM
// call, rate-limited). A shared link lands on a prefilled idle bench.
//
// The six model ids are the UI-facing rail entries. Overtake and Safety car both
// read the ONE `/situation` agent, so they share a run; the id split is purely
// which lens the bench shows. Free-text radio input NEVER enters the URL.

export const LAB_YEAR = 2025

export const MODEL_IDS = ['pace', 'tyres', 'overtake', 'safetycar', 'pit', 'radio'] as const
export type ModelId = (typeof MODEL_IDS)[number]
const DEFAULT_MODEL: ModelId = 'pace'

/** Radio bench mode: browse the corpus, or type a free message. */
export const RADIO_MODES = ['lookup', 'freetext'] as const
export type RadioMode = (typeof RADIO_MODES)[number]

/** Component-facing bench config. */
export interface LabSearch {
  model: ModelId
  gp?: string
  driver?: string
  /** Single decision lap for the per-lap models (Tyres/Overtake/SC/Pit). */
  lap?: number
  /** [start, end] lap window for the Pace batch run. */
  laps?: [number, number]
  /** Radio lookup overrides; only serialized when they differ from the page context. */
  rmode?: RadioMode
  rgp?: string
  rdrv?: string
  rlap?: number
}

/** URL / validated bench config. */
export interface RawLabSearch {
  model?: string
  gp?: string
  driver?: string
  lap?: number
  laps?: string
  rmode?: string
  rgp?: string
  rdrv?: string
  rlap?: number
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function coerceModel(raw: unknown): ModelId {
  return MODEL_IDS.includes(raw as ModelId) ? (raw as ModelId) : DEFAULT_MODEL
}

function coerceMode(raw: unknown): RadioMode | undefined {
  return RADIO_MODES.includes(raw as RadioMode) ? (raw as RadioMode) : undefined
}

function coerceInt(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : Math.round(n)
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
 * `validateSearch` for the /lab route: coerce raw router search AND enforce the
 * cascade (lap/laps/radio overrides need a driver, driver needs a GP). A
 * hand-edited link with an orphan field drops it rather than rendering a broken
 * half-selected bench.
 */
export function validateLabSearch(raw: Record<string, unknown>): RawLabSearch {
  const model = coerceModel(raw.model)
  const gp = coerceStr(raw.gp)
  const driver = gp ? coerceStr(raw.driver) : undefined
  const lap = driver ? coerceInt(raw.lap) : undefined
  const laps = driver ? parseLaps(raw.laps) : undefined
  const rmode = coerceMode(raw.rmode)
  const rgp = coerceStr(raw.rgp)
  const rdrv = rgp ? coerceStr(raw.rdrv) : undefined
  const rlap = coerceInt(raw.rlap)
  return {
    ...(model !== DEFAULT_MODEL ? { model } : {}),
    ...(gp ? { gp } : {}),
    ...(driver ? { driver } : {}),
    ...(lap != null ? { lap } : {}),
    ...(laps ? { laps: `${laps[0]}-${laps[1]}` } : {}),
    ...(rmode ? { rmode } : {}),
    ...(rgp ? { rgp } : {}),
    ...(rdrv ? { rdrv } : {}),
    ...(rlap != null ? { rlap } : {}),
  }
}

/**
 * Apply a single-key bench patch with the cascading reset of dependent levels.
 * Changing the GP clears driver/lap/laps/radio overrides; changing the driver
 * clears lap/laps. Switching model keeps the moment. Re-picking the SAME value
 * is a no-op returning the ORIGINAL object (so callers can `if (next === search)
 * return`). Pure.
 */
export function applyLabPatch(search: LabSearch, patch: Partial<LabSearch>): LabSearch {
  if ('model' in patch && patch.model === search.model) return search
  if ('gp' in patch && patch.gp === search.gp) return search
  if ('driver' in patch && patch.driver === search.driver) return search
  if ('lap' in patch && patch.lap === search.lap) return search

  const next: LabSearch = { ...search, ...patch }
  if ('gp' in patch) {
    next.driver = undefined
    next.lap = undefined
    next.laps = undefined
    next.rgp = undefined
    next.rdrv = undefined
    next.rlap = undefined
  } else if ('driver' in patch) {
    next.lap = undefined
    next.laps = undefined
  }
  return next
}

/** URL shape -> component shape. */
export function fromRaw(raw: RawLabSearch): LabSearch {
  return {
    model: coerceModel(raw.model),
    gp: raw.gp,
    driver: raw.driver,
    lap: raw.lap,
    laps: parseLaps(raw.laps),
    rmode: coerceMode(raw.rmode),
    rgp: raw.rgp,
    rdrv: raw.rdrv,
    rlap: raw.rlap,
  }
}

/** Component shape -> URL shape (empty fields + the default model dropped). */
export function toRaw(search: LabSearch): RawLabSearch {
  return {
    ...(search.model !== DEFAULT_MODEL ? { model: search.model } : {}),
    ...(search.gp ? { gp: search.gp } : {}),
    ...(search.driver ? { driver: search.driver } : {}),
    ...(search.lap != null ? { lap: search.lap } : {}),
    ...(search.laps ? { laps: `${search.laps[0]}-${search.laps[1]}` } : {}),
    ...(search.rmode ? { rmode: search.rmode } : {}),
    ...(search.rgp ? { rgp: search.rgp } : {}),
    ...(search.rdrv ? { rdrv: search.rdrv } : {}),
    ...(search.rlap != null ? { rlap: search.rlap } : {}),
  }
}
