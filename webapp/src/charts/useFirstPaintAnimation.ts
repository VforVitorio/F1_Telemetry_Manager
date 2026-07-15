import { useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'

// A multi-driver session's telemetry resolves as separate `useQueries` (VER
// lands, then LEC), and the lap chart's selected-lap rings land a tick after
// its lines — so a chart's option changes several times in quick succession as
// the data settles. The debounce coalesces that burst into ONE applied option,
// so the entrance sweep isn't restarted per arrival. The window is long enough
// to swallow the gap between two queries resolving off one warm session, short
// enough to be imperceptible.
const SETTLE_MS = 120

/**
 * Gate an ECharts option so the chart paints its entrance animation once, and
 * every later update applies instantly.
 *
 * ECharts plays the left-to-right entrance sweep only for a NEW series view
 * (first mount, or a newly added driver); a `notMerge` `setOption` on an
 * EXISTING same-name series is an update, governed by `animationDurationUpdate`.
 * So instead of a "have I painted yet" flag (which — because echarts-for-react
 * inits asynchronously — flipped before the real chart existed and then forced
 * `animation:false`, snapping the in-flight sweep, see
 * design-specs/chart-animation-selection-bugs.md), we set `animationDurationUpdate:
 * 0`: entrances animate, updates are instant, and there is no animate→frozen
 * render transition left to cancel a running sweep.
 *
 * Requires the caller-side churn fixes (a stable option identity) so no spurious
 * `setOption` fires mid-sweep — see the same spec.
 */
export function useFirstPaintAnimation(option: EChartsOption): EChartsOption {
  const [settledOption, setSettledOption] = useState(option)

  // Apply the option only once it has stopped changing for SETTLE_MS.
  useEffect(() => {
    const timer = setTimeout(() => setSettledOption(option), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [option])

  // Keep referential stability while `settledOption` is unchanged so the deep-
  // equal prop check in echarts-for-react doesn't fire a redundant `setOption`.
  return useMemo(() => ({ ...settledOption, animationDurationUpdate: 0 }), [settledOption])
}
