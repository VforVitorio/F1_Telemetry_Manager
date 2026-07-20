import { createParser, type EventSourceMessage } from 'eventsource-parser'

// --- WHERE TO CHANGE IF THE STREAMING TRANSPORT CHANGES ---
// This is the single, transport-generic SSE reader. The chat stream
// (POST /api/v1/chat/tool-message-stream), the strategy-simulate stream, and a
// future WebSocket live-timing feed all consume the same { event, data } frames,
// so their per-feature dispatchers (chat → EChartsOption, etc.) live in the
// feature, not here.

export interface SseHandlers {
  /** Fired once per parsed SSE frame: { event?, data, id? }. */
  onEvent: (message: EventSourceMessage) => void
  /** Non-abort transport/parse errors. Aborts (Stop button) are swallowed. */
  onError?: (error: unknown) => void
  /** AbortController signal so the caller can Stop an in-flight stream. */
  signal?: AbortSignal
}

/** A non-ok HTTP response from an SSE POST, carrying the real status code so a
 *  caller can special-case it (e.g. a 429 rate-limit Toast) instead of parsing
 *  it back out of the error message string. */
export class SseError extends Error {
  readonly status: number
  constructor(status: number, statusText: string) {
    super(`SSE request failed: ${status} ${statusText}`)
    this.name = 'SseError'
    this.status = status
  }
}

/**
 * POST a JSON body and stream the Server-Sent-Events response.
 *
 * Native `EventSource` cannot issue a POST, so we stream the `fetch` body and
 * feed each chunk to `eventsource-parser`, which reassembles frames split across
 * network chunks. Resolves when the stream ends; rejects on a real transport
 * error (never on a user abort).
 */
export async function postStream(
  path: string,
  body: unknown,
  { onEvent, onError, signal }: SseHandlers,
): Promise<void> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok || !response.body) {
      throw new SseError(response.status, response.statusText)
    }

    const parser = createParser({ onEvent })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }
    } finally {
      // Release the connection on any exit (done, throw, or abort) so a throwing
      // downstream handler can't leave a zombie SSE stream open on the backend.
      await reader.cancel().catch(() => {})
    }
  } catch (error) {
    if (signal?.aborted) return // user pressed Stop; not an error
    onError?.(error)
    throw error
  }
}
