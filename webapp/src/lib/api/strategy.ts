// Strategy API types + raw-fetch client for the N25-N31 multi-agent pipeline.
//
// The strategy endpoints return `{ agent, result: Dict[str, Any] }` — the
// backend ships no response models, so the generated OpenAPI schema types every
// body as `unknown`. We hand-write the result shapes here (one place, so every
// consumer gets real types) and unwrap the envelope. Requests go through a thin
// raw `fetch` (same base-URL handling as the telemetry client): same-origin via
// the Vite proxy / nginx, or VITE_API_BASE for a split origin.
//
// --- WHERE TO CHANGE IF THE BACKEND CONTRACT CHANGES ---
// backend/api/v1/endpoints/strategy.py   (endpoints + request bodies)
// src/agents/strategy_orchestrator.py:319 (StrategyRecommendation v2 schema)
// The 4 agent result shapes mirror the PaceResult/TireResult/SituationResult/
// PitResult Pydantic models in strategy.py.

// ── Enums (mirror the orchestrator's Literal fields) ────────────────────────

/** Discrete v2 action. `ALERT` is new in v2; `EXTEND_STINT` was removed. */
export type StrategyAction = 'STAY_OUT' | 'PIT_NOW' | 'UNDERCUT' | 'OVERCUT' | 'ALERT'
export type PaceMode = 'PUSH' | 'NEUTRAL' | 'MANAGE' | 'LIFT_AND_COAST'
export type RiskPosture = 'AGGRESSIVE' | 'BALANCED' | 'DEFENSIVE'
export type StrategyCompound = 'SOFT' | 'MEDIUM' | 'HARD'
export type ContingencyPriority = 'HIGH' | 'MEDIUM' | 'LOW'

// ── lap_state (GET /lap-state) ──────────────────────────────────────────────

/** Our driver — full telemetry (single-driver boundary: rivals get less). */
export interface LapStateDriver {
  driver: string
  team: string
  lap_number: number
  lap_time_s: number
  position: number
  compound: string
  compound_id: number
  tyre_life: number
  stint: number
  fresh_tyre: boolean
  speed_i1: number
  speed_i2: number
  speed_fl: number
  speed_st: number
  fuel_load: number
  driver_number: number
  sector1_s: number
  sector2_s: number
  sector3_s: number
  gap_ahead_s: number
}

/** A rival — timing-screen data only (mirrors a real pit wall). */
export interface LapStateRival {
  driver: string
  team: string
  position: number
  lap_time_s: number
  compound: string
  tyre_life: number
  gap_ahead_s: number
  /** On-track interval to OUR driver (rival elapsed time minus ours): sign
   *  encodes ahead/behind, magnitude is the gap. Null when either car's elapsed
   *  time is missing. Used to score a user-chosen rival against our car. */
  interval_to_driver_s?: number | null
}

export interface Weather {
  air_temp: number
  track_temp: number
  humidity: number
  rainfall: number
}

export interface SessionMeta {
  gp_name: string
  year: number
  driver: string
  team: string
  total_laps: number
}

/** The canonical lap_state dict — the single contract passed to every agent. */
export interface LapState {
  lap_number: number
  driver: LapStateDriver
  rivals: LapStateRival[]
  weather: Weather
  session_meta: SessionMeta
}

// ── Sub-agent result shapes (POST /pace|/tire|/situation|/pit) ──────────────

export interface PaceResult {
  lap_time_pred: number
  delta_vs_prev: number
  delta_vs_median: number
  ci_p10: number
  ci_p90: number
  reasoning: string
}

export interface TireResult {
  compound: string
  current_tyre_life: number
  deg_rate: number
  laps_to_cliff_p10: number
  laps_to_cliff_p50: number
  laps_to_cliff_p90: number
  warning_level: string
  reasoning: string
}

export interface SituationResult {
  overtake_prob: number
  sc_prob_3lap: number
  threat_level: string
  gap_ahead_s: number
  pace_delta_s: number
  reasoning: string
  // Real safety-car / virtual-safety-car state the agent already returns; the
  // Lab's SituationFacts strip surfaces them (both default to false if absent).
  sc_currently_active: boolean
  vsc_active: boolean
}

export interface PitResult {
  action: string
  recommended_lap: number | null
  compound_recommendation: string
  stop_duration_p05: number
  stop_duration_p50: number
  stop_duration_p95: number
  undercut_prob: number | null
  undercut_target: string | null
  sc_reactive: boolean
  reasoning: string
}

/** Which sub-agent an AgentTab fetches. Maps 1:1 to a POST /strategy/<name>. */
export type AgentName = 'pace' | 'tire' | 'situation' | 'pit'

export interface AgentResultMap {
  pace: PaceResult
  tire: TireResult
  situation: SituationResult
  pit: PitResult
}

// ── Orchestrator v2 recommendation (POST /recommend) ────────────────────────

/** One Monte-Carlo scored strategy candidate. */
export interface ScenarioScore {
  E: number
  P10: number
  P90: number
  score: number
}

/** A conditional branch the LLM planned for upcoming laps (IF trigger → action). */
export interface Contingency {
  trigger: string
  /** Replacement action — same 5-value enum as the primary action. */
  switch_to: StrategyAction
  priority: ContingencyPriority
  rationale: string
}

/**
 * The 14-field v2 recommendation. Every Optional field renders CONDITIONALLY —
 * a no-LLM run (or a sparse response) omits most of them, so consumers must be
 * null-tolerant throughout. `scenario_scores` and `regulation_context` are
 * attached in code after the LLM call (always present, possibly empty).
 */
export interface StrategyRecommendation {
  action: StrategyAction
  reasoning: string
  confidence: number
  pit_lap_target?: number | null
  compound_next?: StrategyCompound | null
  undercut_target?: string | null
  pace_mode: PaceMode
  target_lap_time_s?: number | null
  risk_posture: RiskPosture
  contingencies: Contingency[]
  key_risks: string[]
  expected_stint_end?: number | null
  scenario_scores: Record<string, ScenarioScore>
  regulation_context: string
}

/** Request body for POST /recommend (mirrors RecommendRequest). */
export interface RecommendRequest {
  lap_state: LapState
  gp_name?: string
  year?: number
  gap_ahead_s?: number
  pace_delta_s?: number
  risk_tolerance?: number
  /** Three-letter code of the user-chosen rival. When set, the backend measures
   *  gap_ahead_s / pace_delta_s against this car instead of the positional car
   *  ahead (#431). Omitted keeps the default behaviour. */
  rival?: string
}

// ── Error type — carries HTTP status so the UI can branch (404/422/429/500) ──

/** Structured error payload from the strategy endpoints (`_agent_error`). */
export interface StrategyErrorBody {
  error: string
  agent: string
  detail: string
}

export class StrategyApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'StrategyApiError'
    this.status = status
    this.body = body
  }
  /** True for the 5/min rate limit on /recommend and /rag. */
  get isRateLimited(): boolean {
    return this.status === 429
  }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

const YEAR = 2025

function base(): string {
  return import.meta.env.VITE_API_BASE ?? ''
}

/** Extract a human message from FastAPI's `{detail}` (string or structured). */
function messageFromBody(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    return String((detail as StrategyErrorBody).detail)
  }
  return `Request failed (${status})`
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new StrategyApiError(res.status, messageFromBody(res.status, body), body)
  return body as T
}

async function getJson<T>(path: string, query: Record<string, string | number>): Promise<T> {
  const params = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString()
  const res = await fetch(`${base()}/api/v1/strategy/${path}?${params}`)
  return parseOrThrow<T>(res)
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${base()}/api/v1/strategy/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return parseOrThrow<T>(res)
}

/** Every strategy endpoint wraps its payload as `{ agent, result }`. */
interface Envelope<T> {
  agent: string
  result: T
}

// ── Client functions ────────────────────────────────────────────────────────

export async function fetchStrategyGps(year = YEAR): Promise<string[]> {
  const data = await getJson<{ gps?: string[] }>('available-gps', { year })
  return data.gps ?? []
}

export async function fetchStrategyDrivers(gp: string, year = YEAR): Promise<string[]> {
  const data = await getJson<{ drivers?: string[] }>('available-drivers', { gp, year })
  return data.drivers ?? []
}

export interface LapRange {
  min_lap: number
  max_lap: number
}

export async function fetchLapRange(gp: string, driver: string, year = YEAR): Promise<LapRange> {
  return getJson<LapRange>('lap-range', { gp, driver, year })
}

export async function fetchLapState(
  gp: string,
  driver: string,
  lap: number,
  year = YEAR,
): Promise<LapState> {
  return getJson<LapState>('lap-state', { gp, driver, lap, year })
}

/** Run one sub-agent for a lap state (pure ML — no LLM, no rate limit). */
export async function runAgent<A extends AgentName>(
  agent: A,
  lapState: LapState,
): Promise<AgentResultMap[A]> {
  const data = await postJson<Envelope<AgentResultMap[A]>>(agent, { lap_state: lapState })
  return data.result
}

/**
 * Run the full N31 orchestrator (all sub-agents + 500-sample MC + LLM synthesis).
 * Rate-limited to 5/min on the backend → surfaces as a 429 StrategyApiError.
 * `gap_ahead_s` defaults to the driver's own gap (2.0 fallback, as Streamlit).
 *
 * When `rival` is set (the car the user picked in the Strategy tab), the backend
 * recomputes gap_ahead_s / pace_delta_s against that specific car, so the
 * recommendation is framed around the duel the user asked about (#431). Without
 * it the request behaves exactly as before.
 */
export async function runRecommend(
  lapState: LapState,
  riskTolerance: number,
  rival?: string,
  signal?: AbortSignal,
): Promise<StrategyRecommendation> {
  const body: RecommendRequest = {
    lap_state: lapState,
    gp_name: lapState.session_meta.gp_name,
    year: lapState.session_meta.year,
    gap_ahead_s: lapState.driver.gap_ahead_s || 2.0,
    pace_delta_s: 0,
    risk_tolerance: riskTolerance,
    rival,
  }
  const data = await postJson<Envelope<StrategyRecommendation>>('recommend', body, signal)
  return data.result
}

/** One lap on the pace trajectory (POST /pace-range): actual vs model-predicted
 *  lap time with its bootstrap CI, plus the compound/stint for banding. `actual`
 *  / `pred` / the CI bounds are null for laps the model can't score (a stint's
 *  first lap, or a lap with no valid previous lap). */
export interface PaceRangePoint {
  lap: number
  actual: number | null
  pred: number | null
  ci_p10: number | null
  ci_p90: number | null
  compound: string
  stint: number
}

/**
 * Batch pace predictions across a lap window — the Race Trace's data. Pure ML
 * (no LLM, no orchestrator), so it's cheap; fetch the driver's WHOLE window once
 * and slice client-side rather than refetching as the evidence window changes.
 * Note: unlike the agent endpoints this returns `{ predictions }` directly, not
 * the `{ agent, result }` envelope.
 */
export async function fetchPaceRange(
  gp: string,
  driver: string,
  lapStart: number,
  lapEnd: number,
  year = YEAR,
  signal?: AbortSignal,
): Promise<PaceRangePoint[]> {
  const body = { year, gp, driver, lap_start: lapStart, lap_end: lapEnd }
  const data = await postJson<{ predictions?: PaceRangePoint[] }>('pace-range', body, signal)
  return data.predictions ?? []
}

/** One lap on the tyre-degradation trajectory (POST /tire-range): the ACTUAL
 *  fuel-adjusted degradation (the TCN's training target) and the model's
 *  PREDICTED value per lap. `actual`/`pred` are null for laps the model can't
 *  score. Laps dropped from the featured parquet (Safety Car / out laps) are
 *  simply absent, so the lines break there. */
export interface TireRangePoint {
  lap: number
  actual: number | null
  pred: number | null
  compound: string
  tyre_life: number
}

/**
 * Actual vs TCN-predicted tyre degradation across a lap window — the Tyres
 * agent-tab chart. Pure ML (no LLM); fetch the driver's full window once and
 * slice client-side, like `fetchPaceRange`.
 */
export async function fetchTireRange(
  gp: string,
  driver: string,
  lapStart: number,
  lapEnd: number,
  year = YEAR,
  signal?: AbortSignal,
): Promise<TireRangePoint[]> {
  const body = { year, gp, driver, lap_start: lapStart, lap_end: lapEnd }
  const data = await postJson<{ predictions?: TireRangePoint[] }>('tire-range', body, signal)
  return data.predictions ?? []
}
