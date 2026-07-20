// Gaps tab charts: gap evolution (ahead/behind lines + undercut/overcut zone
// shading, see gapSeries.ts) and gap consistency (consecutive-laps-in-window
// bars). Faithful port of gap_charts.py's three Plotly charts, with the
// undercut/overcut zone chart folded into the evolution chart — one glance
// instead of two near-identical line charts side by side.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { ChartCard } from '@/components/ChartCard'
import type { RaceRecord } from '@/lib/api/race'
import { RACE_YEAR } from '../search'
import { buildGapConsistencyOption, buildGapEvolutionOption, type GapHighlight } from '../lib/gapSeries'

// Registers the token theme once, before any chart here mounts (echarts-for-
// react inits with the `theme` prop in componentDidMount, ahead of a parent's
// passive effect — see ChannelChart.tsx's own note on this).
registerF1Theme()

const CHART_HEIGHT = 360

export interface GapChartsProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** A clicked StrategicWindowCards tile — pins that driver's qualifying laps
   *  on the evolution chart. */
  highlight?: GapHighlight
}

/** The two Gaps-tab charts, stacked full width — evolution first (the primary
 *  read: where are the strategic windows right now), consistency second (the
 *  supporting detail: how long have they held). */
export function GapCharts({ rows, highlight }: GapChartsProps) {
  const chartTheme = useChartTheme()

  const evolutionOption = useMemo(
    () => buildGapEvolutionOption(rows, RACE_YEAR, highlight),
    [rows, highlight],
  )
  const consistencyOption = useMemo(() => buildGapConsistencyOption(rows, RACE_YEAR), [rows])

  const paintedEvolution = useFirstPaintAnimation(evolutionOption)
  const paintedConsistency = useFirstPaintAnimation(consistencyOption)

  if (rows.length === 0) {
    return <p className="px-2 py-12 text-center text-sm text-fg-3">No gap data for this selection</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartCard title="Gap evolution">
        <div role="img" aria-label="Gap to the car ahead and behind, per lap, with undercut and overcut zones">
          <ReactECharts
            theme={chartTheme}
            key={chartTheme}
            option={paintedEvolution}
            style={{ height: CHART_HEIGHT }}
            notMerge
          />
        </div>
      </ChartCard>
      <ChartCard title="Gap consistency">
        <div role="img" aria-label="Consecutive laps each driver stayed in the same gap-ahead window">
          <ReactECharts
            theme={chartTheme}
            key={chartTheme}
            option={paintedConsistency}
            style={{ height: CHART_HEIGHT }}
            notMerge
          />
        </div>
      </ChartCard>
    </div>
  )
}
