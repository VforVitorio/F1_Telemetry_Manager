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
import type { RaceRecord } from '@/lib/api/race'
import type { Theme } from '@/stores/ui'
import { buildTyreChartOption, TYRE_CHART_META } from '../lib/tyreSeries'
import { TYRE_CHARTS, useRaceStore, type TyreChartKey } from '../store'

registerF1Theme()

const CHART_HEIGHT = 360

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
}: {
  rows: RaceRecord[]
  compound: string | undefined
  theme: Theme
  chartKey: TyreChartKey
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
  return (
    <ChartCard title={TYRE_CHART_META[chartKey].title}>
      <div
        role="img"
        aria-label={`${TYRE_CHART_META[chartKey].title} chart`}
        className={maximized ? 'h-full' : undefined}
      >
        <ReactECharts
          theme={chartTheme}
          key={`${chartTheme}-${maximized}`}
          option={paintedOption}
          style={{ height: maximized ? '100%' : CHART_HEIGHT }}
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
          {TYRE_CHARTS.map((key) => (
            <TyreChart key={key} rows={rows} compound={compound} theme={theme} chartKey={key} />
          ))}
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
