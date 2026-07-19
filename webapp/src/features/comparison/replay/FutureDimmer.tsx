// The "future" veil: a translucent panel whose LEFT edge tracks the playhead
// and whose right edge sits at the end of the plot — everything to the right
// of the cursor (what hasn't happened yet on track) reads as dimmed, without
// touching the chart itself. Same DOM-overlay + cached-mapping strategy as
// CursorOverlay: recomputed on chart-ready/resize, moved and resized per frame
// via `transform`/`width`, never a `setOption`.

import { useEffect, useRef } from 'react'
import type { ECharts } from 'echarts'
import { cn } from '@/lib/cn'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'

// Vertical inset approximating the plot's own reserved chrome (mirrors
// channelOptions.ts's `GRID.top`, and the axis-label band ECharts'
// `containLabel: true` reserves at the bottom) so the veil covers the DATA
// only — a plain `inset-y-0` also dims the x-axis label row into
// unreadability.
const PLOT_TOP_INSET = 16
const PLOT_BOTTOM_INSET = 28

export interface FutureDimmerProps {
  model: ReplayModel
  clock: ReplayClock
  /** At `ready` (t=0, nothing has played yet) the veil is invisible — the
   *  first frame is a complete static analysis screen, not a dimmed one. It
   *  fades in over `~250ms` the moment the replay leaves `ready`, so the future
   *  veils itself when the clock starts. */
  status: ReplayStatus
  /** Resolves the live ECharts instance. The caller (ChannelPane) only mounts
   *  this component once the chart has fired `onChartReady`, so this always
   *  returns non-null for the overlay's lifetime. */
  getChart: () => ECharts | null
}

/** distance -> pixel, cached between resizes, plus the plot's right edge
 *  (the dimmer's own right bound — it never covers past the last sample). */
interface DistanceToPixel {
  px0: number
  slope: number
  plotRight: number
}

function mapDistanceToPixel(chart: ECharts, dMin: number, dMax: number): DistanceToPixel {
  const px0 = chart.convertToPixel({ xAxisIndex: 0 }, dMin)
  const px1 = chart.convertToPixel({ xAxisIndex: 0 }, dMax)
  const span = dMax - dMin
  return { px0, slope: span > 0 ? (px1 - px0) / span : 0, plotRight: px1 }
}

/** The progressive-reveal veil: covers from the playhead to the plot's right
 *  edge. Resizing a DOM element's `width` is a cheaper repaint than any
 *  ECharts redraw, and it stays a plain per-frame style write — no
 *  `setOption` ever runs after the chart mounts. */
export function FutureDimmer({ model, clock, status, getChart }: FutureDimmerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isReady = status === 'ready'

  useEffect(() => {
    const chart = getChart()
    const panel = panelRef.current
    if (!chart || !panel) return

    const dMin = model.distance[0] ?? 0
    const dMax = model.distance[model.distance.length - 1] ?? dMin
    let mapping = mapDistanceToPixel(chart, dMin, dMax)

    const applyFrame = (t: number) => {
      const distance = model.frameAt(t).leaderDistance
      const px = mapping.px0 + (distance - dMin) * mapping.slope
      const width = Math.max(0, mapping.plotRight - px)
      panel.style.transform = `translateX(${px}px)`
      panel.style.width = `${width}px`
    }
    applyFrame(clock.getTime())

    const unsubscribe = clock.subscribe(applyFrame)
    const resizeObserver = new ResizeObserver(() => {
      // Force a synchronous resize before re-reading the axis — echarts-for-react
      // only resizes on a 60ms-debounced sensor, so mapping against the container
      // change directly would leave the veil against the pre-resize geometry.
      chart.resize()
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
      ref={panelRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-0 bg-bg-2/50 transition-opacity duration-250',
        isReady ? 'opacity-0' : 'opacity-100',
      )}
      style={{
        top: PLOT_TOP_INSET,
        bottom: PLOT_BOTTOM_INSET,
        willChange: 'transform, width, opacity',
      }}
    />
  )
}
