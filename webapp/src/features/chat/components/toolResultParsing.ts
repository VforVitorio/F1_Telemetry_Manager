import type {
  RadioAlert,
  RadioCorrection,
  RadioEntity,
  RadioEvent,
  RadioResult,
  RagChunk,
  RagResult,
  RcmEvent,
} from '@/lib/api/race'
import type { ScenarioScore, StrategyAction } from '@/lib/api/strategy'

// Narrowing helpers for chat tool-result payloads. The backend does not
// schema `data` per tool (`ToolResultData.data: dict[str, Any]`, verified
// against `backend/mcp_tools.py` and the agent output dataclasses it
// serializes) — every renderer below reads only the fields it needs and
// tolerates a missing or mistyped key instead of throwing. Several of these
// tools return the exact same backend model an existing HTTP endpoint
// already narrows (`lib/api/race.ts`'s `toRadioResult` / `toRagResult`), but
// those helpers are not exported from that module, so the narrowing is
// duplicated here rather than reaching into a file outside this feature.

export function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function numOrUndef(raw: unknown): number | undefined {
  return typeof raw === 'number' && !Number.isNaN(raw) ? raw : undefined
}

function strOrEmpty(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

function strOrUndef(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
}

/** True for the error envelope the chat engine builds on a failed tool call:
 *  `display_type` is forced to `'text'` and `data` collapses to just
 *  `{error}` (`chat_engine.py`'s failure branch) — the same detector the
 *  Streamlit renderer uses (`tool_result_renderer.py`'s `_looks_like_error`),
 *  checked ahead of the `display_type` switch so an error never reaches a
 *  family renderer expecting real fields. */
export function isToolError(data: Record<string, unknown>): boolean {
  return 'error' in data && Object.keys(data).length <= 2
}

export function toolErrorMessage(data: Record<string, unknown>): string {
  return strOrEmpty(data.error) || 'The tool call failed.'
}

// ── predict_pace (metrics) ──────────────────────────────────────────────────

export interface PaceMetrics {
  lapTimePred?: number
  deltaVsPrev?: number
  deltaVsMedian?: number
  ciP10?: number
  ciP90?: number
}

/** Fields of `PaceOutput` (`src/agents/pace_agent.py`), serialized as-is. */
export function toPaceMetrics(data: Record<string, unknown>): PaceMetrics {
  return {
    lapTimePred: numOrUndef(data.lap_time_pred),
    deltaVsPrev: numOrUndef(data.delta_vs_prev),
    deltaVsMedian: numOrUndef(data.delta_vs_median),
    ciP10: numOrUndef(data.ci_p10),
    ciP90: numOrUndef(data.ci_p90),
  }
}

// ── predict_situation (metrics) ─────────────────────────────────────────────

export interface SituationMetrics {
  overtakeProb?: number
  scProb3Lap?: number
  threatLevel?: string
}

/** Fields of `RaceSituationOutput` (`src/agents/race_situation_agent.py`). */
export function toSituationMetrics(data: Record<string, unknown>): SituationMetrics {
  return {
    overtakeProb: numOrUndef(data.overtake_prob),
    scProb3Lap: numOrUndef(data.sc_prob_3lap),
    threatLevel: strOrUndef(data.threat_level),
  }
}

// ── predict_tire (strategy_card) ────────────────────────────────────────────

export interface TireCard {
  compound?: string
  degRate?: number
  lapsToCliffP50?: number
  warningLevel?: string
  confidence?: number
  reasoning?: string
}

/** Fields of `TireOutput` (`src/agents/tire_agent.py`). `confidence` is NOT
 *  one of that dataclass's fields today — it is read defensively so the dial
 *  appears automatically the moment the backend starts sending one, instead
 *  of assuming a field that does not exist yet. */
export function toTireCard(data: Record<string, unknown>): TireCard {
  return {
    compound: strOrUndef(data.compound),
    degRate: numOrUndef(data.deg_rate),
    lapsToCliffP50: numOrUndef(data.laps_to_cliff_p50),
    warningLevel: strOrUndef(data.warning_level),
    confidence: numOrUndef(data.confidence),
    reasoning: strOrUndef(data.reasoning),
  }
}

// ── predict_pit (strategy_card) ─────────────────────────────────────────────

export interface PitCard {
  stopDurationP50?: number
  undercutProb?: number
  recommendedLap?: number
  reasoning?: string
}

/** Fields of `PitStrategyOutput` (`src/agents/pit_strategy_agent.py`). */
export function toPitCard(data: Record<string, unknown>): PitCard {
  return {
    stopDurationP50: numOrUndef(data.stop_duration_p50),
    undercutProb: numOrUndef(data.undercut_prob),
    recommendedLap: numOrUndef(data.recommended_lap),
    reasoning: strOrUndef(data.reasoning),
  }
}

// ── recommend_strategy (strategy_card) ──────────────────────────────────────

function toScenarioScores(raw: unknown): Record<string, ScenarioScore> {
  const scores: Record<string, ScenarioScore> = {}
  for (const [action, value] of Object.entries(asRecord(raw))) {
    const row = asRecord(value)
    const e = numOrUndef(row.E)
    const p10 = numOrUndef(row.P10)
    const p90 = numOrUndef(row.P90)
    const score = numOrUndef(row.score)
    if (e != null && p10 != null && p90 != null && score != null) {
      scores[action] = { E: e, P10: p10, P90: p90, score }
    }
  }
  return scores
}

export interface RecommendationCard {
  action?: StrategyAction
  confidence?: number
  scenarioScores: Record<string, ScenarioScore>
  reasoning?: string
}

/** Fields of `StrategyRecommendation` (`src/agents/strategy_orchestrator.py`)
 *  this chat card actually renders — the other 10 v2 fields (pit plan,
 *  pace mode, contingencies, ...) are left for a future pass, same scope the
 *  design audit's tool mapping calls for. */
export function toRecommendationCard(data: Record<string, unknown>): RecommendationCard {
  return {
    action: strOrUndef(data.action) as StrategyAction | undefined,
    confidence: numOrUndef(data.confidence),
    scenarioScores: toScenarioScores(data.scenario_scores),
    reasoning: strOrUndef(data.reasoning),
  }
}

// ── analyze_radio (table) ───────────────────────────────────────────────────

function toRadioEntity(raw: unknown): RadioEntity {
  const r = asRecord(raw)
  return { text: strOrEmpty(r.text), label: strOrEmpty(r.label) }
}

function toRadioEvent(raw: unknown): RadioEvent {
  const r = asRecord(raw)
  const a = asRecord(r.analysis)
  const entities = Array.isArray(a.entities) ? a.entities.map(toRadioEntity) : []
  return {
    message: strOrEmpty(r.message),
    timestamp: strOrUndef(r.timestamp) ?? null,
    analysis: {
      sentiment: strOrEmpty(a.sentiment),
      sentiment_score: numOrUndef(a.sentiment_score) ?? null,
      intent: strOrEmpty(a.intent),
      intent_confidence: numOrUndef(a.intent_confidence) ?? null,
      entities,
    },
  }
}

function toRadioAlert(raw: unknown): RadioAlert {
  const r = asRecord(raw)
  return {
    source: strOrEmpty(r.source),
    intent: strOrEmpty(r.intent),
    message: strOrEmpty(r.message),
    driver: strOrEmpty(r.driver),
  }
}

function toRadioCorrection(raw: unknown): RadioCorrection {
  const r = asRecord(raw)
  return {
    driver: strOrEmpty(r.driver),
    original_intent: strOrEmpty(r.original_intent),
    suggested_intent: strOrEmpty(r.suggested_intent),
    span: strOrEmpty(r.span),
    reason: strOrEmpty(r.reason),
  }
}

function toRcmEvent(raw: unknown): RcmEvent {
  const r = asRecord(raw)
  return {
    message: strOrEmpty(r.message),
    flag: strOrEmpty(r.flag),
    category: strOrEmpty(r.category),
    lap: numOrUndef(r.lap) ?? null,
  }
}

/** Narrows a chat tool-result payload into the same `RadioResult` shape the
 *  `/strategy/radio` HTTP endpoint returns — `analyze_radio` serializes the
 *  identical `RadioOutput` dataclass (`src/agents/radio_agent.py`), so the
 *  chat tab can render it with the exact card Race and Lab already ship. */
export function toRadioResultData(data: Record<string, unknown>): RadioResult {
  return {
    radio_events: Array.isArray(data.radio_events) ? data.radio_events.map(toRadioEvent) : [],
    alerts: Array.isArray(data.alerts) ? data.alerts.map(toRadioAlert) : [],
    reasoning: strOrEmpty(data.reasoning),
    corrections: Array.isArray(data.corrections) ? data.corrections.map(toRadioCorrection) : [],
    rcm_events: Array.isArray(data.rcm_events) ? data.rcm_events.map(toRcmEvent) : [],
  }
}

// ── query_regulations (text) ────────────────────────────────────────────────

function toRagChunk(raw: unknown): RagChunk {
  const r = asRecord(raw)
  return {
    text: strOrEmpty(r.text),
    article: strOrEmpty(r.article),
    doc_type: strOrEmpty(r.doc_type),
    year: numOrUndef(r.year) ?? null,
    score: numOrUndef(r.score) ?? null,
  }
}

/** Narrows a chat tool-result payload into `RagResult` — `query_regulations`
 *  serializes the same `RegulationContext` dataclass the `/strategy/rag`
 *  endpoint returns (`src/agents/rag_agent.py`), minus the `question` field
 *  (the tool never echoes the question back; it defaults to an empty
 *  string, which `RagAnswerCard` never reads anyway). */
export function toRagResultData(data: Record<string, unknown>): RagResult {
  return {
    question: strOrEmpty(data.question),
    answer: strOrEmpty(data.answer),
    articles: stringArray(data.articles),
    chunks: Array.isArray(data.chunks) ? data.chunks.map(toRagChunk) : [],
  }
}

// ── list_available_gps / list_available_drivers (text) ─────────────────────

/** `{"gps": [...]}` or `{"drivers": [...]}` — the exact shape
 *  `available_gps` / `available_drivers` return (`backend/api/v1/endpoints/
 *  strategy.py`). */
export function toStringChips(data: Record<string, unknown>, key: 'gps' | 'drivers'): string[] {
  return stringArray(data[key])
}

// ── get_lap_range (text) ────────────────────────────────────────────────────

export interface LapRange {
  minLap?: number
  maxLap?: number
}

/** `{"min_lap": n, "max_lap": n}` — the exact shape `lap_range` returns
 *  (`backend/api/v1/endpoints/strategy.py`); there is no `total_laps` key. */
export function toLapRange(data: Record<string, unknown>): LapRange {
  return { minLap: numOrUndef(data.min_lap), maxLap: numOrUndef(data.max_lap) }
}
