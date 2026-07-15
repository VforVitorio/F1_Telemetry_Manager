import { describe, expect, it } from 'vitest'
import { longitudinalAccelG } from './channels'
import type { LapTelemetry } from '@/lib/api/telemetry'

/** Builds a minimal `LapTelemetry` fixture — `longitudinalAccelG` only reads
 *  `speed`/`time`, the other channels are filled with zeros to satisfy the
 *  interface. */
function telemetry(speed: number[], time: number[]): LapTelemetry {
  return {
    driver: 'VER',
    lap_number: 1,
    distance: speed.map((_, i) => i),
    time,
    speed,
    throttle: speed.map(() => 0),
    brake: speed.map(() => 0),
    rpm: speed.map(() => 0),
    gear: speed.map(() => 0),
    drs: speed.map(() => 0),
  }
}

describe('longitudinalAccelG', () => {
  it('reads ~1g on a constant-acceleration ramp', () => {
    // 5 Hz-ish sampling (dt = 0.2s), speed climbing at exactly 1g the whole way.
    const dt = 0.2
    const accelStepKmh = 9.81 * 3.6 * dt // km/h gained per sample at 1g
    const time = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
    const speed = time.map((_, i) => i * accelStepKmh)

    const g = longitudinalAccelG(telemetry(speed, time))

    expect(g).toHaveLength(6)
    for (const value of g) {
      expect(value).toBeCloseTo(1, 5)
    }
  })

  it('reads ~0g on a flat speed trace', () => {
    const time = [0, 0.2, 0.4, 0.6, 0.8]
    const speed = time.map(() => 220)

    const g = longitudinalAccelG(telemetry(speed, time))

    for (const value of g) {
      expect(value).toBeCloseTo(0, 5)
    }
  })

  it('carries the previous value through a repeated timestamp instead of NaN/Infinity', () => {
    // time[3] === time[1] makes the central-difference dt at i=2 zero.
    const time = [0, 0.2, 0.2, 0.2, 0.4]
    const speed = [100, 110, 112, 115, 120]

    const g = longitudinalAccelG(telemetry(speed, time))

    expect(g).toHaveLength(5)
    for (const value of g) {
      expect(Number.isFinite(value)).toBe(true)
      expect(Number.isNaN(value)).toBe(false)
    }
  })

  it('returns an empty array for empty telemetry', () => {
    expect(longitudinalAccelG(telemetry([], []))).toEqual([])
  })
})
