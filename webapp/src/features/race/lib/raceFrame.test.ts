// Unit tests for the race_processing.py ports. Expected values are derived by
// hand from the Python algorithm. The load-bearing case is the null-gap guard:
// pandas treats `NaN < 2.0` as False, but a bare TS `null < 2` coerces to 0 and
// returns true — so a null gap must never register as an opportunity.

import { describe, expect, it } from 'vitest'
import type { RaceRecord } from '@/lib/api/race'
import {
  addRaceLapColumn,
  aheadWindow,
  behindWindow,
  calculateGapConsistency,
  calculateStrategicWindows,
} from './raceFrame'

const BASE: RaceRecord = {
  Driver: 'VER',
  DriverNumber: 1,
  LapNumber: null,
  Stint: 1,
  SpeedI1: null,
  SpeedI2: null,
  SpeedFL: null,
  SpeedST: null,
  Compound: 'SOFT',
  TyreLife: null,
  TyreAge: null,
  FreshTyre: false,
  Team: 'Red Bull',
  Position: null,
  CompoundID: null,
  LapTime_s: null,
  FuelLoad: null,
  FuelAdjustedLapTime: null,
  FuelAdjustedDegAbsolute: null,
  FuelAdjustedDegPercent: null,
  DegradationRate: null,
  AirTemp: null,
  TrackTemp: null,
  GP_Name: 'Test GP',
  GapToCarAhead: null,
  GapToCarBehind: null,
  consistent_gap_ahead_laps: null,
  consistent_gap_behind_laps: null,
}
const rec = (p: Partial<RaceRecord>): RaceRecord => ({ ...BASE, ...p })

describe('addRaceLapColumn', () => {
  it('sums previous stint lengths + current TyreAge, per driver', () => {
    const rows = [
      rec({ DriverNumber: 1, Stint: 1, TyreAge: 1 }),
      rec({ DriverNumber: 1, Stint: 1, TyreAge: 2 }),
      rec({ DriverNumber: 1, Stint: 1, TyreAge: 3 }), // stint 1 length = 3
      rec({ DriverNumber: 1, Stint: 2, TyreAge: 1 }),
      rec({ DriverNumber: 1, Stint: 2, TyreAge: 2 }), // stint 2 offset = 3
    ]
    expect(addRaceLapColumn(rows).map((r) => r.LapNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps drivers independent', () => {
    const rows = [
      rec({ DriverNumber: 1, Stint: 1, TyreAge: 5 }),
      rec({ DriverNumber: 44, Stint: 1, TyreAge: 2 }),
      rec({ DriverNumber: 44, Stint: 2, TyreAge: 1 }), // 44's stint-1 length = 2 → offset 2
    ]
    expect(addRaceLapColumn(rows).map((r) => r.LapNumber)).toEqual([5, 2, 3])
  })
})

describe('aheadWindow / behindWindow (boundaries)', () => {
  it('classifies ahead gaps', () => {
    expect(aheadWindow(null)).toBe('unknown')
    expect(aheadWindow(1.9)).toBe('undercut_window')
    expect(aheadWindow(2.0)).toBe('overcut_window') // 2.0 is NOT < 2
    expect(aheadWindow(3.49)).toBe('overcut_window')
    expect(aheadWindow(3.5)).toBe('out_of_range')
  })
  it('classifies behind gaps', () => {
    expect(behindWindow(null)).toBe('unknown')
    expect(behindWindow(1.9)).toBe('defensive_window')
    expect(behindWindow(2.0)).toBe('safe_window')
  })
})

describe('calculateGapConsistency', () => {
  it('run-lengths consecutive same-window laps per driver, ordered by lap', () => {
    const rows = [
      rec({ DriverNumber: 1, LapNumber: 1, GapToCarAhead: 1.5 }), // undercut
      rec({ DriverNumber: 1, LapNumber: 2, GapToCarAhead: 1.8 }), // undercut → 2
      rec({ DriverNumber: 1, LapNumber: 3, GapToCarAhead: 3.0 }), // overcut → 1
      rec({ DriverNumber: 1, LapNumber: 4, GapToCarAhead: 1.0 }), // undercut → 1
    ]
    expect(calculateGapConsistency(rows).map((r) => r.consistent_gap_ahead_laps)).toEqual([
      1, 2, 1, 1,
    ])
  })

  it('a null gap is its own "unknown" window and breaks the run', () => {
    const rows = [
      rec({ DriverNumber: 1, LapNumber: 1, GapToCarBehind: 1.0 }), // defensive
      rec({ DriverNumber: 1, LapNumber: 2, GapToCarBehind: null }), // unknown → 1
      rec({ DriverNumber: 1, LapNumber: 3, GapToCarBehind: 1.5 }), // defensive → 1
    ]
    expect(calculateGapConsistency(rows).map((r) => r.consistent_gap_behind_laps)).toEqual([1, 1, 1])
  })
})

describe('calculateStrategicWindows', () => {
  it('NEVER flags an opportunity for a null gap (the coercion guard)', () => {
    const rows = [rec({ GapToCarAhead: null, GapToCarBehind: null, consistent_gap_ahead_laps: 9, consistent_gap_behind_laps: 9 })]
    const [w] = calculateStrategicWindows(rows)
    expect(w.undercutOpportunity).toBe(false)
    expect(w.overcutOpportunity).toBe(false)
    expect(w.defensiveNeeded).toBe(false)
  })

  it('flags undercut / overcut / defensive with the consistency threshold', () => {
    const rows = [
      rec({ GapToCarAhead: 1.5, consistent_gap_ahead_laps: 3 }), // undercut
      rec({ GapToCarAhead: 1.5, consistent_gap_ahead_laps: 2 }), // below threshold → none
      rec({ GapToCarAhead: 2.5, consistent_gap_ahead_laps: 3 }), // overcut
      rec({ GapToCarBehind: 1.0, consistent_gap_behind_laps: 4 }), // defensive
    ]
    const w = calculateStrategicWindows(rows)
    expect(w[0].undercutOpportunity).toBe(true)
    expect(w[1].undercutOpportunity).toBe(false)
    expect(w[2].overcutOpportunity).toBe(true)
    expect(w[2].undercutOpportunity).toBe(false)
    expect(w[3].defensiveNeeded).toBe(true)
  })

  it('assigns stint phase by thirds of the race', () => {
    // maxLap 9 → early=3, mid=6.
    const rows = [
      rec({ LapNumber: 2 }),
      rec({ LapNumber: 5 }),
      rec({ LapNumber: 8 }),
      rec({ LapNumber: 9 }),
    ]
    expect(calculateStrategicWindows(rows).map((r) => r.stintPhase)).toEqual([
      'early',
      'mid',
      'late',
      'late',
    ])
  })
})
