import { useEffect, useRef, useState } from 'react'
import type { EChartsOption } from 'echarts'

// A multi-driver session's telemetry resolves as separate `useQueries` (VER
// lands, then LEC), and the lap chart's selected-lap rings land a tick after
// its lines — so a chart's option changes several times in quick succession as
// the data settles. With `notMerge` each `setOption` cancels and restarts the
// entrance animation, so the paint either flickers twice or (when the last
// update lands mid-sweep) snaps to the end without ever visibly playing.
//
// The debounce window: long enough to swallow the gap between two telemetry
// queries resolving off one warm session, short enough to be imperceptible.
const SETTLE_MS = 120

/**
 * Make an ECharts chart paint its entrance animation exactly once. It coalesces
 * the settling burst of option changes into a SINGLE applied option (so there's
 * only one `setOption`, which can't be cancelled by a follow-up), then locks
 * animation off so later interactions — driver toggles, lap clicks — update
 * instantly without replaying the sweep.
 *
 * A `key`-driven remount (theme / maximize change) creates a fresh instance, so
 * the ref resets and those transitions re-animate on purpose.
 */
export function useFirstPaintAnimation(option: EChartsOption): EChartsOption {
  const [settledOption, setSettledOption] = useState(option)
  const hasPaintedRef = useRef(false)

  // Apply the option only once it has stopped changing for SETTLE_MS.
  useEffect(() => {
    const timer = setTimeout(() => setSettledOption(option), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [option])

  const hasSeries = Array.isArray(settledOption.series) && settledOption.series.length > 0
  const animate = hasSeries && !hasPaintedRef.current
  useEffect(() => {
    if (animate) hasPaintedRef.current = true
  }, [animate])

  // When animating, pass the option through so ECharts' default entrance
  // animation runs; afterwards, force it off so updates apply instantly.
  return animate ? settledOption : { ...settledOption, animation: false }
}
