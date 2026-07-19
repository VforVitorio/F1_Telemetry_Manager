// Pure ECharts option builders for the Comparison replay's 4-channel grid
// (Delta, Speed, Brake, Throttle). Each option is built ONCE per (model,
// theme) — see ChannelGrid's `useMemo` — and never touched again: the moving
// playhead is a DOM overlay (CursorOverlay/FutureDimmer), never a per-frame
// `setOption`/`dispatchAction`. Kept framework- and ECharts-instance-free
// (plain option objects only) so the shape is unit-testable without mounting
// a chart — see channelOptions.test.ts.
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

/** Area fill under each sign of the delta — faint enough that the two
 *  team-coloured lines (the faster's flat baseline + the slower's deficit curve)
 *  stay the primary read. Tinted by the driver AHEAD in that region, so "who
 *  gains where" reads as a background cue, not the headline. */
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
 *  would smash "(s)" into "(S)". */
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
 *  only as a fallback for a missing/empty value (team colours come from the
 *  payload; getDriverColor is a fallback only). Exported so ChannelPane's
 *  team-coloured header chips resolve identity colour the same way as the
 *  series do, rather than duplicating the fallback. */
export function pilotColor(pilot: PilotModel, year: number | undefined): string {
  return pilot.color || getDriverColor(pilot.code, year)
}

/** One tooltip row per hovered series, the name in its resolved colour and
 *  the value right-aligned in mono — clones ChannelChart.tsx's
 *  `buildTooltipFormatter`, keyed here by an explicit colour map since this
 *  grid's series names are pilot codes, not arbitrary driver strings.
 *  `decimals` is per-channel: delta reads to 3dp (the verdict itself is a
 *  sub-second gap, e.g. 0.831s — 1dp would round it to a misleading "0.8"),
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

/** "Level" only when the gap, shown to 3dp, would read +0.000. F1 timing
 *  resolves to a thousandth: a +0.004 lead is a real lead in qualifying, never a
 *  tie — 0.005 was swallowing gaps the tooltip itself would then display. */
const DELTA_TIE_THRESHOLD = 0.0005

/** Delta pane's OWN tooltip: the chart is the slower driver's oriented deficit
 *  curve (positive = slower behind) plus the faster's flat baseline and two sign
 *  fills, so the generic per-series formatter would print anonymous rows. Read
 *  the SLOWER's curve value at the hovered point and render a single row naming
 *  the driver AHEAD there — team-coloured dot + code + gap. */
function buildDeltaTooltipFormatter(
  fasterCode: string,
  fasterColor: string,
  slowerCode: string,
  slowerColor: string,
) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    const curve = items.find((it) => it.seriesName === slowerCode)
    if (!curve) return ''
    const raw = Array.isArray(curve.value) ? curve.value[curve.value.length - 1] : curve.value
    const v = typeof raw === 'number' ? raw : 0
    if (Math.abs(v) < DELTA_TIE_THRESHOLD) {
      return `<div style="font-family:${MONO};color:inherit">Level</div>`
    }
    // oriented curve: positive = the slower is behind here, so the FASTER is ahead.
    const aheadCode = v > 0 ? fasterCode : slowerCode
    const aheadColor = v > 0 ? fasterColor : slowerColor
    const gap = Math.abs(v).toFixed(3)
    return `<div style="display:flex;align-items:center;gap:7px;">
  <span style="width:8px;height:8px;border-radius:50%;background:${aheadColor};display:inline-block"></span>
  <span style="color:${aheadColor};font-weight:600">${aheadCode}</span>
  <span style="font-family:${MONO}">&#9650; +${gap}s</span>
</div>`
  }
}

/** Shared chrome for all 4 panes: tooltip, grid, and the distance x-axis.
 *  Mirrors ChannelChart.tsx's `baseOption`. No in-plot ECharts legend — it
 *  would sit at `top: 0` inside the grid and collide with the data itself
 *  ("VER — LEC" drawn on top of 100% brake/throttle lines); driver identity
 *  lives in ChannelPane's header chips instead, one pattern for all 4 panes. */
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
 *  Colours pass through `resolvePilotColor` so a team colour that's too dark
 *  for the dark cards (e.g. Red Bull's navy) is lifted, rather than receding
 *  to near-invisible next to a saturated rival like Ferrari red. */
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
 *  playing ECharts' default left-to-right entrance sweep; that sweep made the
 *  fill look like it "terminated early" when captured mid-animation, even
 *  though the delta data already spans the full distance grid.
 *
 *  Two explicit sign fills, rather than one line under a piecewise `visualMap`
 *  — the visualMap in filter mode silently drops the whole line. Two fills + a
 *  solid line render reliably in both themes. */
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

/** The delta chart, Streamlit-faithful: TWO team-coloured lines — the
 *  FASTER driver as a flat line at y=0 in their
 *  colour (the reference baseline), the SLOWER driver as their cumulative
 *  DEFICIT curve in their colour (positive = behind, negative dips = stretches
 *  they were actually ahead on cumulative time). Plus the two sign-tinted fills
 *  (above 0 = faster's colour, below = slower's) as a background "who gains
 *  where" cue. No neutral curve, no dashed grey markLine — the faster's flat
 *  team line IS the zero baseline. `model.delta` = pilot1 − pilot2, so the
 *  slower's curve is `-delta` when the faster is pilot1, `+delta` otherwise; it
 *  lands exactly on `winner.gapSeconds` at the flag. */
export function buildDeltaOption(model: ReplayModel, theme: UiTheme = 'dark'): EChartsOption {
  const fasterIdx = model.winner.winnerIndex
  const faster = model.pilots[fasterIdx]
  const slower = model.pilots[1 - fasterIdx]
  const fasterColor = resolvePilotColor(pilotColor(faster, undefined), theme)
  const slowerColor = resolvePilotColor(pilotColor(slower, undefined), theme)

  const sign = fasterIdx === 0 ? -1 : 1
  const oriented: Array<[number, number]> = Array.from(model.distance, (d, i) => [
    d,
    sign * model.delta[i],
  ])
  const baseline: Array<[number, number]> = Array.from(model.distance, (d) => [d, 0])

  const fasterLine: LineSeriesOption = {
    name: faster.code,
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: fasterColor },
    itemStyle: { color: fasterColor },
    data: baseline,
    z: 2,
  }
  const slowerLine: LineSeriesOption = {
    name: slower.code,
    type: 'line',
    showSymbol: false,
    lineStyle: { width: LINE_WIDTH, color: slowerColor },
    itemStyle: { color: slowerColor },
    data: oriented,
    z: 3,
  }

  return {
    ...baseChannelOption(
      buildDeltaTooltipFormatter(faster.code, fasterColor, slower.code, slowerColor),
    ),
    series: [
      buildSignFill(oriented, true, fasterColor), // above 0: faster ahead
      buildSignFill(oriented, false, slowerColor), // below 0: slower ahead (their purple stretch)
      fasterLine,
      slowerLine,
    ],
  }
}
