// Unit tests for trackDraw.ts's pure helpers only — the predicates and colour
// mappers that decide WHAT to draw. The actual canvas painting (drawStaticLayer/
// drawDynamicLayer) is DOM/canvas behaviour with no meaningful jsdom 2D context;
// it's verified visually instead (screenshot pass), per the worker brief.

import { describe, expect, it } from 'vitest'
import { resolvePilotColor } from '@/lib/drivers'
import {
  buildGapLabel,
  computeSpeedRange,
  isSegmentRevealed,
  localDeltaGain,
  NEUTRAL_GAIN_COLOR,
  pickSegmentColor,
  shouldShowGapLink,
  speedHeatColor,
  type GainContext,
} from './trackDraw'
import type { TrackSegment } from './types'

function segment(overrides: Partial<TrackSegment> = {}): TrackSegment {
  return {
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    color: '#111111',
    endDistance: 100,
    speed: 200,
    ...overrides,
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

describe('speedHeatColor', () => {
  it('returns a well-formed hex colour', () => {
    expect(speedHeatColor(150, 100, 300)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('shifts monotonically from a desaturated slow tone toward amber (fast)', () => {
    const samples = [100, 150, 200, 250, 300].map((speed) =>
      hexToRgb(speedHeatColor(speed, 100, 300)),
    )
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i][0]).toBeGreaterThanOrEqual(samples[i - 1][0]) // red channel rises
      expect(samples[i][2]).toBeLessThanOrEqual(samples[i - 1][2]) // blue channel falls
    }
  })

  it('clamps out-of-range speeds instead of extrapolating', () => {
    expect(speedHeatColor(-50, 100, 300)).toBe(speedHeatColor(100, 100, 300))
    expect(speedHeatColor(999, 100, 300)).toBe(speedHeatColor(300, 100, 300))
  })

  it('falls back to the slow end on a degenerate (flat) range', () => {
    expect(speedHeatColor(200, 200, 200)).toBe(speedHeatColor(0, 200, 200))
  })
})

describe('computeSpeedRange', () => {
  it('returns the min/max speed across all segments', () => {
    const segments = [segment({ speed: 120 }), segment({ speed: 310 }), segment({ speed: 180 })]
    expect(computeSpeedRange(segments)).toEqual({ min: 120, max: 310 })
  })

  it('returns a degenerate-safe default for an empty segment list', () => {
    expect(computeSpeedRange([])).toEqual({ min: 0, max: 1 })
  })
})

describe('isSegmentRevealed', () => {
  it('is revealed once the leader has passed its end distance', () => {
    expect(isSegmentRevealed(segment({ endDistance: 100 }), 150)).toBe(true)
  })

  it('is not revealed at or before its end distance', () => {
    expect(isSegmentRevealed(segment({ endDistance: 100 }), 100)).toBe(false)
    expect(isSegmentRevealed(segment({ endDistance: 100 }), 50)).toBe(false)
  })
})

describe('shouldShowGapLink', () => {
  const TRACK_LENGTH = 5000 // 8% of this = 400 m

  it('shows the link when the cars are within the threshold', () => {
    expect(shouldShowGapLink(200, TRACK_LENGTH)).toBe(true)
  })

  it('hides the link at and beyond the threshold', () => {
    expect(shouldShowGapLink(400, TRACK_LENGTH)).toBe(false)
    expect(shouldShowGapLink(800, TRACK_LENGTH)).toBe(false)
  })
})

describe('localDeltaGain', () => {
  it('is the forward difference between consecutive delta samples', () => {
    const delta = Float64Array.from([0, 0.1, 0.35, 0.2])
    expect(localDeltaGain(delta, 0)).toBeCloseTo(0.1, 9)
    expect(localDeltaGain(delta, 1)).toBeCloseTo(0.25, 9)
    expect(localDeltaGain(delta, 2)).toBeCloseTo(-0.15, 9)
  })

  it('clamps at the last index instead of reading out of bounds', () => {
    const delta = Float64Array.from([0, 0.1, 0.2])
    expect(localDeltaGain(delta, 5)).toBe(0) // clamped to (last, last) → 0
  })
})

describe('pickSegmentColor', () => {
  const speedRange = { min: 100, max: 300 }
  // Real 2025 team colours (from lib/drivers.ts) rather than placeholder
  // strings — these exercise `resolvePilotColor`'s legibility floor for real
  // (Red Bull's blue is dark enough to need a lift on the dark theme; Ferrari's
  // red already has plenty of contrast either way).
  const RED_BULL_BLUE = '#3671C6'
  const FERRARI_RED = '#E8002D'
  const gain = (localGain: number): GainContext => ({
    localGain,
    pilot1Color: RED_BULL_BLUE,
    pilot2Color: FERRARI_RED,
  })

  it('dominance mode keeps an already-legible segment colour unchanged', () => {
    // #abcdef sits below the dark-theme floor's trigger (comfortably readable
    // on the dark cards already), so resolvePilotColor is a no-op here.
    const seg = segment({ color: '#abcdef' })
    expect(pickSegmentColor(seg, 'dominance', speedRange, gain(0), 'dark')).toBe('#abcdef')
  })

  it('dominance mode darkens an over-bright segment colour on the light theme', () => {
    // Same #abcdef is ABOVE the light-theme ceiling, so it needs darkening —
    // delegated to resolvePilotColor rather than duplicated here (P1 fix +
    // the audit's nice-to-have: the revealed dominance ribbon was never
    // theme-checked at all).
    const seg = segment({ color: '#abcdef' })
    expect(pickSegmentColor(seg, 'dominance', speedRange, gain(0), 'light')).toBe(
      resolvePilotColor('#abcdef', 'light'),
    )
  })

  it('speed mode ignores the dominance colour and heat-maps the speed', () => {
    const seg = segment({ color: '#abcdef', speed: 300 })
    expect(pickSegmentColor(seg, 'speed', speedRange, gain(0), 'dark')).toBe(
      speedHeatColor(300, 100, 300),
    )
  })

  it('gain mode tints toward whoever gained time, resolved for the theme', () => {
    const seg = segment({ color: '#abcdef' })
    // delta rising ⇒ pilot1 (Red Bull) slower here ⇒ pilot2 (Ferrari) gained it.
    expect(pickSegmentColor(seg, 'gain', speedRange, gain(0.5), 'dark')).toBe(
      resolvePilotColor(FERRARI_RED, 'dark'),
    )
    expect(pickSegmentColor(seg, 'gain', speedRange, gain(-0.5), 'dark')).toBe(
      resolvePilotColor(RED_BULL_BLUE, 'dark'),
    )
  })

  it('gain mode falls back to a neutral grey near a dead heat, not the dominance colour', () => {
    // Previously fell back to the segment's dominance colour, which silently
    // implied a "winner" on a stretch that is actually level (Fable UI audit P2).
    const seg = segment({ color: '#abcdef' })
    expect(pickSegmentColor(seg, 'gain', speedRange, gain(0), 'dark')).toBe(NEUTRAL_GAIN_COLOR)
  })
})

describe('buildGapLabel', () => {
  it('prefixes the on-track gap with the leader code, matching the transport readout format', () => {
    expect(buildGapLabel('LEC', 0.15)).toBe('LEC ▲ +0.15s')
  })

  it('rounds the gap to 2 decimal places', () => {
    expect(buildGapLabel('VER', 1.2345)).toBe('VER ▲ +1.23s')
  })
})
