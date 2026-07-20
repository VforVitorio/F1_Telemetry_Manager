// Chat API types + the SSE-turn sender. The backend has no typed OpenAPI shape
// for the SSE frames themselves (they are `event: X\ndata: {...}\n\n` text, not
// a JSON response body), so this module hand-writes the wire contract exactly
// like lib/api/race.ts hand-writes the strategy endpoints' real shapes — the
// generated schema.ts only covers the non-streaming chat endpoints.
//
// --- WHERE TO CHANGE IF THE BACKEND CONTRACT CHANGES ---
// POST /chat/tool-message-stream   backend/api/v1/endpoints/chat.py (SSE framing)
// Event sequence + stream_tokens   backend/services/chatbot/chat_engine.py (stream_response)
// ToolMessageRequest fields        backend/models/tool_schemas.py
// Wire-history / context pruning   backend/services/chatbot/llm_service.py (build_messages)
//   (only reads chat_history text entries + context.{year,grand_prix,session,drivers})

import type { EventSourceMessage } from 'eventsource-parser'
import { postStream } from './sse'

export type DisplayType = 'metrics' | 'strategy_card' | 'table' | 'chart' | 'text'

/** One tool's structured output, exactly as chat_engine._build_tool_result_payload
 *  builds it. `data` is tool-shaped, not schema'd (ToolResultData.data is a bare
 *  dict server-side) — a display_type-specific renderer narrows it per
 *  `tool_name`; this foundation sprint only needs to carry it opaquely through
 *  to a thin JSON-disclosure placeholder. */
export interface ToolResult {
  tool_name: string
  display_type: DisplayType
  data: Record<string, unknown>
  summary: string
}

/** The only context keys `build_messages` reads (llm_service.py:474-483) — the
 *  backend silently ignores anything else, so widening this shape would just
 *  be dead weight on the wire. */
export interface ChatContextPayload {
  year?: number
  grand_prix?: string
  session?: string
  drivers?: string[]
}

/**
 * One wire-history entry. TEXT ONLY by construction (design-audit #39 finding
 * 4.3): Streamlit's history also carries `tool_result` and `image` entries, and
 * the image one LEAKS raw base64 into the LLM prompt because `build_messages`
 * only filters on `type != 'tool_result'`, never on `type == 'image'` — and
 * `ToolMessageRequest` has no server-side history validator to catch it
 * (unlike `ChatRequest`, `chat_models.py:43-63`). Since this shape cannot
 * represent an image or a tool result at all, that leak cannot be
 * reintroduced by accident on the client side either.
 */
export interface WireChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolMessageRequestBody {
  text: string
  image?: string
  chat_history?: WireChatMessage[]
  context?: ChatContextPayload
  model?: string
  temperature?: number
  max_tokens?: number
  /** Stream the tool-summary reply as live token deltas instead of one
   *  full-text event (backend B2, default False server-side so Streamlit stays
   *  on today's behaviour). `sendChatTurn` always requests it — real streaming
   *  is the whole point of the Chat tab's SSE migration (see the module
   *  docstring on `chat_engine.py`). */
  stream_tokens?: boolean
}

/** One parsed SSE frame, tagged by the wire `event` name. Mirrors the raw
 *  `{event, data}` frame shape so a consumer switches on `.event` the same way
 *  it would read the wire, just with `data` already parsed and narrowed. */
export type ChatStreamEvent =
  | { event: 'stage'; stage: string }
  | { event: 'tool_result'; toolResult: ToolResult }
  | { event: 'token'; token: string }
  | { event: 'done'; llmModel?: string; tokensUsed?: number; error?: string }

export interface ChatStreamHandlers {
  onEvent: (event: ChatStreamEvent) => void
  onError?: (error: unknown) => void
  signal?: AbortSignal
}

// ── Narrowing helpers ────────────────────────────────────────────────────────

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}
function str(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}
function strOrUndef(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}
function numOrUndef(raw: unknown): number | undefined {
  return typeof raw === 'number' && !Number.isNaN(raw) ? raw : undefined
}

const DISPLAY_TYPES: readonly DisplayType[] = [
  'metrics',
  'strategy_card',
  'table',
  'chart',
  'text',
]

function toToolResult(raw: unknown): ToolResult | null {
  const d = asRecord(raw)
  const displayType = DISPLAY_TYPES.includes(d.display_type as DisplayType)
    ? (d.display_type as DisplayType)
    : null
  if (!displayType || typeof d.tool_name !== 'string') return null
  return {
    tool_name: d.tool_name,
    display_type: displayType,
    data: asRecord(d.data),
    summary: str(d.summary),
  }
}

/** Parse one raw SSE frame into a typed `ChatStreamEvent`, or null for a frame
 *  this client does not understand (an unrecognised event name, or a payload
 *  missing its required fields) — dropped rather than thrown, so one bad frame
 *  cannot tear down an otherwise-good turn. */
function parseChatFrame(message: EventSourceMessage): ChatStreamEvent | null {
  let payload: Record<string, unknown>
  try {
    payload = asRecord(JSON.parse(message.data))
  } catch {
    return null
  }
  switch (message.event) {
    case 'stage':
      return typeof payload.stage === 'string' ? { event: 'stage', stage: payload.stage } : null
    case 'tool_result': {
      const toolResult = toToolResult(payload.tool_result)
      return toolResult ? { event: 'tool_result', toolResult } : null
    }
    case 'token':
      return typeof payload.token === 'string' ? { event: 'token', token: payload.token } : null
    case 'done':
      return {
        event: 'done',
        llmModel: strOrUndef(payload.llm_model),
        tokensUsed: numOrUndef(payload.tokens_used),
        error: strOrUndef(payload.error),
      }
    default:
      return null
  }
}

/**
 * Send one chat turn and stream its `stage` / `tool_result` / `token` / `done`
 * events. Thin wrapper over `postStream`: the only chat-specific work is frame
 * parsing (`parseChatFrame`) and always asking the backend for real token
 * streaming — `stream_tokens: true` unless the caller explicitly overrides it.
 */
export async function sendChatTurn(
  body: ToolMessageRequestBody,
  { onEvent, onError, signal }: ChatStreamHandlers,
): Promise<void> {
  const wireBody: ToolMessageRequestBody = { stream_tokens: true, ...body }
  return postStream('/api/v1/chat/tool-message-stream', wireBody, {
    onEvent: (message) => {
      const parsed = parseChatFrame(message)
      if (parsed) onEvent(parsed)
    },
    onError,
    signal,
  })
}

// ── Wire-history discipline (design-audit #39 finding 4.3) ──────────────────

const MAX_HISTORY_MESSAGES = 40
const MAX_MESSAGE_CHARS = 12_000

/** A minimal shape any store message satisfies — decoupled from the feature
 *  store's richer `ChatMessage` (which also carries an id, a timestamp, and an
 *  optional `toolResult`) so this module does not need to import the store's
 *  type just to describe what it reads from it. */
export interface HistorySourceMessage {
  role: 'user' | 'assistant'
  type: 'text' | 'tool_result'
  content: string
}

/**
 * Build the `chat_history` wire payload from the store's message list. TEXT
 * ONLY: `tool_result` entries are dropped (dead weight server-side anyway —
 * `build_messages` already filters them out, `llm_service.py:499`) and there is
 * no `image` variant in `WireChatMessage` to leak in the first place. Also
 * self-caps to the bounds `ChatRequest` enforces server-side but
 * `ToolMessageRequest` does not (`chat_models.py:20-21,43-63` vs
 * `tool_schemas.py:216-231`) — the SPA cannot rely on a validator that is not
 * actually wired up for this endpoint.
 */
export function buildWireHistory(messages: HistorySourceMessage[]): WireChatMessage[] {
  const textOnly = messages
    .filter((m) => m.type === 'text' && m.content.trim() !== '')
    .map((m): WireChatMessage => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
  return textOnly.slice(-MAX_HISTORY_MESSAGES)
}
