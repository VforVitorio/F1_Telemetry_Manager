import { describe, it, expect, vi, afterEach } from 'vitest'
import type { EventSourceMessage } from 'eventsource-parser'
import { postStream, SseError } from './sse'

// Builds a streamed SSE Response from raw chunks (chunk boundaries deliberately
// fall mid-frame to prove the parser reassembles across reads).
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('postStream', () => {
  it('reassembles event/data frames split across chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(['event: stage\ndata: prep', 'aring\n\n', 'data: hello\n\n']),
        ),
    )

    const events: EventSourceMessage[] = []
    await postStream(
      '/api/v1/chat/tool-message-stream',
      { q: 1 },
      { onEvent: (e) => events.push(e) },
    )

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ event: 'stage', data: 'preparing' })
    expect(events[1].data).toBe('hello')
  })

  it('routes a non-ok response to onError and rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500, statusText: 'Server Error' })),
    )

    const onError = vi.fn()
    await expect(postStream('/api/v1/x', {}, { onEvent: () => {}, onError })).rejects.toThrow(/500/)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('rejects with a typed SseError carrying the real status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('too many requests', { status: 429, statusText: 'Too Many Requests' })),
    )

    await expect(postStream('/api/v1/x', {}, { onEvent: () => {} })).rejects.toMatchObject({
      name: 'SseError',
      status: 429,
    })
    await expect(postStream('/api/v1/x', {}, { onEvent: () => {} })).rejects.toBeInstanceOf(SseError)
  })

  it('swallows an aborted stream (Stop button) without erroring', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))

    const onError = vi.fn()
    await expect(
      postStream('/api/v1/x', {}, { onEvent: () => {}, onError, signal: controller.signal }),
    ).resolves.toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })
})
