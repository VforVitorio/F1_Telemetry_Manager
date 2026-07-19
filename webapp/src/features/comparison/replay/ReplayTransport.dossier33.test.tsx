// Regression test named after migration dossier #33: in Streamlit the replay's
// Play control was a canvas element Playwright/axe could not click. The migrated
// transport must expose Play as a REAL, accessible, enabled HTML button wired to
// the clock — this asserts that contract at the unit level (the live Playwright
// run proves it end-to-end; this keeps it from regressing in CI).

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/Tooltip'
import { ReplayTransport } from './ReplayTransport'
import type { ReplayClock, ReplayModel } from './types'

function fakeClock(overrides: Partial<ReplayClock> = {}): ReplayClock {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    nudge: vi.fn(),
    restart: vi.fn(),
    subscribe: () => () => {},
    getTime: () => 0,
    isPlaying: () => false,
    ...overrides,
  }
}

function fakeModel(): ReplayModel {
  return {
    duration: 70,
    distance: Float64Array.from([0, 1]),
    pilots: [
      // Only the fields the transport/readout touch.
      { code: 'VER', color: '#3671C6' },
      { code: 'LEC', color: '#E8002D' },
    ] as unknown as ReplayModel['pilots'],
    delta: Float64Array.from([0, 0.5]),
    circuit: {
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      outline: new Float32Array(),
      segments: [],
    },
    microsectorTally: [1, 1],
    nMicrosectors: 25,
    winner: {
      winnerIndex: 1,
      winnerCode: 'LEC',
      winnerLapTime: 69,
      loserCode: 'VER',
      loserLapTime: 70,
      gapSeconds: 1,
    },
    metadata: { rotation: 0, aspect_ratio: 1 },
    sectorTimes: [23, 46],
    frameAt: () => ({
      t: 0,
      leaderIndex: 1,
      leaderDistance: 0,
      gapSeconds: 0,
      separationMeters: 0,
    }),
  }
}

function renderTransport(clock: ReplayClock) {
  return render(
    <TooltipProvider>
      <ReplayTransport
        model={fakeModel()}
        clock={clock}
        status="ready"
        speed={1}
        onSpeedChange={() => {}}
        loop={false}
        onToggleLoop={() => {}}
        trackMode="dominance"
        onTrackModeChange={() => {}}
        onShareMoment={() => {}}
      />
    </TooltipProvider>,
  )
}

describe('dossier #33 — Play is a real, clickable HTML button', () => {
  it('exposes an enabled Play button with an accessible name', () => {
    renderTransport(fakeClock())
    const play = screen.getByRole('button', { name: /play/i })
    expect(play).toBeEnabled()
    expect(play.tagName).toBe('BUTTON')
  })

  it('clicking Play drives the clock (not a dead canvas)', () => {
    const toggle = vi.fn()
    renderTransport(fakeClock({ toggle }))
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})
