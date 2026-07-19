// One channel's chart card: a titled shell hosting a fully static ECharts
// option (`setOption` runs once, at mount, and never again) plus its two
// DOM-overlay layers, FutureDimmer (painted first, so it sits under) and
// CursorOverlay (painted after, so its 1px line sits on top).
//
// Joins the shared `echarts.connect` crosshair group, mirroring
// ChannelChart.tsx's CROSSHAIR_GROUP, so once the replay is paused, hovering
// any one of the 4 channels moves the native axisPointer on the other 3 at
// the same distance. While playing, the chart's own pointer events are
// switched off entirely — the DOM overlays are the only thing driving the
// cursor, and there is nothing for a native hover to usefully show anyway
// (spec: "false while playing → overlays drive, hover suppressed").

import { useCallback, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { resolvePilotColor } from '@/lib/drivers'
import { useUiStore } from '@/stores/ui'
import { pilotColor } from './channelOptions'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'
import { CursorOverlay } from './CursorOverlay'
import { FutureDimmer } from './FutureDimmer'

registerF1Theme()

const CHART_HEIGHT = 220

// All 4 channel panes join this group so a PAUSED hover's crosshair moves
// together across Delta/Speed/Brake/Throttle. Kept distinct from
// ChannelChart.tsx's own `telemetry-crosshair` group so the Comparison
// replay's charts never cross-sync with the Dashboard's telemetry grid.
const CROSSHAIR_GROUP = 'comparison-replay-crosshair'

export interface ChannelPaneProps {
  /** Uppercase-styled channel name, e.g. "Speed", "Delta" — kept separate
   *  from `unit` so the unit's own casing (lowercase "s", "km/h") survives
   *  the label's `uppercase` styling. A combined "Delta (s)" title would
   *  render as "DELTA (S)" because `uppercase` applies to the whole string. */
  label: string
  /** Parenthesised unit, e.g. "(km/h)", "(s)" — rendered `normal-case`. */
  unit: string
  /** Built once by the caller (channelOptions.ts) — only changes when the
   *  underlying data or theme changes, never per clock tick. */
  option: EChartsOption
  model: ReplayModel
  clock: ReplayClock
  status: ReplayStatus
}

/** One channel of the 4-chart grid: a static ECharts pane inside a titled
 *  card, with its two DOM-overlay layers mounted only once the chart
 *  instance exists (so they can assume a non-null `getChart()`). */
export function ChannelPane({ label, unit, option, model, clock, status }: ChannelPaneProps) {
  const chartTheme = useChartTheme()
  const uiTheme = useUiStore((state) => state.theme)
  const chartRef = useRef<ECharts | null>(null)
  const [ready, setReady] = useState(false)

  // Paused/ready/finished enables native axisPointer hover + the crosshair
  // group; only while playing do the DOM overlays alone drive the cursor.
  const paused = status !== 'playing'

  const handleChartReady = useCallback((instance: ECharts) => {
    chartRef.current = instance
    instance.group = CROSSHAIR_GROUP
    echarts.connect(CROSSHAIR_GROUP)
    setReady(true)
  }, [])

  // Stable identity (backed by a ref, not the `ready` state) so the overlays'
  // own effects don't resubscribe every time this component re-renders.
  const getChart = useCallback(() => chartRef.current, [])

  const paintedOption = useFirstPaintAnimation(option)

  const [pilot1, pilot2] = model.pilots
  const chips = [pilot1, pilot2].map((pilot) => ({
    code: pilot.code,
    color: resolvePilotColor(pilotColor(pilot, undefined), uiTheme),
  }))

  return (
    <div className="rounded-2xl border border-hairline bg-bg-3 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-xs font-medium uppercase tracking-wide text-fg-3">
          {label} <span className="normal-case">{unit}</span>
        </h3>
        {/* Team-coloured driver chips — the same identity legend on all four
            panes. The delta pane earns them too now that it draws two
            team-coloured lines (faster's flat baseline + slower's deficit
            curve), so identity lives in the data like Speed/Brake/Throttle. */}
        <span className="flex items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.code}
              className="flex items-center gap-1 font-mono text-[10px] text-fg-3"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: chip.color }}
              />
              {chip.code}
            </span>
          ))}
        </span>
      </div>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <div style={{ pointerEvents: paused ? 'auto' : 'none' }}>
          <ReactECharts
            theme={chartTheme}
            key={chartTheme}
            option={paintedOption}
            style={{ height: CHART_HEIGHT }}
            notMerge
            onChartReady={handleChartReady}
          />
        </div>
        {ready && (
          <>
            <FutureDimmer model={model} clock={clock} status={status} getChart={getChart} />
            <CursorOverlay model={model} clock={clock} getChart={getChart} />
          </>
        )}
      </div>
    </div>
  )
}
