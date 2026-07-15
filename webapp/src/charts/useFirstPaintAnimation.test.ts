import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
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

describe('useFirstPaintAnimation', () => {
  it('keeps animation off until the first render that has series', () => {
    const { result } = renderHook((o: EChartsOption) => useFirstPaintAnimation(o), {
      initialProps: noSeries,
    })
    expect(result.current.animation).toBe(false)
  })

  it('animates only the first data paint, not later data updates', () => {
    const { result, rerender } = renderHook((o: EChartsOption) => useFirstPaintAnimation(o), {
      initialProps: noSeries,
    })
    expect(result.current.animation).toBe(false) // no data yet

    rerender(oneSeries)
    // first data paint: option passed through untouched, ECharts' default
    // animation (undefined → true) draws the entrance sweep.
    expect(result.current.animation).toBeUndefined()

    rerender(twoSeries)
    // a second driver's telemetry landing must NOT replay the sweep.
    expect(result.current.animation).toBe(false)
  })
})
