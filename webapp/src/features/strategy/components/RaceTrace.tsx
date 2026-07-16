// RaceTrace (#35 signature instrument) — turns the old static lap-range chip
// into a full-width, clickable pace trajectory. It always plots the driver's
// WHOLE lap range (never a sliced sub-array): the evidence window the
// orchestrator actually reasoned over is a bright "spotlight" laid on top of
// the full trace, everything outside it is veiled. That framing is the point
// of the redesign — a strategist can see the shape of the whole race while
// staying oriented on which slice of it produced the current recommendation,
// and can drag the cursor like a video-editor scrubber (or click, or arrow-key)
// anywhere inside the window to move the decision cursor without losing that
// context; where the drag stops is the lap the re-run below the chart analyses.
//
// ECharts wiring mirrors ScenarioScoresChart.tsx: `registerF1Theme()` once at
// module load, `useChartTheme()` + `key={chartTheme}` to remount on a
// light/dark toggle, and `useFirstPaintAnimation` so the entrance sweep plays
// once and every later update (moving the cursor, a new run pinned) applies
// instantly — see that hook's own docstring and the note on
// `buildTraceOption` below for why this matters here specifically.

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import ReactECharts from 'echarts-for-react'
import type {
  ECharts,
  EChartsOption,
  LineSeriesOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  MarkPointComponentOption,
  ScatterSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { F1_LIGHT_THEME, tireColors } from '@/charts/echartsTheme'
import { ChartCard } from '@/components/ChartCard'
import { Skeleton } from '@/components/Skeleton'
import type { PaceRangePoint, StrategyAction } from '@/lib/api/strategy'

registerF1Theme()

const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"

const CHART_HEIGHT_PX = 340

// Identity colors — same in both themes, matching echartsTheme.ts's series
// palette / tokens.css's purple ramp.
const ACTUAL_COLOR = '#3385ff'
const PRED_COLOR = '#a29bfe'
const CI_BAND_COLOR = '#a29bfe'
const CI_BAND_ALPHA = 0.1
const STINT_AREA_ALPHA = 0.11
const ACCENT = '#6c5ce7'

// Per-action pin colors (run flags) — mirrors the same 5-value enum used
// throughout the Strategy tab (StintTimeline's pit tick, DecisionBanner).
const ACTION_COLORS: Record<StrategyAction, string> = {
  STAY_OUT: '#43d67a',
  PIT_NOW: '#ef4444',
  UNDERCUT: '#f59e0b',
  OVERCUT: '#f59e0b',
  ALERT: '#ef4444',
}
const NEUTRAL_ACTION_COLOR = '#94a3b8'

// The muted tones (stint-end marker, spotlight veil) DO need a per-theme swap
// — an ECharts per-series color bypasses the registered theme entirely, same
// reasoning as ScenarioScoresChart's ScorePalette / ChannelChart's
// markLineColor.
interface TracePalette {
  veil: string
  mutedLine: string
  mutedLabel: string
}

const DARK_TRACE_PALETTE: TracePalette = {
  veil: 'rgba(8,8,12,0.55)',
  mutedLine: 'rgba(255,255,255,0.4)',
  mutedLabel: 'rgba(255,255,255,0.65)',
}

const LIGHT_TRACE_PALETTE: TracePalette = {
  veil: 'rgba(245,245,247,0.6)',
  mutedLine: 'rgba(20,18,31,0.4)',
  mutedLabel: 'rgba(20,18,31,0.65)',
}

const RUN_PIN_SIZE = 20
const RUN_PIN_SIZE_ACTIVE = 26
const RUN_PIN_HIT_RADIUS_PX = 16
const PIT_MARKER_PIXEL_OFFSET: [number, number] = [0, -14]

const RUNS_SERIES_NAME = 'runs'
const EMPTY_OPTION: EChartsOption = { series: [] }

// ---- Small formatting helpers ----------------------------------------------

/** Seconds -> "M:SS" for the y-axis ticks (integer seconds; the exact
 *  millisecond value only matters in a hover, which this chart doesn't wire
 *  for the continuous lines — see `buildTraceOption`'s tooltip note). Kept
 *  local rather than imported from `features/dashboard/lib/lapTime` — the
 *  Strategy feature doesn't reach into Dashboard's module tree (LapReadout.tsx
 *  keeps its own tiny `formatLapTime` for the same reason). */
function formatSecondsAxis(seconds: number): string {
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Compound name -> tyre-color hex. `tireColors` keys are the UPPERCASE
 *  compound names ('SOFT'/'MEDIUM'/'HARD'/...); FastF1 hands back lowercase
 *  ('soft', with 'inter' as an alias of 'intermediate') — folded here rather
 *  than importing dashboard's `compoundVariant` switch, same isolation
 *  reasoning as `formatSecondsAxis` above. Unknown compounds get a neutral
 *  grey, never a branded color. */
function compoundColor(compound: string): string {
  const key = compound.toLowerCase() === 'inter' ? 'INTERMEDIATE' : compound.toUpperCase()
  return tireColors[key] ?? '#6b7280'
}

/** Single-letter stint-band label (S/M/H/...). */
function compoundInitial(compound: string): string {
  return compound.charAt(0).toUpperCase()
}

function actionColor(action: StrategyAction): string {
  return ACTION_COLORS[action] ?? NEUTRAL_ACTION_COLOR
}

function clampLap(lap: number, windowRange: [number, number]): number {
  return Math.min(windowRange[1], Math.max(windowRange[0], lap))
}

// ---- Data shaping -----------------------------------------------------------

/** The full lap range spanned by `points` — the x-axis always shows this
 *  whole span (never just `window`), so the spotlight veil has a real "outside"
 *  to darken. Only called once `points` is known non-empty. */
function lapDomain(points: PaceRangePoint[]): [number, number] {
  const laps = points.map((point) => point.lap)
  return [Math.min(...laps), Math.max(...laps)]
}

interface StintBand {
  compound: string
  startLap: number
  endLap: number
}

/** Contiguous runs of points sharing the same `stint` index, assumed sorted
 *  ascending by lap (the pace-range endpoint returns them in lap order). Each
 *  band becomes one tire-colored `markArea` rectangle with an S/M/H label. */
function groupStints(points: PaceRangePoint[]): StintBand[] {
  const bands: StintBand[] = []
  let currentStint: number | null = null

  for (const point of points) {
    const band = bands[bands.length - 1]
    if (band && currentStint === point.stint) {
      band.endLap = point.lap
    } else {
      bands.push({ compound: point.compound, startLap: point.lap, endLap: point.lap })
      currentStint = point.stint
    }
  }

  return bands
}

/** `ci_p90 - ci_p10` for the stacked-area delta series, or `null` when either
 *  bound is missing — ECharts renders a `null` value as a gap in a stacked
 *  area, which is exactly "skip the band where the model has no CI" (see
 *  `buildCiBandSeries`'s docstring for the full recipe). */
function ciDelta(point: PaceRangePoint): number | null {
  if (point.ci_p10 == null || point.ci_p90 == null) return null
  return point.ci_p90 - point.ci_p10
}

/** The plotted y-value (actual, falling back to predicted) at a given lap —
 *  used to anchor a run-flag pin or the pit marker to the trace itself rather
 *  than a fixed height. `null` when the lap isn't in `points` at all. */
function resolveYForLap(points: PaceRangePoint[], lap: number): number | null {
  const target = Math.round(lap)
  const point = points.find((candidate) => candidate.lap === target)
  if (!point) return null
  return point.actual ?? point.pred
}

/** Highest plotted value across actual/pred/CI-p90 — the fallback anchor for
 *  a marker whose lap has no matching point (an out-of-range pit target, a run
 *  pinned past the loaded window). */
function domainTop(points: PaceRangePoint[]): number {
  const values = points
    .flatMap((point) => [point.actual, point.pred, point.ci_p90])
    .filter((value): value is number => value != null)
  return values.length ? Math.max(...values) : 0
}

// ---- Series builders --------------------------------------------------------

function buildActualSeries(points: PaceRangePoint[]): LineSeriesOption {
  return {
    name: 'actual',
    type: 'line',
    symbol: 'none',
    connectNulls: false,
    lineStyle: { color: ACTUAL_COLOR, width: 2 },
    itemStyle: { color: ACTUAL_COLOR },
    tooltip: { show: false },
    z: 15,
    data: points.map((point) => [point.lap, point.actual]),
  }
}

function buildPredSeries(points: PaceRangePoint[]): LineSeriesOption {
  return {
    name: 'pred',
    type: 'line',
    symbol: 'none',
    lineStyle: { color: PRED_COLOR, width: 1.5, type: 'dashed' },
    itemStyle: { color: PRED_COLOR },
    tooltip: { show: false },
    z: 14,
    data: points.map((point) => [point.lap, point.pred]),
  }
}

/**
 * The P10-P90 confidence band via ECharts' standard stacked-area recipe:
 * a transparent BASE series plotting `ci_p10`, and a transparent DELTA series
 * plotting `ci_p90 - ci_p10` stacked on top of it (`stack: 'ci'`) with the
 * fill drawn only on the delta series. Stacking makes the visible band sit
 * between p10 and p90 without a third "shape" series — ECharts has no native
 * "band between two lines" mark, so base+delta is the documented workaround.
 * Both series are `silent` (no hover/tooltip) since the band is read visually,
 * not interactively.
 */
function buildCiBandSeries(points: PaceRangePoint[]): [LineSeriesOption, LineSeriesOption] {
  const base: LineSeriesOption = {
    name: 'ci-base',
    type: 'line',
    stack: 'ci',
    symbol: 'none',
    silent: true,
    tooltip: { show: false },
    lineStyle: { opacity: 0 },
    z: 5,
    data: points.map((point) => [point.lap, point.ci_p10]),
  }
  const delta: LineSeriesOption = {
    name: 'ci-band',
    type: 'line',
    stack: 'ci',
    symbol: 'none',
    silent: true,
    tooltip: { show: false },
    lineStyle: { opacity: 0 },
    areaStyle: { color: CI_BAND_COLOR, opacity: CI_BAND_ALPHA },
    z: 4,
    data: points.map((point) => [point.lap, ciDelta(point)]),
  }
  return [base, delta]
}

type MarkAreaEntry = NonNullable<MarkAreaComponentOption['data']>[number]

function buildStintMarkAreaEntries(stints: StintBand[]): MarkAreaEntry[] {
  return stints.map((band): MarkAreaEntry => {
    const color = compoundColor(band.compound)
    return [
      {
        xAxis: band.startLap,
        itemStyle: { color, opacity: STINT_AREA_ALPHA },
        label: {
          show: true,
          formatter: compoundInitial(band.compound),
          position: 'insideTop' as const,
          fontFamily: MONO,
          fontSize: 10,
          color,
        },
      },
      { xAxis: band.endLap },
    ]
  })
}

/** A ghost line series (no visible data of its own) whose only job is to host
 *  the stint-compound `markArea` bands, at a LOW z so every other layer —
 *  the CI band, the pace lines, the spotlight veil — paints over it. */
function buildStintBandsSeries(stints: StintBand[]): LineSeriesOption {
  return {
    name: 'stint-bands',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 1,
    markArea: { silent: true, data: buildStintMarkAreaEntries(stints) },
  }
}

/** The two veil rectangles outside `windowRange` — `[domainStart, windowStart]`
 *  and `[windowEnd, domainEnd]`, skipped where the window already touches the
 *  domain edge (a zero-width markArea would still register visually as a
 *  hairline). */
function buildSpotlightMarkAreaEntries(
  domain: [number, number],
  windowRange: [number, number],
  veilColor: string,
): MarkAreaEntry[] {
  const [domainStart, domainEnd] = domain
  const [windowStart, windowEnd] = windowRange
  const entries: MarkAreaEntry[] = []

  if (windowStart > domainStart) {
    entries.push([{ xAxis: domainStart, itemStyle: { color: veilColor } }, { xAxis: windowStart }])
  }
  if (windowEnd < domainEnd) {
    entries.push([{ xAxis: windowEnd, itemStyle: { color: veilColor } }, { xAxis: domainEnd }])
  }

  return entries
}

/**
 * The evidence-window spotlight: a ghost series hosting the two veil
 * `markArea`s, at a HIGH z so it paints OVER the stint bands, CI band, and
 * pace lines — visually washing them out everywhere except the window the
 * orchestrator actually analysed. Markers (cursor, pit, stint-end, run pins)
 * still render above this in their own higher-z series, so the decision
 * surface stays legible even where it crosses the veil.
 */
function buildSpotlightSeries(
  domain: [number, number],
  windowRange: [number, number],
  veilColor: string,
): LineSeriesOption {
  const data = buildSpotlightMarkAreaEntries(domain, windowRange, veilColor)
  return {
    name: 'spotlight',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 20,
    ...(data.length ? { markArea: { silent: true, data } } : {}),
  }
}

type MarkLineEntry = NonNullable<MarkLineComponentOption['data']>[number]
type MarkPointEntry = NonNullable<MarkPointComponentOption['data']>[number]

/** The purple decision-cursor line — always present, since `cursorLap` is a
 *  required prop (there is always a lap the orchestrator is analysing). */
function buildCursorMarkLineEntry(cursorLap: number): MarkLineEntry {
  return {
    xAxis: cursorLap,
    lineStyle: { color: ACCENT, width: 2 },
    label: {
      show: true,
      formatter: `DECISION · LAP ${cursorLap}`,
      position: 'insideEndTop',
      fontFamily: MONO,
      fontSize: 10,
      fontWeight: 600,
      color: ACCENT,
    },
  }
}

/** A softer, dashed line for where the current stint is expected to run out —
 *  a tyre-life estimate, not a committed action, so it's styled to read as
 *  less certain than the cursor (mirrors StintTimeline's `StintEndMarker`). */
function buildStintEndMarkLineEntry(
  expectedStintEnd: number,
  lineColor: string,
  labelColor: string,
): MarkLineEntry {
  return {
    xAxis: expectedStintEnd,
    lineStyle: { color: lineColor, width: 1.5, type: 'dashed' },
    label: {
      show: true,
      formatter: 'stint end',
      position: 'insideEndTop',
      fontFamily: MONO,
      fontSize: 10,
      color: labelColor,
    },
  }
}

/** The planned pit lap as a small triangle riding the trace itself: anchored
 *  to the actual/predicted y-value at that lap (falling back to the domain
 *  top for an out-of-range target), then nudged up a fixed PIXEL offset
 *  (`symbolOffset`, not a data-space offset) so it floats just above the line
 *  regardless of the y-axis's autoscaled range. */
function buildPitMarkPointEntry(pitLapTarget: number, points: PaceRangePoint[]): MarkPointEntry {
  const y = resolveYForLap(points, pitLapTarget) ?? domainTop(points)
  return {
    name: 'Pit',
    coord: [pitLapTarget, y],
    symbol: 'triangle',
    symbolSize: 12,
    symbolOffset: PIT_MARKER_PIXEL_OFFSET,
    itemStyle: { color: ACCENT },
    label: { show: false },
  }
}

/** A third ghost series hosting the decision cursor, the optional stint-end
 *  line, and the optional pit marker — all null-tolerant per-prop overlays,
 *  at a z above the spotlight veil so they stay crisp even when they land
 *  outside the evidence window. */
function buildMarkersSeries(
  cursorLap: number,
  pitLapTarget: number | null | undefined,
  expectedStintEnd: number | null | undefined,
  points: PaceRangePoint[],
  palette: TracePalette,
): LineSeriesOption {
  const markLineData: MarkLineEntry[] = [buildCursorMarkLineEntry(cursorLap)]
  if (expectedStintEnd != null) {
    markLineData.push(
      buildStintEndMarkLineEntry(expectedStintEnd, palette.mutedLine, palette.mutedLabel),
    )
  }
  const markPointData: MarkPointEntry[] =
    pitLapTarget != null ? [buildPitMarkPointEntry(pitLapTarget, points)] : []

  return {
    name: 'markers',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 30,
    markLine: { silent: true, symbol: 'none', data: markLineData },
    ...(markPointData.length ? { markPoint: { silent: true, data: markPointData } } : {}),
  }
}

interface RunPoint {
  run: RaceTraceRun
  y: number
}

/** Each run resolved to a plotted `(lap, y)` position, y taken from the trace
 *  at that lap (or the domain top when the run's lap isn't loaded). Shared by
 *  the scatter series builder and the click picker so both agree on where a
 *  pin actually sits on screen. */
function resolveRunPoints(runs: RaceTraceRun[], points: PaceRangePoint[]): RunPoint[] {
  if (runs.length === 0) return []
  const fallbackY = domainTop(points)
  return runs.map((run) => ({ run, y: resolveYForLap(points, run.lap) ?? fallbackY }))
}

/** Past runs pinned at their laps, colored by action, the active run's pin
 *  enlarged. The only series with a real hit target (a visible `pin` symbol),
 *  so it's also the only one the shared tooltip formatter needs to handle —
 *  see `buildRunTooltipFormatter`. */
function buildRunsSeries(runPoints: RunPoint[]): ScatterSeriesOption {
  return {
    name: RUNS_SERIES_NAME,
    type: 'scatter',
    symbol: 'pin',
    z: 40,
    data: runPoints.map(({ run, y }) => ({
      value: [run.lap, y],
      symbolSize: run.active ? RUN_PIN_SIZE_ACTIVE : RUN_PIN_SIZE,
      itemStyle: { color: actionColor(run.action) },
    })),
  }
}

/** Item-triggered tooltip, scoped to the run-flag pins: every other series
 *  sets `tooltip: { show: false }` (see their builders above), and the
 *  continuous actual/pred/CI lines render with `symbol: 'none'` so they have
 *  no hoverable point anyway — the cursor and the veil already communicate
 *  "where" and "how confident" visually, without a hover step. Run pins are
 *  the one thing worth a hover: action + confidence, per spec. */
function buildRunTooltipFormatter(runs: RaceTraceRun[]) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const item = Array.isArray(params) ? params[0] : params
    if (!item || item.seriesName !== RUNS_SERIES_NAME) return ''
    const run = runs[item.dataIndex]
    if (!run) return ''
    return `<div style="font-family:${MONO}">
  <div style="font-weight:600;margin-bottom:4px">${run.action.replace(/_/g, ' ')}</div>
  <div>Lap ${run.lap} &nbsp;·&nbsp; confidence ${Math.round(run.confidence * 100)}%</div>
</div>`
  }
}

/**
 * Composes the full chart option. Series are layered back-to-front by `z`:
 * stint bands (1) -> CI band (4-5) -> pred/actual lines (14-15) -> spotlight
 * veil (20) -> cursor/pit/stint-end markers (30) -> run pins (40) — each later
 * layer paints over the earlier ones, which is what lets the veil genuinely
 * DIM the trace outside the window while the decision markers stay crisp
 * regardless of where they land.
 *
 * `xAxis.min/max` pin exactly to the full lap domain (never `window`) — the
 * spotlight is drawn AS an overlay on the full trace, not a crop of it.
 */
function buildTraceOption(
  points: PaceRangePoint[],
  windowRange: [number, number],
  cursorLap: number,
  pitLapTarget: number | null | undefined,
  expectedStintEnd: number | null | undefined,
  runs: RaceTraceRun[],
  palette: TracePalette,
): EChartsOption {
  const domain = lapDomain(points)
  const stints = groupStints(points)
  const [ciBase, ciBandDelta] = buildCiBandSeries(points)
  const runPoints = resolveRunPoints(runs, points)

  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    buildActualSeries(points), // index 0 — the click picker converts pixels
    buildPredSeries(points), //           through THIS series' axes (see lapFromPixel)
    ciBase,
    ciBandDelta,
    buildStintBandsSeries(stints),
    buildSpotlightSeries(domain, windowRange, palette.veil),
    buildMarkersSeries(cursorLap, pitLapTarget, expectedStintEnd, points, palette),
  ]
  if (runPoints.length > 0) series.push(buildRunsSeries(runPoints))

  return {
    tooltip: {
      trigger: 'item',
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: buildRunTooltipFormatter(runs),
    },
    grid: { top: 28, left: 8, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap',
      nameLocation: 'middle',
      nameGap: 24,
      min: domain[0],
      max: domain[1],
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: formatSecondsAxis },
    },
    series,
  }
}

// ---- Click / keyboard interaction ------------------------------------------

/** Minimal shape read off zrender's raw pointer events, mirroring LapChart's
 *  `ZrPointerEvent`. */
interface ZrPointerEvent {
  offsetX: number
  offsetY: number
}

/** What the zrender pointer handlers read on every event. Mirrored into a ref
 *  (see `RaceTrace`) because the handlers are bound once in `onChartReady`, so
 *  they must read fresh props through a ref rather than close over stale ones.
 *  `setDragLap` feeds the live scrub preview: the handlers write the lap under
 *  the pointer while dragging and clear it (null) on release / leave. */
interface TraceInteractionRef {
  runPoints: RunPoint[]
  windowRange: [number, number]
  onSelectLap: (lap: number) => void
  onSelectRun?: (id: string) => void
  setDragLap: (lap: number | null) => void
}

/** Nearest run-flag pin to a click, in pixel space (mirrors LapChart's
 *  `findNearestPoint`). Pixel-space distance is what a viewer actually judges
 *  as "closest pin"; `{xAxisIndex, yAxisIndex}` (rather than `seriesIndex`) is
 *  used for the conversion so this doesn't need to know which series index
 *  the runs scatter ended up at (it's only appended when `runs` is
 *  non-empty — see `buildTraceOption`). */
function findNearestRunPin(
  chart: ECharts,
  runPoints: RunPoint[],
  clickX: number,
  clickY: number,
): RaceTraceRun | null {
  let nearest: RaceTraceRun | null = null
  let nearestDistanceSq = Infinity

  for (const { run, y } of runPoints) {
    const [px, py] = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [run.lap, y])
    const distanceSq = (px - clickX) ** 2 + (py - clickY) ** 2
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq
      nearest = run
    }
  }

  if (!nearest || nearestDistanceSq > RUN_PIN_HIT_RADIUS_PX ** 2) return null
  return nearest
}

/** Pixel position -> lap number, via the chart's own axis conversion (so it
 *  stays correct across zoom/resize without any manual pixel math). Returns a
 *  fractional lap; callers round it. */
function lapFromPixel(chart: ECharts, x: number, y: number): number {
  const [lap] = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y])
  return lap
}

/**
 * Registers the video-editor-style scrubber directly on zrender, once per chart
 * instance (called from `onChartReady`, which — unlike `onEvents` — only fires on
 * mount, so this never double-binds across the option rebuilds `notMerge`
 * triggers on every cursor move). Pointer model:
 *  - press inside the plot begins a scrub — the cursor jumps to that lap and
 *    follows the pointer on `mousemove` via `setDragLap` (live preview only, no
 *    navigation yet, so dragging never spams the URL);
 *  - release (`mouseup`) or leaving the chart (`globalout`) commits the lap once
 *    via `onSelectLap` and clears the preview;
 *  - a press that lands on a run pin selects that run instead of scrubbing.
 * A plain click is just a zero-distance scrub (press + release on one lap), so
 * clicking to pick a lap keeps working. `containPixel` rejects presses outside
 * the plot area.
 */
function bindTraceInteractions(
  chart: ECharts,
  interactionRef: { current: TraceInteractionRef },
): void {
  const zr = chart.getZr()
  let scrubbing = false
  let scrubLap: number | null = null
  let pendingPinId: string | null = null

  const lapAt = (event: ZrPointerEvent): number => {
    const { windowRange } = interactionRef.current
    return clampLap(Math.round(lapFromPixel(chart, event.offsetX, event.offsetY)), windowRange)
  }

  zr.on('mousedown', (event: ZrPointerEvent) => {
    const { runPoints } = interactionRef.current
    const hitRun = findNearestRunPin(chart, runPoints, event.offsetX, event.offsetY)
    if (hitRun) {
      pendingPinId = hitRun.id // a pin press selects the run, not a scrub
      return
    }
    if (!chart.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) return
    scrubbing = true
    scrubLap = lapAt(event)
    interactionRef.current.setDragLap(scrubLap)
  })

  zr.on('mousemove', (event: ZrPointerEvent) => {
    if (!scrubbing) return
    scrubLap = lapAt(event)
    interactionRef.current.setDragLap(scrubLap)
  })

  const commit = (): void => {
    const { onSelectLap, onSelectRun, setDragLap } = interactionRef.current
    if (pendingPinId != null) {
      onSelectRun?.(pendingPinId)
    } else if (scrubbing && scrubLap != null) {
      onSelectLap(scrubLap)
    }
    scrubbing = false
    scrubLap = null
    pendingPinId = null
    setDragLap(null)
  }

  zr.on('mouseup', commit)
  zr.on('globalout', () => {
    if (scrubbing || pendingPinId != null) commit()
  })
}

// ---- Component ---------------------------------------------------------------

/** One past (or the in-flight) scenario run, pinned onto the trace at the lap
 *  it was analysed for. `active` marks the run currently shown in the rest of
 *  the Strategy tab, so its pin can render larger than the others. */
export interface RaceTraceRun {
  id: string
  lap: number
  action: StrategyAction
  confidence: number
  active: boolean
}

export interface RaceTraceProps {
  /** The driver's FULL range (unsliced) — always plotted whole; the parts
   *  outside `window` are veiled, never cropped out. */
  points: PaceRangePoint[]
  /** The evidence window the orchestrator actually reasoned over — bright;
   *  outside it is veiled. */
  window: [number, number]
  /** The decision cursor: the lap the orchestrator is analysing. */
  cursorLap: number
  /** Click a lap (or arrow-key from the cursor) -> move the decision cursor. */
  onSelectLap: (lap: number) => void
  /** The active run's planned pit lap, if any -> a small triangle marker. */
  pitLapTarget?: number | null
  /** The active run's expected stint end, if any -> a dashed marker. */
  expectedStintEnd?: number | null
  /** Past runs pinned at their laps (see `RaceTraceRun`). */
  runs?: RaceTraceRun[]
  /** Clicking a run's pin resolves here instead of moving the cursor. */
  onSelectRun?: (id: string) => void
  loading?: boolean
}

/**
 * The Race Trace: a full-width, navigable pace-trajectory instrument. Actual
 * vs. predicted lap time, a P10-P90 confidence band, tire-compound stint
 * bands, an evidence-window spotlight, the decision cursor, and optional
 * pit/stint-end/run markers — all null-tolerant, since most of these are
 * optional fields on `StrategyRecommendation` (see that type's own docstring).
 *
 * Moving the cursor (a click or an arrow key) rebuilds `option` with a new
 * `cursorLap`, but every series keeps its NAME stable across that rebuild —
 * ECharts only replays its entrance sweep for a series it hasn't seen before
 * (a new name), so a `notMerge` `setOption` with the same series names is
 * just an update. `useFirstPaintAnimation` sets `animationDurationUpdate: 0`
 * so that update is instant: the lines don't re-sweep, only the cursor
 * (and any changed marker) moves. NEVER set `animation: false` instead — that
 * would snap an in-flight ENTRANCE sweep on the very first paint, per that
 * hook's own docstring.
 */
export function RaceTrace({
  points,
  window: windowRange,
  cursorLap,
  onSelectLap,
  pitLapTarget,
  expectedStintEnd,
  runs = [],
  onSelectRun,
  loading,
}: RaceTraceProps) {
  const chartTheme = useChartTheme()
  const palette = chartTheme === F1_LIGHT_THEME ? LIGHT_TRACE_PALETTE : DARK_TRACE_PALETTE

  // While scrubbing, the cursor follows the pointer live off this local override
  // (committed to the URL only on release); at rest it tracks the `cursorLap` prop.
  const [dragLap, setDragLap] = useState<number | null>(null)
  const renderLap = dragLap ?? cursorLap

  const option = useMemo(
    () =>
      points.length > 0
        ? buildTraceOption(
            points,
            windowRange,
            renderLap,
            pitLapTarget,
            expectedStintEnd,
            runs,
            palette,
          )
        : null,
    [points, windowRange, renderLap, pitLapTarget, expectedStintEnd, runs, palette],
  )
  const paintedOption = useFirstPaintAnimation(option ?? EMPTY_OPTION)

  const runPoints = useMemo(() => resolveRunPoints(runs, points), [runs, points])
  const interactionRef = useRef<TraceInteractionRef>({
    runPoints,
    windowRange,
    onSelectLap,
    onSelectRun,
    setDragLap,
  })
  interactionRef.current = { runPoints, windowRange, onSelectLap, onSelectRun, setDragLap }

  const handleChartReady = useCallback((chart: ECharts) => {
    bindTraceInteractions(chart, interactionRef)
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onSelectLap(clampLap(cursorLap - 1, windowRange))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onSelectLap(clampLap(cursorLap + 1, windowRange))
      }
    },
    [cursorLap, windowRange, onSelectLap],
  )

  if (loading) {
    return (
      <ChartCard title="Race trace">
        <Skeleton style={{ height: CHART_HEIGHT_PX }} className="w-full" />
      </ChartCard>
    )
  }

  if (points.length === 0) {
    return (
      <ChartCard title="Race trace">
        <p className="px-2 py-12 text-center text-sm text-fg-3">No pace data for this window</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Race trace">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Race trace decision cursor"
        aria-valuemin={windowRange[0]}
        aria-valuemax={windowRange[1]}
        aria-valuenow={renderLap}
        aria-valuetext={`Lap ${renderLap}`}
        onKeyDown={handleKeyDown}
        className="rounded-lg outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0"
      >
        <ReactECharts
          theme={chartTheme}
          key={chartTheme}
          option={paintedOption}
          style={{ height: CHART_HEIGHT_PX }}
          notMerge
          onChartReady={handleChartReady}
        />
      </div>
    </ChartCard>
  )
}
