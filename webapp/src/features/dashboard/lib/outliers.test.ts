import { describe, expect, it } from 'vitest'
import { applyLapFilters, detectOutlierIndices } from './outliers'
import type { LapTime } from '@/lib/api/telemetry'

function lap(driver: string, lap_number: number, lap_time: number): LapTime {
  return { driver, lap_number, lap_time, is_valid: true, compound: 'medium' }
}

describe('detectOutlierIndices', () => {
  it('skips drivers with fewer than 4 laps', () => {
    const laps = [lap('VER', 1, 80), lap('VER', 2, 200), lap('VER', 3, 81)]
    expect(detectOutlierIndices(laps).size).toBe(0)
  })

  it('flags a high outlier with the 1.5×IQR index-quartile rule', () => {
    // 8 tight laps (~79s) + one 120s lap. n=9 → q1=idx2, q3=idx6 on sorted.
    const times = [79.0, 79.1, 79.2, 79.3, 79.4, 79.5, 79.6, 79.7, 120.0]
    const laps = times.map((t, i) => lap('VER', i + 1, t))
    const outliers = detectOutlierIndices(laps)
    expect(outliers.has(8)).toBe(true) // the 120s lap
    expect(outliers.size).toBe(1)
  })

  it('computes outliers per driver independently', () => {
    const ver = [79.0, 79.1, 79.2, 79.3, 130.0].map((t, i) => lap('VER', i + 1, t))
    const lec = [80.0, 80.1, 80.2, 80.3].map((t, i) => lap('LEC', i + 1, t))
    const outliers = detectOutlierIndices([...ver, ...lec])
    expect(outliers.has(4)).toBe(true) // VER's 130s lap (index 4 overall)
    expect([...outliers].every((i) => i < 5)).toBe(true) // none from LEC
  })
})

describe('applyLapFilters', () => {
  const laps = [79.0, 79.1, 79.2, 79.3, 79.4, 79.5, 79.6, 79.7, 120.0].map((t, i) =>
    lap('VER', i + 1, t),
  )

  it('hides outliers when showOutliers is false', () => {
    const { visible, outlierCount } = applyLapFilters(laps, false, true)
    expect(outlierCount).toBe(1)
    expect(visible).toHaveLength(8)
  })

  it('keeps outliers when showOutliers is true', () => {
    const { visible } = applyLapFilters(laps, true, true)
    expect(visible).toHaveLength(9)
  })

  it('invalid filter is a no-op with the current backend shape', () => {
    const { visible, invalidCount } = applyLapFilters(laps, true, false)
    expect(invalidCount).toBe(0)
    expect(visible).toHaveLength(9)
  })
})
