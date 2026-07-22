// Store-level tests for the recent-sessions slice (#186): the dedupe, cap and
// ordering rules are the feature's actual contract — the component is just a
// renderer over this list.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_RECENT_SESSIONS,
  sessionId,
  useSessionsStore,
  type RecordableSelection,
} from './sessionsStore'

function sel(overrides: Partial<RecordableSelection> = {}): RecordableSelection {
  return {
    year: 2025,
    gp: 'British Grand Prix',
    session: 'R',
    drivers: ['NOR', 'VER'],
    ...overrides,
  }
}

beforeEach(() => {
  useSessionsStore.setState({ sessions: [] })
})

describe('recordSession', () => {
  it('adds the newest session to the front', () => {
    useSessionsStore.getState().recordSession(sel({ gp: 'Monaco Grand Prix' }), 'dashboard')
    useSessionsStore.getState().recordSession(sel(), 'comparison')

    const sessions = useSessionsStore.getState().sessions
    expect(sessions).toHaveLength(2)
    expect(sessions[0].gp).toBe('British Grand Prix')
    expect(sessions[0].surface).toBe('comparison')
  })

  it('dedupes by year+gp+drivers: a re-open refreshes and moves to front', () => {
    useSessionsStore.getState().recordSession(sel(), 'dashboard')
    useSessionsStore.getState().recordSession(sel({ gp: 'Monaco Grand Prix' }), 'dashboard')
    // Same identity as the first record, drivers in a different order.
    useSessionsStore.getState().recordSession(sel({ drivers: ['VER', 'NOR'] }), 'strategy')

    const sessions = useSessionsStore.getState().sessions
    expect(sessions).toHaveLength(2)
    expect(sessions[0].id).toBe(sessionId(sel()))
    expect(sessions[0].surface).toBe('strategy')
  })

  it('caps the list, evicting the oldest', () => {
    for (let i = 0; i < MAX_RECENT_SESSIONS + 2; i++) {
      useSessionsStore.getState().recordSession(sel({ gp: `GP ${i}` }), 'dashboard')
    }

    const sessions = useSessionsStore.getState().sessions
    expect(sessions).toHaveLength(MAX_RECENT_SESSIONS)
    expect(sessions[0].gp).toBe(`GP ${MAX_RECENT_SESSIONS + 1}`)
    expect(sessions.some((s) => s.gp === 'GP 0')).toBe(false)
  })
})

describe('removeSession', () => {
  it('removes only the targeted session', () => {
    useSessionsStore.getState().recordSession(sel(), 'dashboard')
    useSessionsStore.getState().recordSession(sel({ gp: 'Monaco Grand Prix' }), 'dashboard')

    useSessionsStore.getState().removeSession(sessionId(sel()))

    const sessions = useSessionsStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].gp).toBe('Monaco Grand Prix')
  })
})
