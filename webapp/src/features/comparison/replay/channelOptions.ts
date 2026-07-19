// Pure ECharts option builders for the Comparison replay's 4-channel grid
// (Delta, Speed, Brake, Throttle). Each option is built ONCE per (model,
// theme) — see ChannelGrid's `useMemo` — and never touched again: the moving
// playhead is a DOM overlay (CursorOverlay/FutureDimmer), never a per-frame
// `setOption`/`dispatchAction` (spec §4.5). Kept framework- and ECharts-
// instance-free (plain option objects only) so the shape is unit-testable
// without mounting a chart — see channelOptions.test.ts.
//
// Visual language mirrors the dashboard telemetry grid (ChannelChart.tsx):
// no symbols, 2px lines, axis-triggered tooltip in team colour, hairline
// grid, a shared distance x-axis. Team colours come straight from the
// payload (`pilot.color`) — `getDriverColor` only fills in for the
// (practically unreachable) case where a pilot ships without one.

import type {
  DefaultLabelFormatterCallbackParams,
  EChartsOption,
  LineSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { F1_LIGHT_THEME } from '@/charts/echartsTheme'
import { getDriverColor } from '@/lib/drivers'
import type { PilotModel, ReplayModel } from './types'

const LINE_WIDTH = 2
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"
const GRID = { top: 16, left: 8, right: 20, bottom: 8, containLabel: true } as const

// Delta's y=0 markLine isn't governed by the registered ECharts theme (same
// reasoning as ChannelChart.tsx's own MARK_LINE_COLOR_DARK/LIGHT), so its
// colour is threaded in per the app's current light/dark mode.
const MARK_LINE_COLOR_DARK = 'rgba(255,255,255,0.35)'
const MARK_LINE_COLOR_LIGHT = 'rgba(20,18,31,0.35)'

/** The delta CURVE itself — the brand accent purple, distinct from both driver
 *  colours (which tint the sign-split fills), readable on light and dark. */
const DELTA_LINE_COLOR = '#6c5ce7'

/** Area fill under the split-sign delta line — faint enough that the y=0
 *  markLine and the line itself stay the primary read (spec §4.5: "who
 *  gains where" is a background cue, not the headline). */
const DELTA_AREA_ALPHA = 0.15

/** One of the 3 plain telemetry channels rendered as a static two-pilot line
 *  chart (Delta gets its own builder — it's one cross-pilot series, not one
 *  line per pilot). */
export type LineChannel = 'speed' | 'brake' | 'throttle'

interface ChannelSpec {
  title: string
  unit: string
  read(pilot: PilotModel): Float32Array
}

const LINE_CHANNELS: Record<LineChannel, ChannelSpec> = {
  speed: { title: 'Speed', unit: 'km/h', read: (pilot) => pilot.speed },
  brake: { title: 'Brake', unit: '%', read: (pilot) => pilot.brake },
  throttle: { title: 'Throttle', unit: '%', read: (pilot) => pilot.throttle },
}

/** Stable render order for the grid + the source for each pane's title. */
export const LINE_CHANNEL_KEYS: readonly LineChannel[] = ['speed', 'brake', 'throttle']

/** "Speed (km/h)" — the channel's title, unit inline (the pane header carries
 *  it; the option itself drops a redundant y-axis name, per ChannelChart's
 *  own convention). */
export function lineChannelTitle(channel: LineChannel): string {
  const spec = LINE_CHANNELS[channel]
  return `${spec.title} (${spec.unit})`
}

export const DELTA_TITLE = 'Delta (s)'

/** [distance, value] pairs sharing the model's common distance grid — same
 *  point count as `distance` for every channel (all baked onto the same grid
 *  in buildReplayModel), which is what channelOptions.test.ts pins. */
function toPoints(distance: Float64Array, values: ArrayLike<number>): Array<[number, number]> {
  return Array.from(distance, (d, i) => [d, values[i]])
}

/** Team colour for a pilot: the payload's own `color` first, `getDriverColor`
 *  only as a fallback for a missing/empty value ("team colours come from the
 *  payload; getDriverColor/getDriverTextColor are fallbacks only"). */
function pilotColor(pilot: PilotModel, year: number | undefined): string {
  return pilot.color || getDriverColor(pilot.code, year)
}

/** One tooltip row per hovered series, the name in its resolved colour and
 *  the value right-aligned in mono — clones ChannelChart.tsx's
 *  `buildTooltipFormatter`, keyed here by an explicit colour map since this
 *  grid's series names are pilot codes, not arbitrary driver strings. */
function buildTooltipFormatter(colorByName: Record<string, string>) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    return items
      .map(({ seriesName, value }) => {
        if (!seriesName) return ''
        const raw = Array.isArray(value) ? value[value.length - 1] : value
        const display = typeof raw === 'number' ? raw.toFixed(1) : String(raw ?? '')
        return `<div style="display:flex;justify-content:space-between;gap:20px;">
  <span style="color:${colorByName[seriesName] ?? 'inherit'}">${seriesName}</span>
  <span style="font-family:${MONO}">${display}</span>
</div>`
      })
      .join('')
  }
}

/** Shared chrome for all 4 panes: tooltip, legend (hidden below 2 entries —
 *  Delta has none, since it's one cross-pilot series, not one per pilot),
 *  grid, and the distance x-axis. Mirrors ChannelChart.tsx's `baseOption`. */
function baseChannelOption(
  legend: Array<{ name: string; color: string }>,
  tooltipFormatter: (params: TooltipComponentFormatterCallbackParams) => string,
): EChartsOption {
  const showLegend = legend.length > 1
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: tooltipFormatter,
    },
    legend: showLegend
      ? {
          data: legend.map(({ name, color }) => ({ name, textStyle: { color } })),
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 3,
          top: 0,
        }
      : { show: false },
    grid: GRID,
    xAxis: {
      type: 'value',
      splitLine: { show: false },
      // These panes are ~240px wide, so the raw metre ticks (500,1000,…) collide
      // into an unreadable smear. Compact them to km and let ECharts drop any
      // that still overlap. The moving cursor + S1/S2/S3 scrubber ticks carry the
      // precise position; the axis just needs a legible sense of scale.
      axisLabel: {
        hideOverlap: true,
        formatter: (value: string | number) => {
          const n = Number(value)
          return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
        },
      },
    },
    yAxis: { type: 'value', scale: true },
  }
}

/** One line series per pilot, x = distance, y = the given channel's baked
 *  values, coloured by team. Static — a fresh option per (model, channel);
 *  the caller never calls `setOption` again once it's mounted. */
export function buildLineOption(
  model: ReplayModel,
  channel: LineChannel,
  year?: number,
): EChartsOption {
  const spec = LINE_CHANNELS[channel]
  const colors = model.pilots.map((pilot) => pilotColor(pilot, year))
  const legend = model.pilots.map((pilot, i) => ({ name: pilot.code, color: colors[i] }))
  const colorByName = Object.fromEntries(legend.map(({ name, color }) => [name, color]))

  const series: LineSeriesOption[] = model.pilots.map((pilot, i) => ({
    name: pilot.code,
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: colors[i] },
    itemStyle: { color: colors[i] },
    data: toPoints(model.distance, spec.read(pilot)),
  }))

  return { ...baseChannelOption(legend, buildTooltipFormatter(colorByName)), series }
}

/** One zero-anchored area fill carrying one sign of the delta: `keepPositive`
 *  clamps to `max(v,0)` (pilot1-slower region, tinted pilot1), otherwise
 *  `min(v,0)` (pilot2-slower, tinted pilot2). `origin: 0` fills to the zero
 *  baseline, not the axis floor. Silent + unnamed so it adds no tooltip row.
 *
 *  This replaces a piecewise `visualMap` (spec §4.5's original suggestion),
 *  which in filter mode silently drops the whole line — verified in the browser.
 *  Two explicit fills + a solid line render reliably in both themes. */
function buildSignFill(
  points: Array<[number, number]>,
  keepPositive: boolean,
  color: string,
): LineSeriesOption {
  return {
    type: 'line',
    silent: true,
    showSymbol: false,
    lineStyle: { width: 0 },
    areaStyle: { color, opacity: DELTA_AREA_ALPHA, origin: 0 },
    data: points.map(([d, v]) => [d, keepPositive ? Math.max(v, 0) : Math.min(v, 0)]),
    z: 1,
  }
}

/** The delta chart: a solid delta CURVE (`model.delta`, already scaled to the
 *  real lap-time gap — positive = pilot1 slower), a dashed y=0 reference line,
 *  and two sign-tinted area fills that show "who gains where" while stopped. */
export function buildDeltaOption(model: ReplayModel, chartTheme?: string): EChartsOption {
  const [pilot1, pilot2] = model.pilots
  const markLineColor = chartTheme === F1_LIGHT_THEME ? MARK_LINE_COLOR_LIGHT : MARK_LINE_COLOR_DARK
  const points = toPoints(model.distance, model.delta)

  const line: LineSeriesOption = {
    name: 'Δ',
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: DELTA_LINE_COLOR },
    data: points,
    markLine: {
      symbol: 'none',
      silent: true,
      label: { show: false }, // no stray "0" tag at the line's end
      lineStyle: { type: 'dashed', color: markLineColor },
      data: [{ yAxis: 0 }],
    },
    z: 3,
  }

  return {
    // Delta's own legend is hidden (see `baseChannelOption` — one conceptual
    // series); the tooltip colour map keeps a hover over "Δ" legible.
    ...baseChannelOption([], buildTooltipFormatter({ Δ: DELTA_LINE_COLOR })),
    series: [
      buildSignFill(points, true, pilot1.color),
      buildSignFill(points, false, pilot2.color),
      line,
    ],
  }
}
