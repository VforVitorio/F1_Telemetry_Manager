// The moving playhead for the channel grid, drawn OUTSIDE ECharts entirely.
// The 4 charts are fully static (spec §4.5 — `setOption` runs once, at mount,
// and never again while the clock ticks); the cursor instead lives as a 1px
// DOM line whose position is a compositor-only `transform: translateX(px)`.
//
// The distance -> pixel mapping is expensive to recompute (it goes through
// ECharts' own axis conversion), so it's cached as a plain linear function
// (`px = px0 + (distance - dMin) * slope`) and only rebuilt when the chart
// becomes ready or its container resizes. Every rAF frame after that is one
// multiply-add and one style write — no `convertToPixel` call, no allocation.

import { useEffect, useRef } from 'react'
import type { ECharts } from 'echarts'
import type { ReplayClock, ReplayModel } from './types'

export interface CursorOverlayProps {
  model: ReplayModel
  clock: ReplayClock
  /** Resolves the live ECharts instance. The caller (ChannelPane) only mounts
   *  this component once the chart has fired `onChartReady`, so this always
   *  returns non-null for the overlay's lifetime. */
  getChart: () => ECharts | null
}

/** distance -> pixel, cached between resizes: `px = px0 + (d - dMin) * slope`. */
interface DistanceToPixel {
  px0: number
  slope: number
}

/** Reads the chart's own x-axis conversion once for two reference distances
 *  and turns that into a reusable linear mapping — cheaper than calling
 *  `convertToPixel` on every frame, and correct as long as the x-axis stays
 *  linear and unzoomed (the channel grid never adds a `dataZoom`). */
function mapDistanceToPixel(chart: ECharts, dMin: number, dMax: number): DistanceToPixel {
  const px0 = chart.convertToPixel({ xAxisIndex: 0 }, dMin)
  const px1 = chart.convertToPixel({ xAxisIndex: 0 }, dMax)
  const span = dMax - dMin
  return { px0, slope: span > 0 ? (px1 - px0) / span : 0 }
}

/** The moving playhead: a 1px vertical line positioned purely via `transform`
 *  so a per-frame update never touches layout, only the compositor. While
 *  paused it simply stops receiving new frames and sits at the frozen
 *  position — `clock.subscribe` only fires on a tick or an explicit seek. */
export function CursorOverlay({ model, clock, getChart }: CursorOverlayProps) {
  const lineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = getChart()
    const line = lineRef.current
    if (!chart || !line) return

    const dMin = model.distance[0] ?? 0
    const dMax = model.distance[model.distance.length - 1] ?? dMin
    let mapping = mapDistanceToPixel(chart, dMin, dMax)

    const applyFrame = (t: number) => {
      const distance = model.frameAt(t).leaderDistance
      const px = mapping.px0 + (distance - dMin) * mapping.slope
      line.style.transform = `translateX(${px}px)`
    }
    applyFrame(clock.getTime())

    const unsubscribe = clock.subscribe(applyFrame)
    const resizeObserver = new ResizeObserver(() => {
      mapping = mapDistanceToPixel(chart, dMin, dMax)
      applyFrame(clock.getTime())
    })
    resizeObserver.observe(chart.getDom())

    return () => {
      unsubscribe()
      resizeObserver.disconnect()
    }
  }, [model, clock, getChart])

  return (
    <div
      ref={lineRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-px bg-accent"
      style={{ willChange: 'transform' }}
    />
  )
}
