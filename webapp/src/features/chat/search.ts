// URL search-param contract for the Chat tab. `c` is the active chat id so a
// link reproduces which conversation is open; `ask` is a deep-link prefill
// (another tab handing the user off to the assistant with a question already
// typed) that NEVER auto-fires, same grammar as Race's `q`
// (features/race/search.ts:14-15, RegulationsPanel's `initialQuestion`) — the
// composer is seeded with the text, the user still presses Send.
//
// Unlike Race/Lab, neither key cascades off the other, so there is no
// `applyChatPatch` helper here — a plain object patch is enough.

/** Component-facing selection. */
export interface ChatSearch {
  c?: string
  ask?: string
}

/** URL / validated selection. */
export interface RawChatSearch {
  c?: string
  ask?: string
}

function coerceStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

/** `validateSearch` for /chat: coerce the raw router search. */
export function validateChatSearch(raw: Record<string, unknown>): RawChatSearch {
  const c = coerceStr(raw.c)
  const ask = coerceStr(raw.ask)
  return {
    ...(c ? { c } : {}),
    ...(ask ? { ask } : {}),
  }
}

/** URL shape → component shape. */
export function fromRaw(raw: RawChatSearch): ChatSearch {
  return {
    c: raw.c,
    ask: raw.ask,
  }
}

/** Component shape → URL shape (empty fields dropped). */
export function toRaw(search: ChatSearch): RawChatSearch {
  return {
    ...(search.c ? { c: search.c } : {}),
    ...(search.ask ? { ask: search.ask } : {}),
  }
}
