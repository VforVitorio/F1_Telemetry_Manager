// Unit tests for the pure `formatLapTime` helper (the one thing worth a
// runnable check independent of rendering) plus a light render smoke test
// that the winner headline and microsector tally actually reach the DOM.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { formatLapTime, ResultBanner } from './ResultBanner'
import type { PilotModel, ReplayModel } from '../replay/types'

function buildFakePilot(code: string, color: string, lapTime: number): PilotModel {
  return {
    code,
    name: code,
    color,
    lap: 1,
    lapTime,
    distance: new Float64Array(0),
    x: new Float32Array(0),
    y: new Float32Array(0),
    speed: new Float32Array(0),
    throttle: new Float32Array(0),
    brake: new Float32Array(0),
    timeAtDistance: new Float64Array(0),
    distanceAtTime: () => 0,
    xAtTime: () => 0,
    yAtTime: () => 0,
    indexAtTime: () => 0,
  }
}

/** Minimal but fully-typed `ReplayModel`, covering only the fields
 *  `ResultBanner` actually reads (winner/pilots/microsectorTally/metadata) —
 *  the rest are inert placeholders so the fixture still satisfies the type. */
function buildFakeModel(overrides: Partial<Pick<ReplayModel, 'metadata'>> = {}): ReplayModel {
  const pilot1 = buildFakePilot('VER', '#3671C6', 70.342)
  const pilot2 = buildFakePilot('LEC', '#E8002D', 71.824)
  return {
    duration: 71.824,
    distance: new Float64Array(0),
    pilots: [pilot1, pilot2],
    delta: new Float64Array(0),
    circuit: {
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      outline: new Float32Array(0),
      segments: [],
    },
    microsectorTally: [9, 16],
    nMicrosectors: 25,
    winner: {
      winnerIndex: 0,
      winnerCode: 'VER',
      winnerLapTime: 70.342,
      loserCode: 'LEC',
      loserLapTime: 71.824,
      gapSeconds: 1.482,
    },
    metadata: { rotation: 0, aspect_ratio: 1.8, qualifying_phase: null, warning: null },
    sectorTimes: [],
    frameAt: () => ({
      t: 0,
      leaderIndex: 0,
      leaderDistance: 0,
      gapSeconds: 0,
      separationMeters: 0,
    }),
    ...overrides,
  }
}

describe('formatLapTime', () => {
  it('formats a sub-2-minute lap as m:ss.mmm', () => {
    expect(formatLapTime(75.773)).toBe('1:15.773')
  })

  it('formats an exact-minute boundary with zero milliseconds', () => {
    expect(formatLapTime(100)).toBe('1:40.000')
  })

  it('zero-pads seconds under 10 within the first minute', () => {
    expect(formatLapTime(9.5)).toBe('0:09.500')
  })
})

describe('ResultBanner', () => {
  it('shows the winner headline and the per-driver microsector tally', () => {
    render(<ResultBanner model={buildFakeModel()} />)
    expect(screen.getByText(/first by 1\.482s/)).toBeInTheDocument()
    expect(screen.getByText('VER 9')).toBeInTheDocument()
    expect(screen.getByText('LEC 16')).toBeInTheDocument()
  })

  it('shows the qualifying-phase pill only when metadata carries it', () => {
    render(
      <ResultBanner
        model={buildFakeModel({
          metadata: { rotation: 0, aspect_ratio: 1.8, qualifying_phase: 'Q3', warning: null },
        })}
      />,
    )
    expect(screen.getByText(/fastest laps from Q3/)).toBeInTheDocument()
  })
})
