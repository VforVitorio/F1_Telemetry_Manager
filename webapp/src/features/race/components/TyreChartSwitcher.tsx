// Chart-view switcher for the Tyres tab: a segmented Tabs control picks one of
// the five tyre-degradation views; "Show all" bypasses the switch and stacks
// every view, each in its own ChartCard. Only the active view (or all five,
// once "Show all" is on) actually builds its ECharts option — the other four
// stay unbuilt until picked, same lazy-render Radix already gives TabsContent.

import { useContext, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ChartCard, ChartMaximizedContext } from '@/components/ChartCard'
import { Button } from '@/components/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/Tabs'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { F1_LIGHT_THEME } from '@/charts/echartsTheme'
import { RACE_YEAR, type RaceRecord } from '@/lib/api/race'
import { getDriverColor, getDriverTextColor, resolvePilotColor } from '@/lib/drivers'
import type { Theme } from '@/stores/ui'
import { buildTyreChartOption, TYRE_CHART_META } from '../lib/tyreSeries'
import { TYRE_CHARTS, useRaceStore, type TyreChartKey } from '../store'

registerF1Theme()

const CHART_HEIGHT = 360
/** Chart height inside "Show all": five full-height cards read as a stacked
 *  scroll of near-identical plots, so the grid below uses a compacted height
 *  instead of the single-view default. */
const SHOW_ALL_CHART_HEIGHT = 260

/** Distinct driver codes actually plotted, alphabetical. TyresPanel only ever
 *  lets 1-3 drivers through to this chart (more would be spaghetti), so this
 *  never has to scroll or scale like the old per-stint ECharts legend did. */
function distinctDrivers(rows: RaceRecord[]): string[] {
  return [...new Set(rows.map((row) => row.Driver))].sort()
}

/** One driver's identity chip: a dot in the exact colour drawn on the chart
 *  line (so the eye can match chip to line at a glance) plus the driver code
 *  in its readable team colour. Same rounded-chip shape PodiumQuickPick uses
 *  for its quick-pick buttons, reused here as a static (non-clickable) label. */
function DriverChip({ driver, theme }: { driver: string; theme: Theme }) {
  const dotColor = resolvePilotColor(getDriverColor(driver, RACE_YEAR), theme)
  const textColor = getDriverTextColor(driver, RACE_YEAR)
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-hairline bg-bg-4 px-2.5 py-1 font-mono text-xs">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span style={{ color: textColor }}>{driver}</span>
    </span>
  )
}

/** Replaces the old per-(driver, stint) ECharts legend: driver identity shown
 *  once, in HTML, instead of six to twelve mono entries crammed into an 11px
 *  scroll strip. Compound is already covered by the stint gantt's legend
 *  strip above the switcher, so this only needs to say "driver". */
function DriverLegend({ rows, theme }: { rows: RaceRecord[]; theme: Theme }) {
  const drivers = distinctDrivers(rows)
  if (drivers.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {drivers.map((driver) => (
        <DriverChip key={driver} driver={driver} theme={theme} />
      ))}
    </div>
  )
}

/** Static caption for the two views whose dash encoding needs an explicit
 *  key: Speed repurposes dash for the sector split rather than compound
 *  (what every other view uses it for), and Reg-vs-adj introduces a
 *  bold/faint pairing none of the other views have. The other three views
 *  don't need a caption. */
function tyreChartFooter(chartKey: TyreChartKey): string | undefined {
  if (chartKey === 'speed') return 'Line style = sector: solid S1, dashed S2, dotted FL'
  if (chartKey === 'regVsAdj') return 'Bold = fuel-adjusted, faint = raw'
  return undefined
}

export interface TyreChartSwitcherProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** Active compound filter (URL-bound) — only the Speed view reads it. */
  compound?: string
}

/** One view's ECharts option, memoized on its own inputs so flipping the
 *  switcher (or toggling Show all) doesn't rebuild the other four. */
function TyreChart({
  rows,
  compound,
  theme,
  chartKey,
  height = CHART_HEIGHT,
  showDriverLegend = true,
}: {
  rows: RaceRecord[]
  compound: string | undefined
  theme: Theme
  chartKey: TyreChartKey
  /** Card chart height in px. Show all passes a compacted value so five
   *  cards don't each claim the single-view's full height. */
  height?: number
  /** False in Show all, where one shared legend renders above the whole
   *  grid instead of five repeated copies. */
  showDriverLegend?: boolean
}) {
  const chartTheme = useChartTheme()
  // Inside the maximized overlay, fill the card instead of holding the fixed
  // chart height (ChartCard.tsx's convention — see ChannelChart.tsx's
  // SyncedLineChart for the same pattern). The remount key folds in
  // `maximized` so ECharts re-measures at the new size.
  const maximized = useContext(ChartMaximizedContext)
  const option = useMemo(
    () => buildTyreChartOption(chartKey, rows, { compound, theme }),
    [chartKey, rows, compound, theme],
  )
  const paintedOption = useFirstPaintAnimation(option)
  const footerNote = tyreChartFooter(chartKey)
  return (
    <ChartCard
      title={TYRE_CHART_META[chartKey].title}
      actions={showDriverLegend ? <DriverLegend rows={rows} theme={theme} /> : undefined}
      footer={footerNote ? <span className="text-xs text-fg-3">{footerNote}</span> : undefined}
    >
      <div
        role="img"
        aria-label={`${TYRE_CHART_META[chartKey].title} chart`}
        className={maximized ? 'h-full' : undefined}
      >
        <ReactECharts
          theme={chartTheme}
          key={`${chartTheme}-${maximized}`}
          option={paintedOption}
          style={{ height: maximized ? '100%' : height }}
          notMerge
        />
      </div>
    </ChartCard>
  )
}

export function TyreChartSwitcher({ rows, compound }: TyreChartSwitcherProps) {
  const tyreChart = useRaceStore((s) => s.tyreChart)
  const setTyreChart = useRaceStore((s) => s.setTyreChart)
  const tyreShowAll = useRaceStore((s) => s.tyreShowAll)
  const setTyreShowAll = useRaceStore((s) => s.setTyreShowAll)
  // Same theme-name comparison DeltaChart uses (charts/echartsTheme.ts) rather
  // than a second read of the UI store — one source for "which mode is live".
  const chartTheme = useChartTheme()
  const theme: Theme = chartTheme === F1_LIGHT_THEME ? 'light' : 'dark'

  return (
    <Tabs value={tyreChart} onValueChange={(value) => setTyreChart(value as TyreChartKey)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="segmented">
          {TYRE_CHARTS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {TYRE_CHART_META[key].label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={tyreShowAll}
          onClick={() => setTyreShowAll(!tyreShowAll)}
        >
          {tyreShowAll ? 'Show one' : 'Show all'}
        </Button>
      </div>

      {tyreShowAll ? (
        <div className="mt-4 flex flex-col gap-4">
          <DriverLegend rows={rows} theme={theme} />
          <div className="grid gap-4 xl:grid-cols-2">
            {TYRE_CHARTS.map((key) => (
              <TyreChart
                key={key}
                rows={rows}
                compound={compound}
                theme={theme}
                chartKey={key}
                height={SHOW_ALL_CHART_HEIGHT}
                showDriverLegend={false}
              />
            ))}
          </div>
        </div>
      ) : (
        TYRE_CHARTS.map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <TyreChart rows={rows} compound={compound} theme={theme} chartKey={key} />
          </TabsContent>
        ))
      )}
    </Tabs>
  )
}
