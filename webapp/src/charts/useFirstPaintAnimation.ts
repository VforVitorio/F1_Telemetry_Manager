import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'

/**
 * Gate an ECharts option so its entrance paint animation plays only on the
 * FIRST render that actually has series, and never again for that mount.
 *
 * Why: the dashboard charts render with `notMerge`, which re-runs the full
 * entrance sweep on EVERY `setOption`. A multi-driver session's telemetry
 * arrives as separate `useQueries` resolutions (VER lands, then LEC), so
 * `byDriver` updates once per driver — without this the chart would replay its
 * paint animation two or three times as each driver's data lands. This animates
 * the first data paint, then returns the same option with `animation: false` on
 * every later update.
 *
 * Remounts (a `key` change on theme / maximize) create a fresh instance, so the
 * ref resets and those transitions re-animate on purpose.
 */
export function useFirstPaintAnimation(option: EChartsOption): EChartsOption {
  const hasSeries = Array.isArray(option.series) && option.series.length > 0
  const paintedRef = useRef(false)
  const animate = hasSeries && !paintedRef.current

  useEffect(() => {
    if (animate) paintedRef.current = true
  }, [animate])

  return animate ? option : { ...option, animation: false }
}
