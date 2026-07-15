import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { EChartsOption } from 'echarts'
import { useFirstPaintAnimation } from './useFirstPaintAnimation'

const noSeries: EChartsOption = { series: [] }
const oneSeries: EChartsOption = { series: [{ type: 'line', data: [] }] }
const twoSeries: EChartsOption = {
  series: [
    { type: 'line', data: [] },
    { type: 'line', data: [] },
  ],
}

// A bit longer than the hook's internal SETTLE_MS debounce window.
const PAST_SETTLE = 160

describe('useFirstPaintAnimation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces the settling churn and animates the paint exactly once', () => {
    const { result, rerender } = renderHook((o: EChartsOption) => useFirstPaintAnimation(o), {
      initialProps: noSeries,
    })
    // nothing to paint yet
    expect(result.current.animation).toBe(false)

    // data lands in a burst (VER, then LEC) inside the settle window — the
    // applied option must NOT change per arrival (that's what would cancel the
    // animation); it stays the initial empty option until the burst settles.
    rerender(oneSeries)
    rerender(twoSeries)
    expect(result.current.series).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(PAST_SETTLE)
    })
    // one settled apply, with both series and the entrance animation left on
    // (undefined → ECharts default true).
    expect(result.current.series).toHaveLength(2)
    expect(result.current.animation).toBeUndefined()

    // a later interaction settles without replaying the sweep.
    rerender(oneSeries)
    act(() => {
      vi.advanceTimersByTime(PAST_SETTLE)
    })
    expect(result.current.animation).toBe(false)
  })
})
