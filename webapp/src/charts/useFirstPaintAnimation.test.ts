import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { EChartsOption } from 'echarts'
import { useFirstPaintAnimation } from './useFirstPaintAnimation'

const noSeries: EChartsOption = { series: [] }
const twoSeries: EChartsOption = {
  series: [
    { type: 'line', data: [] },
    { type: 'line', data: [] },
  ],
}

const PAST_SETTLE = 160 // > the hook's internal debounce window

describe('useFirstPaintAnimation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('leaves the entrance animation on and makes every update instant', () => {
    const { result, rerender } = renderHook((o: EChartsOption) => useFirstPaintAnimation(o), {
      initialProps: noSeries,
    })
    // The entrance is NEVER disabled (no `animation:false` — that was the bug);
    // updates are instant so a follow-up setOption can't re-sweep or snap.
    expect(result.current.animation).toBeUndefined()
    expect(result.current.animationDurationUpdate).toBe(0)

    // A burst of option changes is coalesced: not applied until it settles.
    rerender({ series: [{ type: 'line', data: [] }] })
    rerender(twoSeries)
    expect(result.current.series).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(PAST_SETTLE)
    })
    expect(result.current.series).toHaveLength(2)
    expect(result.current.animation).toBeUndefined() // entrance still enabled
    expect(result.current.animationDurationUpdate).toBe(0)
  })
})
