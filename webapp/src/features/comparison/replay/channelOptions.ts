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
import { getDriverColor, resolvePilotColor } from '@/lib/drivers'
import type { PilotModel, ReplayModel } from './types'

/** The app's light/dark mode — threaded into the builders below so identity
 *  colours (`resolvePilotColor`) and the theme-only ink (markLine, delta
 *  curve) can be resolved from one value, without the builders reaching into
 *  `useUiStore` themselves (they stay pure — see the module docstring). */
export type UiTheme = 'dark' | 'light'

const LINE_WIDTH = 2
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"
const GRID = { top: 16, left: 8, right: 20, bottom: 8, containLabel: true } as const

// Delta's y=0 markLine isn't governed by the registered ECharts theme (same
// reasoning as ChannelChart.tsx's own MARK_LINE_COLOR_DARK/LIGHT), so its
// colour is threaded in per the app's current light/dark mode.
const MARK_LINE_COLOR_DARK = 'rgba(255,255,255,0.35)'
const MARK_LINE_COLOR_LIGHT = 'rgba(20,18,31,0.35)'

/** The delta CURVE itself — a neutral fg-2 tone (mirrors echartsTheme.ts's own
 *  DARK/LIGHT_PALETTE.fg2), not the brand accent purple: the accent already
 *  means "the moving cursor" (CursorOverlay's `bg-accent` playhead line), and
 *  two unrelated meanings on one hue collide (Fable UI audit, finding P1). The
 *  sign-split fills below carry the driver-identity colour instead. */
const DELTA_LINE_COLOR_DARK = 'rgba(255,255,255,0.72)'
const DELTA_LINE_COLOR_LIGHT = 'rgba(20,18,31,0.75)'

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

/** "Speed" — the uppercase-styled part of the pane header. Split from the
 *  unit (below) so ChannelPane can render the label `uppercase` while the
 *  unit stays as-typed: CSS `uppercase` on a combined "Speed (km/h)" string
 *  smashed "(s)" into "(S)" (Fable UI audit, P3). */
export function lineChannelLabel(channel: LineChannel): string {
  return LINE_CHANNELS[channel].title
}

/** "(km/h)" — rendered in a `normal-case` span so the unit's own casing
 *  (lowercase "s", "km/h") survives the label's `uppercase` styling. */
export function lineChannelUnit(channel: LineChannel): string {
  return `(${LINE_CHANNELS[channel].unit})`
}

export const DELTA_LABEL = 'Delta'
export const DELTA_UNIT = '(s)'

/** [distance, value] pairs sharing the model's common distance grid — same
 *  point count as `distance` for every channel (all baked onto the same grid
 *  in buildReplayModel), which is what channelOptions.test.ts pins. */
function toPoints(distance: Float64Array, values: ArrayLike<number>): Array<[number, number]> {
  return Array.from(distance, (d, i) => [d, values[i]])
}

/** Team colour for a pilot: the payload's own `color` first, `getDriverColor`
 *  only as a fallback for a missing/empty value ("team colours come from the
 *  payload; getDriverColor/getDriverTextColor are fallbacks only"). Exported
 *  so ChannelPane's header chips (P1: team-coloured chips replacing the
 *  in-plot legend) resolve identity colour the same way as the series do,
 *  rather than duplicating the fallback. */
export function pilotColor(pilot: PilotModel, year: number | undefined): string {
  return pilot.color || getDriverColor(pilot.code, year)
}

/** One tooltip row per hovered series, the name in its resolved colour and
 *  the value right-aligned in mono — clones ChannelChart.tsx's
 *  `buildTooltipFormatter`, keyed here by an explicit colour map since this
 *  grid's series names are pilot codes, not arbitrary driver strings.
 *  `decimals` is per-channel (P3): delta reads to 3dp (the verdict itself is
 *  a sub-second gap, e.g. 0.831s — 1dp rounded it to a misleading "0.8"),
 *  the plain telemetry channels round to whole units. */
function buildTooltipFormatter(colorByName: Record<string, string>, decimals: number) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    return items
      .map(({ seriesName, value }) => {
        if (!seriesName) return ''
        const raw = Array.isArray(value) ? value[value.length - 1] : value
        const display = typeof raw === 'number' ? raw.toFixed(decimals) : String(raw ?? '')
        return `<div style="display:flex;justify-content:space-between;gap:20px;">
  <span style="color:${colorByName[seriesName] ?? 'inherit'}">${seriesName}</span>
  <span style="font-family:${MONO}">${display}</span>
</div>`
      })
      .join('')
  }
}

/** Shared chrome for all 4 panes: tooltip, grid, and the distance x-axis.
 *  Mirrors ChannelChart.tsx's `baseOption`. No in-plot ECharts legend — it
 *  used to sit at `top: 0` inside the grid and collide with the data itself
 *  (P1 Fable finding: "VER — LEC" drawn on top of 100% brake/throttle
 *  lines); driver identity now lives in ChannelPane's header chips instead,
 *  one pattern for all 4 panes. */
function baseChannelOption(
  tooltipFormatter: (params: TooltipComponentFormatterCallbackParams) => string,
): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: tooltipFormatter,
    },
    legend: { show: false },
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
 *  values, coloured by team. Static — a fresh option per (model, channel,
 *  theme); the caller never calls `setOption` again once it's mounted.
 *  Colours pass through `resolvePilotColor` (P2: a team colour that's too
 *  dark for the dark cards, e.g. Red Bull's navy, otherwise recedes to
 *  near-invisible next to a saturated rival like Ferrari red). */
export function buildLineOption(
  model: ReplayModel,
  channel: LineChannel,
  year?: number,
  theme: UiTheme = 'dark',
): EChartsOption {
  const spec = LINE_CHANNELS[channel]
  const colors = model.pilots.map((pilot) => resolvePilotColor(pilotColor(pilot, year), theme))
  const colorByName = Object.fromEntries(model.pilots.map((pilot, i) => [pilot.code, colors[i]]))

  const series: LineSeriesOption[] = model.pilots.map((pilot, i) => ({
    name: pilot.code,
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: colors[i] },
    itemStyle: { color: colors[i] },
    data: toPoints(model.distance, spec.read(pilot)),
  }))

  return { ...baseChannelOption(buildTooltipFormatter(colorByName, 0)), series }
}

/** One zero-anchored area fill carrying one sign of the delta: `keepPositive`
 *  clamps to `max(v,0)`, otherwise `min(v,0)`. `origin: 0` fills to the zero
 *  baseline, not the axis floor. Silent + unnamed so it adds no tooltip row.
 *  `animation: false` — this is a decorative background cue (not the
 *  headline read), so it paints at its full extent immediately rather than
 *  playing ECharts' default left-to-right entrance sweep; that sweep is what
 *  made the fill look like it "terminated early" when captured mid-animation
 *  (Fable UI audit, P2 — the underlying delta data already spans the full
 *  distance grid, see buildReplayModel's `computeDelta`).
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
    animation: false,
    lineStyle: { width: 0 },
    areaStyle: { color, opacity: DELTA_AREA_ALPHA, origin: 0 },
    data: points.map(([d, v]) => [d, keepPositive ? Math.max(v, 0) : Math.min(v, 0)]),
    z: 1,
  }
}

/** The delta chart: a solid delta CURVE (`model.delta`, already scaled to the
 *  real lap-time gap — positive = pilot1 slower, i.e. pilot2 AHEAD there), a
 *  dashed y=0 reference line, and two sign-tinted area fills that show "who
 *  gains where" while stopped. Each fill is tinted by the driver GAINING /
 *  AHEAD in that region, not the one falling behind — the original build
 *  tinted the positive (pilot1-slower) region in pilot1's own colour, i.e.
 *  the pane glowed the LOSING driver's hue with no way to decode + vs −
 *  (Fable UI audit, P1: "the chart contradicts the banner at first glance").
 *  ChannelPane's header sign-key spells out the same convention in words. */
export function buildDeltaOption(model: ReplayModel, theme: UiTheme = 'dark'): EChartsOption {
  const [pilot1, pilot2] = model.pilots
  const markLineColor = theme === 'light' ? MARK_LINE_COLOR_LIGHT : MARK_LINE_COLOR_DARK
  const deltaLineColor = theme === 'light' ? DELTA_LINE_COLOR_LIGHT : DELTA_LINE_COLOR_DARK
  const aheadColor1 = resolvePilotColor(pilotColor(pilot1, undefined), theme) // pilot1 AHEAD (delta < 0)
  const aheadColor2 = resolvePilotColor(pilotColor(pilot2, undefined), theme) // pilot2 AHEAD (delta > 0)
  const points = toPoints(model.distance, model.delta)

  const line: LineSeriesOption = {
    name: 'Δ',
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: deltaLineColor },
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
    // Delta's own legend is hidden (see `baseChannelOption`); the tooltip
    // colour map keeps a hover over "Δ" legible, at 3dp (see buildTooltipFormatter).
    ...baseChannelOption(buildTooltipFormatter({ Δ: deltaLineColor }, 3)),
    series: [
      buildSignFill(points, true, aheadColor2),
      buildSignFill(points, false, aheadColor1),
      line,
    ],
  }
}
