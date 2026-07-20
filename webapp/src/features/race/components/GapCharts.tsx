// Gaps tab charts: gap evolution (ahead/behind lines + undercut/overcut zone
// shading, see gapSeries.ts) and gap consistency (consecutive-laps-in-window
// bars). Faithful port of gap_charts.py's three Plotly charts, with the
// undercut/overcut zone chart folded into the evolution chart — one glance
// instead of two near-identical line charts side by side.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { F1_LIGHT_THEME } from '@/charts/echartsTheme'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { ChartCard } from '@/components/ChartCard'
import type { RaceRecord } from '@/lib/api/race'
import type { Theme } from '@/stores/ui'
import { RACE_YEAR } from '../search'
import {
  buildGapConsistencyOption,
  buildGapEvolutionOption,
  type GapHighlight,
} from '../lib/gapSeries'

// Registers the token theme once, before any chart here mounts (echarts-for-
// react inits with the `theme` prop in componentDidMount, ahead of a parent's
// passive effect — see ChannelChart.tsx's own note on this).
registerF1Theme()

const CHART_HEIGHT = 360

/** The gap-evolution y-axis clips at 12s so the strategic band (0-3.5s) stays
 *  readable even when a lapped car's gap runs to 25+ seconds (see
 *  `Y_MAX_CEILING` in gapSeries.ts). Without a hint, a line just vanishing at
 *  the top edge reads like a render bug rather than an intentional cap. */
const GAP_CLIP_FOOTER = 'Gaps above 12s are clipped. Drag the box-zoom to inspect them.'

/** The consistency bars cap at 15 laps (`CONSISTENCY_Y_MAX` in gapSeries.ts)
 *  so one driver's very long streak can't flatten the 3-lap strategic
 *  threshold into an unreadable sliver near the x-axis. */
const CONSISTENCY_CAP_FOOTER =
  'Streaks are capped at 15 laps so the 3-lap strategic threshold stays readable. Longer streaks are clipped at the top.'

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
  // Same theme-name comparison TyreChartSwitcher.tsx uses, so the zone bands
  // (buildZonesSeries in gapSeries.ts) get the right alpha for the mode
  // that's actually on screen.
  const theme: Theme = chartTheme === F1_LIGHT_THEME ? 'light' : 'dark'

  const evolutionOption = useMemo(
    () => buildGapEvolutionOption(rows, RACE_YEAR, theme, highlight),
    [rows, theme, highlight],
  )
  const consistencyOption = useMemo(() => buildGapConsistencyOption(rows, RACE_YEAR), [rows])

  const paintedEvolution = useFirstPaintAnimation(evolutionOption)
  const paintedConsistency = useFirstPaintAnimation(consistencyOption)

  if (rows.length === 0) {
    return (
      <p className="px-2 py-12 text-center text-sm text-fg-3">No gap data for this selection</p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartCard
        title="Gap evolution (s)"
        footer={<p className="text-xs text-fg-4">{GAP_CLIP_FOOTER}</p>}
      >
        <div
          role="img"
          aria-label="Gap to the car ahead and behind, per lap, with undercut and overcut zones"
        >
          <ReactECharts
            theme={chartTheme}
            key={chartTheme}
            option={paintedEvolution}
            style={{ height: CHART_HEIGHT }}
            notMerge
          />
        </div>
      </ChartCard>
      <ChartCard
        title="Gap consistency (laps)"
        footer={<p className="text-xs text-fg-4">{CONSISTENCY_CAP_FOOTER}</p>}
      >
        <div
          role="img"
          aria-label="Consecutive laps each driver stayed in the same gap-ahead window"
        >
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
