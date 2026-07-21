// Fixture tests pinning parity with the Streamlit original's pit-detection
// and outlier-masking helpers (chart_builders.py's `_detect_pit_laps` /
// `_mask_pit_lap_outliers`), plus the delta-x alignment rule. Small captured
// input arrays, one behaviour per test — no ECharts, no React.

import { describe, expect, it } from 'vitest'
import { alignDeltaX, detectPitLaps, maskPitLapOutliers } from './lapMarks'

describe('detectPitLaps', () => {
  it('detects a pit stop from a stint increment', () => {
    const rows = [
      { lap: 1, stint: 1, compound: 'MEDIUM' },
      { lap: 2, stint: 1, compound: 'MEDIUM' },
      { lap: 3, stint: 2, compound: 'HARD' },
      { lap: 4, stint: 2, compound: 'HARD' },
    ]
    expect(detectPitLaps(rows, 'VER')).toEqual([{ lap: 3, compound: 'HARD', driver: 'VER' }])
  })

  it('falls back to a compound change when no stint field is present', () => {
    const rows = [
      { lap: 1, compound: 'SOFT' },
      { lap: 2, compound: 'SOFT' },
      { lap: 3, compound: 'MEDIUM' },
    ]
    expect(detectPitLaps(rows, 'HAM')).toEqual([{ lap: 3, compound: 'MEDIUM', driver: 'HAM' }])
  })

  it('never flags the first lap, and ignores a compound relabel while a stint is tracked', () => {
    const rows = [
      { lap: 1, stint: 1, compound: 'SOFT' },
      { lap: 2, stint: 1, compound: 'SOFT' },
    ]
    expect(detectPitLaps(rows, 'NOR')).toEqual([])
  })

  it('skips a row with a missing lap without letting it update the running state', () => {
    // Lap 2 is dropped from the payload entirely (e.g. a Safety Car lap), and
    // its Stint=5 must NOT become the new "previous stint" — otherwise lap 3's
    // Stint=2 would read as a decrease, not an increment, and the pit would be
    // missed.
    const rows = [
      { lap: 1, stint: 1, compound: 'SOFT' },
      { lap: null, stint: 5, compound: 'HARD' },
      { lap: 3, stint: 2, compound: 'MEDIUM' },
    ]
    expect(detectPitLaps(rows, 'PIA')).toEqual([{ lap: 3, compound: 'MEDIUM', driver: 'PIA' }])
  })
})

describe('maskPitLapOutliers', () => {
  it('leaves the input unchanged with fewer than 3 valid samples', () => {
    const lapTimes = [90.1, 95.4]
    expect(maskPitLapOutliers(lapTimes)).toEqual(lapTimes)
  })

  it('masks a lap exceeding 1.15x the median to null', () => {
    // sorted [89, 90, 91, 130] -> median (90+91)/2 = 90.5 -> cutoff 104.075
    const lapTimes = [90, 91, 89, 130]
    expect(maskPitLapOutliers(lapTimes)).toEqual([90, 91, 89, null])
  })

  it('respects a custom threshold ratio', () => {
    const lapTimes = [90, 90, 90, 100]
    expect(maskPitLapOutliers(lapTimes, 1.05)).toEqual([90, 90, 90, null])
    expect(maskPitLapOutliers(lapTimes, 1.2)).toEqual([90, 90, 90, 100])
  })
})

describe('alignDeltaX', () => {
  it('slices the reference distance array to the delta length', () => {
    expect(alignDeltaX([0, 10, 20, 30, 40], 3)).toEqual([0, 10, 20])
  })

  it('falls back to a 0..n-1 range only when distance is truly absent', () => {
    expect(alignDeltaX(undefined, 4)).toEqual([0, 1, 2, 3])
  })

  it('does not pad a distance array shorter than the delta series', () => {
    expect(alignDeltaX([0, 10], 5)).toEqual([0, 10])
  })
})
