// Golden-fixture test for the replay math port (spec §6 / #36 acceptance).
//
// The fixture is the REAL output of the production Python
// (comparison_service.prepare_comparison_data) on the only fully-cached offline
// session: 2023 Monaco GP, Race, VER vs LEC. It carries the exact API `payload`
// plus a NumPy `reference` for the per-driver time-domain synthesis. We build the
// TS model from the payload and assert the port reproduces both to 1e-6, pinning
// buildReplayModel to the thesis-validated maths. Loaded via node:fs so `tsc`
// never has to infer a 500-element JSON literal type.

import { describe, expect, it } from 'vitest'
// Vite `?raw` import: the fixture arrives as a plain string (typed by vite/client),
// so `tsc` never infers a 500-element JSON literal type and no node:fs is needed.
import fixtureRaw from './comparison-monaco-2023.fixture.json?raw'
import { buildReplayModel } from './buildReplayModel'
import type { ComparisonPayload } from '@/lib/api/comparison'

interface Fixture {
  payload: ComparisonPayload
  reference: {
    timeAtDistance1: number[]
    timeAtDistance2: number[]
    duration: number
    lapTime1: number
    lapTime2: number
  }
}

const fixture = JSON.parse(fixtureRaw) as Fixture

const TOL = 1e-6

describe('buildReplayModel — golden fixture (2023 Monaco R, VER vs LEC)', () => {
  const model = buildReplayModel(fixture.payload)

  it('reproduces the backend delta to 1e-6 (calculate_delta_time port)', () => {
    const py = fixture.payload.delta
    expect(model.delta).toHaveLength(py.length)
    let maxErr = 0
    for (let i = 0; i < py.length; i++) maxErr = Math.max(maxErr, Math.abs(model.delta[i] - py[i]))
    expect(maxErr).toBeLessThan(TOL)
  })

  it('reproduces both per-driver time syntheses to 1e-6 (spec §4.1)', () => {
    const check = (got: Float64Array, want: number[]) => {
      let maxErr = 0
      for (let i = 0; i < want.length; i++) maxErr = Math.max(maxErr, Math.abs(got[i] - want[i]))
      return maxErr
    }
    expect(check(model.pilots[0].timeAtDistance, fixture.reference.timeAtDistance1)).toBeLessThan(
      TOL,
    )
    expect(check(model.pilots[1].timeAtDistance, fixture.reference.timeAtDistance2)).toBeLessThan(
      TOL,
    )
  })

  it('timeAtDistance is strictly increasing and ends at the real lap time', () => {
    for (const pilot of model.pilots) {
      const t = pilot.timeAtDistance
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
      expect(t[0]).toBe(0)
      expect(Math.abs(t[t.length - 1] - pilot.lapTime)).toBeLessThan(TOL)
    }
  })

  it('distanceAtTime inverts timeAtDistance (round-trip within a metre)', () => {
    const p = model.pilots[0]
    for (let k = 0; k < p.timeAtDistance.length; k += 50) {
      const d = p.distanceAtTime(p.timeAtDistance[k])
      expect(Math.abs(d - p.distance[k])).toBeLessThan(1)
    }
  })

  it('duration = max lap time; LEC is the winner (0.831s)', () => {
    expect(model.duration).toBeCloseTo(fixture.reference.duration, 6)
    expect(model.winner.winnerCode).toBe('LEC')
    expect(model.winner.gapSeconds).toBeCloseTo(0.831, 3)
  })

  it('microsector tally sums to 25', () => {
    const [a, b] = model.microsectorTally
    expect(a + b).toBe(model.nMicrosectors)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
  })

  it('frameAt: at t=0 both cars are at the start line, no gap', () => {
    const f = model.frameAt(0)
    expect(f.leaderDistance).toBeCloseTo(0, 3)
    expect(f.gapSeconds).toBeCloseTo(0, 3)
  })

  it('frameAt: near the end the faster car (LEC) leads on track', () => {
    const f = model.frameAt(model.pilots[1].lapTime) // LEC has just finished
    expect(f.leaderIndex).toBe(1) // pilot2 = LEC
    expect(f.separationMeters).toBeGreaterThan(0)
  })
})

describe('buildReplayModel — synthetic edge cases', () => {
  function synthetic(
    speed1: number[],
    speed2: number[],
    lt1: number,
    lt2: number,
  ): ComparisonPayload {
    const n = speed1.length
    const distance = Array.from({ length: n }, (_, i) => (i * 1000) / (n - 1))
    const zeros = distance.map(() => 0)
    const pilot = (speed: number[], lap: number, name: string, color: string) => ({
      distance,
      x: distance,
      y: zeros,
      speed,
      throttle: zeros,
      brake: zeros,
      lap_time: lap,
      color,
      name,
      lap: 1,
    })
    return {
      circuit: { x: distance, y: zeros, colors: distance.map(() => '#aaa') },
      pilot1: pilot(speed1, lt1, 'AAA', '#111'),
      pilot2: pilot(speed2, lt2, 'BBB', '#222'),
      delta: [],
      metadata: { rotation: 0, aspect_ratio: 1 },
    }
  }

  it('identical speeds → delta spread linearly to the real gap (numpy fallback)', () => {
    const speed = [100, 100, 100, 100, 100]
    const model = buildReplayModel(synthetic(speed, speed, 30, 29)) // real gap = +1
    const d = model.delta
    expect(d[0]).toBe(0)
    expect(d[d.length - 1]).toBeCloseTo(1, 9)
    expect(d[2]).toBeCloseTo(0.5, 9) // midpoint is half the gap
  })

  it('faster car (lower lap_time) is the winner regardless of order', () => {
    const model = buildReplayModel(synthetic([120, 120, 120], [100, 100, 100], 40, 41))
    expect(model.winner.winnerCode).toBe('AAA') // pilot1 lap_time 40 < 41
    expect(model.winner.winnerIndex).toBe(0)
  })
})
