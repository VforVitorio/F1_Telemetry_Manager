import { describe, it, expect } from 'vitest'
import type { ChatStreamEvent } from '@/lib/api/chat'
import { applyStreamEvent, createActiveTurn, isEmptyTurn, markStopped } from './useChatStream'

// Captured-SSE fixtures: each `events` array is the exact (event, payload)
// sequence `chat_engine.stream_response` yields for that branch
// (design-audit #39 §3.2), already parsed into `ChatStreamEvent`s — the frame
// PARSING itself is covered by `lib/api/chat.test.ts`. This file is the
// regression test for the reducer's understanding of the wire contract.

function reduceAll(events: ChatStreamEvent[]) {
  return events.reduce(applyStreamEvent, createActiveTurn())
}

describe('applyStreamEvent', () => {
  it('folds a full tool-call turn: stage(s) -> tool_result -> token(s) -> done', () => {
    const events: ChatStreamEvent[] = [
      { event: 'stage', stage: 'preparing_tools' },
      { event: 'stage', stage: 'model_choosing_tool' },
      { event: 'stage', stage: 'calling_predict_pace' },
      {
        event: 'tool_result',
        toolResult: {
          tool_name: 'predict_pace',
          display_type: 'metrics',
          data: { lap_time_pred: 91.2 },
          summary: 'Pace holds around 91.2s.',
        },
      },
      { event: 'stage', stage: 'summarizing_with_llm' },
      { event: 'token', token: 'Looking ' },
      { event: 'token', token: 'strong.' },
      { event: 'done', llmModel: 'gpt-4.1-mini', tokensUsed: 128 },
    ]

    const turn = reduceAll(events)

    expect(turn.status).toBe('done')
    expect(turn.toolBadge).toEqual({ toolName: 'predict_pace', status: 'done' })
    expect(turn.toolResultMessage?.toolResult?.tool_name).toBe('predict_pace')
    expect(turn.toolResultMessage?.content).toBe('Pace holds around 91.2s.')
    expect(turn.assistantMessage?.content).toBe('Looking strong.')
    expect(turn.assistantMessage?.model).toBe('gpt-4.1-mini')
    expect(turn.assistantMessage?.tokens).toBe(128)
  })

  it('folds the no-tool shortcut: stage(composing_response) -> token -> done', () => {
    const events: ChatStreamEvent[] = [
      { event: 'stage', stage: 'preparing_tools' },
      { event: 'stage', stage: 'model_choosing_tool' },
      { event: 'stage', stage: 'composing_response' },
      { event: 'token', token: 'Hello! How can I help?' },
      { event: 'done' },
    ]

    const turn = reduceAll(events)

    expect(turn.status).toBe('done')
    expect(turn.toolBadge).toBeUndefined()
    expect(turn.toolResultMessage).toBeUndefined()
    expect(turn.assistantMessage?.content).toBe('Hello! How can I help?')
    expect(turn.stageLabel).toBe('Composing the response…')
  })

  it('folds a refused (non-allowlisted) tool call the same way as a plain reply', () => {
    const events: ChatStreamEvent[] = [
      { event: 'stage', stage: 'model_choosing_tool' },
      { event: 'stage', stage: 'composing_response' },
      { event: 'token', token: '_The `mutate_data` tool is not available in this chat._' },
      { event: 'done' },
    ]

    const turn = reduceAll(events)

    expect(turn.status).toBe('done')
    expect(turn.assistantMessage?.content).toContain('not available in this chat')
  })

  it('marks the turn as error when the endpoint error envelope arrives', () => {
    const events: ChatStreamEvent[] = [
      { event: 'stage', stage: 'calling_get_race_data' },
      { event: 'token', token: '\n\nError: backend exploded' },
      { event: 'done', error: 'backend exploded' },
    ]

    const turn = reduceAll(events)

    expect(turn.status).toBe('error')
    expect(turn.error).toBe('backend exploded')
    expect(turn.assistantMessage?.content).toContain('backend exploded')
  })

  it('marks the tool badge as errored when the tool_result payload carries an error', () => {
    const events: ChatStreamEvent[] = [
      { event: 'stage', stage: 'calling_predict_tire' },
      {
        event: 'tool_result',
        toolResult: {
          tool_name: 'predict_tire',
          display_type: 'text',
          data: { error: 'lap 1 has no data' },
          summary: 'lap 1 has no data',
        },
      },
    ]

    const turn = reduceAll(events)

    expect(turn.toolBadge).toEqual({ toolName: 'predict_tire', status: 'error' })
  })

  it('re-keys an unknown stage to a sentence-cased fallback instead of raw snake_case', () => {
    const turn = applyStreamEvent(createActiveTurn(), { event: 'stage', stage: 'calling_a_future_tool' })
    expect(turn.stageLabel).toBe('A future tool…')
  })
})

describe('isEmptyTurn / markStopped', () => {
  it('flags a fresh turn (no tool result, no assistant text) as empty', () => {
    expect(isEmptyTurn(createActiveTurn())).toBe(true)
  })

  it('does not flag a turn that produced only a tool result as empty', () => {
    const turn = applyStreamEvent(createActiveTurn(), {
      event: 'tool_result',
      toolResult: { tool_name: 'list_available_gps', display_type: 'text', data: {}, summary: 'x' },
    })
    expect(isEmptyTurn(turn)).toBe(false)
  })

  it('does not flag a turn that produced only assistant text as empty', () => {
    const turn = applyStreamEvent(createActiveTurn(), { event: 'token', token: 'hi' })
    expect(isEmptyTurn(turn)).toBe(false)
  })

  it('appends the verbatim stopped marker to whatever text had already streamed', () => {
    const turn = applyStreamEvent(createActiveTurn(), { event: 'token', token: 'Partial answer' })
    const stopped = markStopped(turn)
    expect(stopped.assistantMessage?.content).toBe('Partial answer\n\n_[Response stopped by user]_')
    expect(stopped.status).toBe('done')
  })

  it('starts a message that is JUST the marker when nothing had streamed yet', () => {
    const stopped = markStopped(createActiveTurn())
    expect(stopped.assistantMessage?.content).toBe('\n\n_[Response stopped by user]_')
  })
})
