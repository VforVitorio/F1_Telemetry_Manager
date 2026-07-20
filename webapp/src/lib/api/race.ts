// Race Analysis API types + typed fetchers. The backend ships almost no response
// models, so the generated OpenAPI schema types these bodies as `unknown` (and
// the strategy POSTs as `{agent, result: Record}`). We hand-write the real shapes
// here — one place, so every consumer gets real types — and narrow the `unknown`
// at the boundary, exactly like lib/api/comparison.ts. All six endpoints already
// exist; there is no backend work.
//
// --- WHERE TO CHANGE IF THE BACKEND CONTRACT CHANGES ---
// GET  /telemetry/race-data          backend/api/v1/endpoints/telemetry.py (race-data, 26 cols)
// GET  /strategy/radio-available-gps  backend/api/v1/endpoints/strategy.py
// GET  /strategy/radio-laps           strategy.py  (laps[] carry transcript previews)
// POST /strategy/radio                strategy.py  (transcript goes IN radio_msgs; never send `source`)
// POST /strategy/rag                  strategy.py  (cite from `articles`, not the answer prose)

import { api } from './client'

export const RACE_YEAR = 2025

/** HTTP failure from any Race endpoint, carrying the status so the page can show
 *  a tailored message (404 = not found, 429 = RAG rate-limited). */
export class RaceApiError extends Error {
  readonly status: number
  readonly body?: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'RaceApiError'
    this.status = status
    this.body = body
  }
}

// ── Narrowing helpers ────────────────────────────────────────────────────────

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}
function str(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}
function numOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && !Number.isNaN(raw) ? raw : null
}
function bool(raw: unknown): boolean {
  return raw === true
}

// ── /telemetry/race-data ─────────────────────────────────────────────────────

/** One row of the featured race parquet (the 26 columns the ML models trained
 *  on). Numbers are `number | null` — the backend sanitises NaN → null. */
export interface RaceRecord {
  Driver: string
  DriverNumber: number | null
  LapNumber: number | null
  Stint: number | null
  SpeedI1: number | null
  SpeedI2: number | null
  SpeedFL: number | null
  SpeedST: number | null
  Compound: string
  TyreLife: number | null
  TyreAge: number | null
  FreshTyre: boolean
  Team: string
  Position: number | null
  CompoundID: number | null
  LapTime_s: number | null
  FuelLoad: number | null
  FuelAdjustedLapTime: number | null
  FuelAdjustedDegAbsolute: number | null
  FuelAdjustedDegPercent: number | null
  DegradationRate: number | null
  AirTemp: number | null
  TrackTemp: number | null
  GP_Name: string
  GapToCarAhead: number | null
  GapToCarBehind: number | null
  consistent_gap_ahead_laps: number | null
  consistent_gap_behind_laps: number | null
}

function toRaceRecord(raw: unknown): RaceRecord {
  const d = asRecord(raw)
  return {
    Driver: str(d.Driver),
    DriverNumber: numOrNull(d.DriverNumber),
    LapNumber: numOrNull(d.LapNumber),
    Stint: numOrNull(d.Stint),
    SpeedI1: numOrNull(d.SpeedI1),
    SpeedI2: numOrNull(d.SpeedI2),
    SpeedFL: numOrNull(d.SpeedFL),
    SpeedST: numOrNull(d.SpeedST),
    Compound: str(d.Compound),
    TyreLife: numOrNull(d.TyreLife),
    TyreAge: numOrNull(d.TyreAge),
    FreshTyre: bool(d.FreshTyre),
    Team: str(d.Team),
    Position: numOrNull(d.Position),
    CompoundID: numOrNull(d.CompoundID),
    LapTime_s: numOrNull(d.LapTime_s),
    FuelLoad: numOrNull(d.FuelLoad),
    FuelAdjustedLapTime: numOrNull(d.FuelAdjustedLapTime),
    FuelAdjustedDegAbsolute: numOrNull(d.FuelAdjustedDegAbsolute),
    FuelAdjustedDegPercent: numOrNull(d.FuelAdjustedDegPercent),
    DegradationRate: numOrNull(d.DegradationRate),
    AirTemp: numOrNull(d.AirTemp),
    TrackTemp: numOrNull(d.TrackTemp),
    GP_Name: str(d.GP_Name),
    GapToCarAhead: numOrNull(d.GapToCarAhead),
    GapToCarBehind: numOrNull(d.GapToCarBehind),
    consistent_gap_ahead_laps: numOrNull(d.consistent_gap_ahead_laps),
    consistent_gap_behind_laps: numOrNull(d.consistent_gap_behind_laps),
  }
}

/** Whole-field race frame for a GP (~1-3 MB). Fetched once, filtered client-side.
 *  `driver` narrows server-side but is normally omitted (we want the full field). */
export async function fetchRaceData(
  gp: string,
  driver?: string,
  signal?: AbortSignal,
): Promise<RaceRecord[]> {
  const { data, error, response } = await api.GET('/api/v1/telemetry/race-data', {
    params: { query: { year: RACE_YEAR, gp, ...(driver ? { driver } : {}) } },
    signal,
  })
  if (error || !data) throw toRaceError(error, response, 'Race data')
  const rows = (data as { race_data?: unknown }).race_data
  return Array.isArray(rows) ? rows.map(toRaceRecord) : []
}

// ── Radio corpus (GETs) ──────────────────────────────────────────────────────

/** GPs (2025) that have a team-radio corpus — badges the GP combobox. */
export async function fetchRadioAvailableGps(signal?: AbortSignal): Promise<string[]> {
  const { data, error, response } = await api.GET('/api/v1/strategy/radio-available-gps', {
    params: { query: { year: RACE_YEAR } },
    signal,
  })
  if (error || !data) throw toRaceError(error, response, 'Radio GPs')
  const gps = (data as { gps?: unknown }).gps
  return Array.isArray(gps) ? gps.map(String) : []
}

/** One radio message in the browser: the preview `text` is already here — no need
 *  to pick a lap number blind. `has_transcript=false` = audio only (not analysable). */
export interface RadioLap {
  lap: number
  text: string
  has_transcript: boolean
  audio_path: string | null
}
export interface RadioDriver {
  driver: string
  driver_number: number | null
  laps: RadioLap[]
}

function toRadioDriver(raw: unknown): RadioDriver {
  const d = asRecord(raw)
  const laps = Array.isArray(d.laps) ? d.laps : []
  return {
    driver: str(d.driver),
    driver_number: numOrNull(d.driver_number),
    laps: laps.map((l) => {
      const r = asRecord(l)
      return {
        lap: numOrNull(r.lap) ?? 0,
        text: str(r.text),
        has_transcript: bool(r.has_transcript),
        audio_path: typeof r.audio_path === 'string' ? r.audio_path : null,
      }
    }),
  }
}

export async function fetchRadioLaps(
  gp: string,
  driver?: string,
  signal?: AbortSignal,
): Promise<RadioDriver[]> {
  const { data, error, response } = await api.GET('/api/v1/strategy/radio-laps', {
    params: { query: { year: RACE_YEAR, gp, ...(driver ? { driver } : {}) } },
    signal,
  })
  if (error || !data) throw toRaceError(error, response, 'Radio laps')
  const drivers = (data as { drivers?: unknown }).drivers
  return Array.isArray(drivers) ? drivers.map(toRadioDriver) : []
}

// ── POST /strategy/radio (NLP analysis) ──────────────────────────────────────

export interface RadioEntity {
  text: string
  label: string
}
export interface RadioAnalysis {
  sentiment: string
  sentiment_score: number | null
  intent: string
  intent_confidence: number | null
  entities: RadioEntity[]
}
export interface RadioEvent {
  message: string
  timestamp: string | null
  analysis: RadioAnalysis
}
export interface RadioAlert {
  source: string
  intent: string
  message: string
  driver: string
}
export interface RadioCorrection {
  driver: string
  original_intent: string
  suggested_intent: string
  span: string
  reason: string
}
/** A Race Control Message the Radio Agent parsed (N23): a flag/category event
 *  the pit wall would see on the timing screen. The Streamlit tab dropped these
 *  on the floor; the Lab (and Race) surface them as flag-coloured rows. */
export interface RcmEvent {
  message: string
  flag: string
  category: string
  lap: number | null
}
export interface RadioResult {
  radio_events: RadioEvent[]
  alerts: RadioAlert[]
  reasoning: string
  corrections: RadioCorrection[]
  rcm_events: RcmEvent[]
}

/** A radio message to analyse: the transcript text goes IN — the whole point of
 *  the corpus. NEVER carries a `source` field (crashes the backend RadioMessage). */
export interface RadioMessageInput {
  driver: string
  lap: number
  text: string
}

function toRadioResult(raw: unknown): RadioResult {
  const d = asRecord(raw)
  const events = Array.isArray(d.radio_events) ? d.radio_events : []
  const alerts = Array.isArray(d.alerts) ? d.alerts : []
  const corrections = Array.isArray(d.corrections) ? d.corrections : []
  const rcmEvents = Array.isArray(d.rcm_events) ? d.rcm_events : []
  return {
    radio_events: events.map((e) => {
      const r = asRecord(e)
      const a = asRecord(r.analysis)
      const entities = Array.isArray(a.entities) ? a.entities : []
      return {
        message: str(r.message),
        timestamp: typeof r.timestamp === 'string' ? r.timestamp : null,
        analysis: {
          sentiment: str(a.sentiment),
          sentiment_score: numOrNull(a.sentiment_score),
          intent: str(a.intent),
          intent_confidence: numOrNull(a.intent_confidence),
          entities: entities.map((en) => {
            const er = asRecord(en)
            return { text: str(er.text), label: str(er.label) }
          }),
        },
      }
    }),
    alerts: alerts.map((al) => {
      const r = asRecord(al)
      return {
        source: str(r.source),
        intent: str(r.intent),
        message: str(r.message),
        driver: str(r.driver),
      }
    }),
    reasoning: str(d.reasoning),
    corrections: corrections.map((c) => {
      const r = asRecord(c)
      return {
        driver: str(r.driver),
        original_intent: str(r.original_intent),
        suggested_intent: str(r.suggested_intent),
        span: str(r.span),
        reason: str(r.reason),
      }
    }),
    rcm_events: rcmEvents.map((e) => {
      const r = asRecord(e)
      return {
        message: str(r.message),
        flag: str(r.flag),
        category: str(r.category),
        lap: numOrNull(r.lap),
      }
    }),
  }
}

/**
 * Analyse team-radio messages. Builds `radio_msgs` from the transcript (the fix
 * for the Streamlit bug that posted an empty list and analysed nothing), and
 * never sends a `source` key. `lapState` is the race moment the NLP layer reads
 * for context; the caller fetches it for the selected (gp, driver, lap).
 */
export async function analyzeRadio(
  lapState: Record<string, unknown>,
  messages: RadioMessageInput[],
  signal?: AbortSignal,
): Promise<RadioResult> {
  const body = {
    lap_state: lapState,
    radio_msgs: messages.map((m) => ({ driver: m.driver, lap: m.lap, text: m.text })),
  }
  const { data, error, response } = await api.POST('/api/v1/strategy/radio', { body, signal })
  if (error || !data) throw toRaceError(error, response, 'Radio analysis')
  return toRadioResult((data as { result?: unknown }).result)
}

// ── POST /strategy/rag (regulations) ─────────────────────────────────────────

export interface RagChunk {
  text: string
  article: string
  doc_type: string
  year: number | null
  score: number | null
}
export interface RagResult {
  question: string
  answer: string
  /** Cite from these (reliable metadata), NOT from article numbers in the prose. */
  articles: string[]
  chunks: RagChunk[]
}

function toRagResult(raw: unknown): RagResult {
  const d = asRecord(raw)
  const chunks = Array.isArray(d.chunks) ? d.chunks : []
  const articles = Array.isArray(d.articles) ? d.articles.map(String) : []
  return {
    question: str(d.question),
    answer: str(d.answer),
    articles,
    chunks: chunks.map((c) => {
      const r = asRecord(c)
      return {
        text: str(r.text),
        article: str(r.article),
        doc_type: str(r.doc_type),
        year: numOrNull(r.year),
        score: numOrNull(r.score),
      }
    }),
  }
}

/** Ask the FIA-regulations RAG. Rate-limited (burst 5) → 429 RaceApiError. */
export async function askRag(question: string, signal?: AbortSignal): Promise<RagResult> {
  const { data, error, response } = await api.POST('/api/v1/strategy/rag', {
    body: { question },
    signal,
  })
  if (error || !data) throw toRaceError(error, response, 'Regulations query')
  return toRagResult((data as { result?: unknown }).result)
}

// ── shared error mapper ──────────────────────────────────────────────────────

function toRaceError(error: unknown, response: Response | undefined, what: string): RaceApiError {
  const status = response?.status ?? 500
  const detail = (error as { detail?: unknown } | null)?.detail
  const message = typeof detail === 'string' ? detail : `${what} failed (${status})`
  return new RaceApiError(status, message, error)
}
