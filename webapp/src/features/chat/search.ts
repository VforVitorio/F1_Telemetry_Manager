// URL search-param contract for the Chat tab. `c` is the active chat id so a
// link reproduces which conversation is open; `mode` reserves the text/voice
// toggle for Voice (#40) — Chat only ever runs `text` today, but the sidebar
// shows the toggle with Voice disabled so the seam exists from day one; `ask`
// is a deep-link prefill (another tab handing the user off to the assistant
// with a question already typed) that NEVER auto-fires, same grammar as
// Race's `q` (features/race/search.ts:14-15, RegulationsPanel's
// `initialQuestion`) — the composer is seeded with the text, the user still
// presses Send.
//
// Unlike Race/Lab, none of these three keys cascade off each other, so there
// is no `applyChatPatch` helper here — a plain object patch is enough.

export const CHAT_MODES = ['text', 'voice'] as const
export type ChatMode = (typeof CHAT_MODES)[number]
const DEFAULT_MODE: ChatMode = 'text'

/** Component-facing selection. */
export interface ChatSearch {
  c?: string
  mode: ChatMode
  ask?: string
}

/** URL / validated selection. */
export interface RawChatSearch {
  c?: string
  mode?: ChatMode
  ask?: string
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function coerceMode(raw: unknown): ChatMode {
  return CHAT_MODES.includes(raw as ChatMode) ? (raw as ChatMode) : DEFAULT_MODE
}

/** `validateSearch` for /chat: coerce the raw router search. */
export function validateChatSearch(raw: Record<string, unknown>): RawChatSearch {
  const c = coerceStr(raw.c)
  const mode = coerceMode(raw.mode)
  const ask = coerceStr(raw.ask)
  return {
    ...(c ? { c } : {}),
    ...(mode !== DEFAULT_MODE ? { mode } : {}),
    ...(ask ? { ask } : {}),
  }
}

/** URL shape → component shape. */
export function fromRaw(raw: RawChatSearch): ChatSearch {
  return {
    c: raw.c,
    mode: coerceMode(raw.mode),
    ask: raw.ask,
  }
}

/** Component shape → URL shape (empty fields + the default mode dropped). */
export function toRaw(search: ChatSearch): RawChatSearch {
  return {
    ...(search.c ? { c: search.c } : {}),
    ...(search.mode !== DEFAULT_MODE ? { mode: search.mode } : {}),
    ...(search.ask ? { ask: search.ask } : {}),
  }
}
