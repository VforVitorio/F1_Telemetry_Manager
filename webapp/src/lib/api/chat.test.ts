import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendChatTurn, buildWireHistory, type ChatStreamEvent, type HistorySourceMessage } from './chat'

// Captured-SSE fixtures: real wire text (not pre-parsed JS objects), so this
// also exercises `parseChatFrame` (module-private) end to end through
// `sendChatTurn`. `useChatStream.test.ts` covers the reducer that consumes the
// already-parsed `ChatStreamEvent`s these tests produce.

function sseResponse(rawFrames: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(rawFrames))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('sendChatTurn', () => {
  it('parses a full tool-call turn into typed events, in order', async () => {
    const frames = [
      'event: stage\ndata: {"stage":"preparing_tools"}\n\n',
      'event: stage\ndata: {"stage":"calling_predict_pace"}\n\n',
      'event: tool_result\ndata: {"tool_result":{"tool_name":"predict_pace","display_type":"metrics","data":{"lap_time_pred":91.2},"summary":"Pace holds."}}\n\n',
      'event: token\ndata: {"token":"Looking strong."}\n\n',
      'event: done\ndata: {"llm_model":"gpt-4.1-mini","tokens_used":128}\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(frames)))

    const events: ChatStreamEvent[] = []
    await sendChatTurn({ text: 'predict pace' }, { onEvent: (e) => events.push(e) })

    expect(events).toEqual([
      { event: 'stage', stage: 'preparing_tools' },
      { event: 'stage', stage: 'calling_predict_pace' },
      {
        event: 'tool_result',
        toolResult: {
          tool_name: 'predict_pace',
          display_type: 'metrics',
          data: { lap_time_pred: 91.2 },
          summary: 'Pace holds.',
        },
      },
      { event: 'token', token: 'Looking strong.' },
      { event: 'done', llmModel: 'gpt-4.1-mini', tokensUsed: 128, error: undefined },
    ])
  })

  it('drops an unrecognised event name instead of throwing', async () => {
    const frames = [
      'event: legacy_stage\ndata: {"stage":"extracting_intent"}\n\n',
      'event: done\ndata: {}\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(frames)))

    const events: ChatStreamEvent[] = []
    await sendChatTurn({ text: 'hi' }, { onEvent: (e) => events.push(e) })

    expect(events).toEqual([{ event: 'done', llmModel: undefined, tokensUsed: undefined, error: undefined }])
  })

  it('always asks the backend for real token streaming by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse('event: done\ndata: {}\n\n'))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatTurn({ text: 'hi' }, { onEvent: () => {} })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.stream_tokens).toBe(true)
  })

  it('lets an explicit stream_tokens override the default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse('event: done\ndata: {}\n\n'))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatTurn({ text: 'hi', stream_tokens: false }, { onEvent: () => {} })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).stream_tokens).toBe(false)
  })
})

describe('buildWireHistory', () => {
  const textMessage = (i: number): HistorySourceMessage => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    type: 'text',
    content: `msg ${i}`,
  })

  it('drops tool_result entries and caps the message count at 40', () => {
    const messages: HistorySourceMessage[] = Array.from({ length: 45 }, (_, i) => textMessage(i))
    messages.push({ role: 'assistant', type: 'tool_result', content: 'ignored' })

    const wire = buildWireHistory(messages)

    expect(wire).toHaveLength(40)
    expect(wire.some((m) => m.content === 'ignored')).toBe(false)
    // The cap keeps the MOST RECENT 40, so the oldest text messages are the
    // ones dropped, not the newest.
    expect(wire[0].content).toBe('msg 5')
    expect(wire.at(-1)?.content).toBe('msg 44')
  })

  it('truncates an oversized message to the 12,000-char cap', () => {
    const huge = 'x'.repeat(20_000)
    const wire = buildWireHistory([{ role: 'user', type: 'text', content: huge }])
    expect(wire[0].content).toHaveLength(12_000)
  })

  it('drops empty/whitespace-only text messages', () => {
    const wire = buildWireHistory([{ role: 'user', type: 'text', content: '   ' }])
    expect(wire).toHaveLength(0)
  })
})
