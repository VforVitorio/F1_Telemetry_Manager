// AgentModelChart — the reusable per-lap "actual vs model estimate" line chart
// backing two Agent Breakdown tabs: PaceTab's XGBoost lap-time model and
// TyresTab's TCN tyre-degradation model. Both tabs plot the exact same shape
// of evidence (a solid ACTUAL line against a dashed MODEL ESTIMATE line, one
// point per lap), so it lives as one component instead of being duplicated
// per tab, parameterised only by labels/unit — mirrors ScoresPlot.tsx's
// "frameless, no ChartCard shell" idiom, since both call sites already sit
// inside AgentTabs' own Card.
//
// ECharts wiring mirrors RaceTrace.tsx / ScoresPlot.tsx: `registerF1Theme()`
// once at module load, `useChartTheme()` + `key={chartTheme}` to remount on a
// light/dark toggle, and `useFirstPaintAnimation` so the entrance sweep plays
// once and every later update (a new cursor lap, fresh data) applies
// instantly. NEVER set `animation: false` instead — see that hook's own
// docstring for why that snaps an in-flight entrance sweep.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption, LineSeriesOption, ScatterSeriesOption } from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { tireColors } from '@/charts/echartsTheme'
import { Skeleton } from '@/components/Skeleton'

registerF1Theme()

const DEFAULT_HEIGHT_PX = 200

// Identity colors — the same solid/dashed pair RaceTrace uses for its own
// actual/pred lines, so a strategist reading either chart learns one visual
// language once. Unchanged across light/dark (see RaceTrace's own note).
const ACTUAL_COLOR = '#3385ff'
const PRED_COLOR = '#a29bfe'
const CURSOR_COLOR = '#6c5ce7'

/** One lap's actual value and the model's estimate for it. Either (or both)
 *  can be `null` — a stint's first lap, a lap the model couldn't score, or a
 *  lap dropped from the featured parquet (Safety Car / out laps) — and
 *  `connectNulls: false` on both series renders that as a real gap instead of
 *  bridging over missing evidence. */
export interface AgentModelPoint {
  lap: number
  actual: number | null
  pred: number | null
  /** Lower/upper prediction-interval bounds, shaded as a band when `ciBand`. */
  ciLow?: number | null
  ciHigh?: number | null
  /** Tyre compound running this lap; colours the actual dot when `compoundDots`. */
  compound?: string | null
  /** True on a stint's first lap; draws a boundary line when `stintLines`. */
  stintStart?: boolean
}

export interface AgentModelChartProps {
  points: AgentModelPoint[]
  /** Legend label for the solid line, e.g. "Actual lap time". */
  actualLabel: string
  /** Legend label for the dashed line, e.g. "XGBoost estimate". */
  predLabel: string
  /** Appended to axis labels, e.g. "s". Defaults to no unit. */
  yUnit?: string
  /** The lap currently under analysis -> a faint dashed vertical marker. */
  cursorLap?: number
  /** Hide the dashed estimate line + its legend entry, showing only the ACTUAL
   *  series. Used where the model's raw per-lap estimate isn't reproducible
   *  outside its full agent flow, so a dashed line would mislead. */
  hidePred?: boolean
  /** Shade a p10-p90 band from each point's `ciLow`/`ciHigh`. Default off. */
  ciBand?: boolean
  /** Colour the actual dots by tyre compound (via each point's `compound`). Default off. */
  compoundDots?: boolean
  /** Draw a boundary line at every `stintStart` lap. Default off. */
  stintLines?: boolean
  height?: number
  loading?: boolean
}

/** True once at least one lap has a real actual or predicted value — the
 *  guard between the chart and the muted "No data" state. An all-null
 *  `points` array (or an empty one) fails this the same way. */
function hasData(points: AgentModelPoint[]): boolean {
  return points.some((point) => point.actual != null || point.pred != null)
}

/** Vertical markers on the trace: a faint dashed "now" line at `cursorLap`, plus
 *  a fainter dotted boundary at each stint-start lap when `stintLaps` is given.
 *  Deliberately unlabelled (unlike RaceTrace's "DECISION" marker): this is a
 *  compact evidence pane, so text labels would compete with the legend. */
function buildMarkLine(
  cursorLap: number | undefined,
  stintLaps: number[],
): LineSeriesOption['markLine'] {
  const data: NonNullable<LineSeriesOption['markLine']>['data'] = stintLaps.map((lap) => ({
    xAxis: lap,
    lineStyle: { color: CURSOR_COLOR, width: 1, type: 'dotted', opacity: 0.3 },
  }))
  if (cursorLap != null) {
    data.push({
      xAxis: cursorLap,
      lineStyle: { color: CURSOR_COLOR, width: 1, type: 'dashed', opacity: 0.5 },
    })
  }
  return { silent: true, symbol: 'none', data }
}

function buildActualSeries(
  points: AgentModelPoint[],
  actualLabel: string,
  cursorLap: number | undefined,
  stintLaps: number[],
): LineSeriesOption {
  const hasMarks = cursorLap != null || stintLaps.length > 0
  return {
    name: actualLabel,
    type: 'line',
    symbol: 'none',
    connectNulls: false,
    lineStyle: { color: ACTUAL_COLOR, width: 2 },
    itemStyle: { color: ACTUAL_COLOR },
    z: 10,
    data: points.map((point) => [point.lap, point.actual]),
    ...(hasMarks ? { markLine: buildMarkLine(cursorLap, stintLaps) } : {}),
  }
}

/** Two stacked line series forming the p10-p90 prediction band: an invisible
 *  lower line at `ciLow`, then a band of height `ciHigh - ciLow` stacked on top
 *  with a faint fill. Laps missing either bound leave a gap (no fabricated
 *  band). Both are silent + excluded from the legend by the explicit legend
 *  data in `buildOption`. */
function buildCiBandSeries(points: AgentModelPoint[]): LineSeriesOption[] {
  const lower: Array<[number, number | null]> = points.map((p) => [p.lap, p.ciLow ?? null])
  const height: Array<[number, number | null]> = points.map((p) => {
    const lo = p.ciLow
    const hi = p.ciHigh
    return [p.lap, lo != null && hi != null ? hi - lo : null]
  })
  const shared = {
    type: 'line' as const,
    stack: 'ci',
    symbol: 'none' as const,
    silent: true,
    z: 1,
    lineStyle: { opacity: 0 },
    tooltip: { show: false },
  }
  return [
    { ...shared, name: 'ci-lower', data: lower },
    { ...shared, name: 'ci-band', data: height, areaStyle: { color: PRED_COLOR, opacity: 0.12 } },
  ]
}

/** Actual values as compound-coloured dots (soft red, medium yellow, ...), so a
 *  degradation trace shows which tyre produced each lap. Only points with both a
 *  value and a known compound render. */
function buildCompoundScatter(points: AgentModelPoint[]): ScatterSeriesOption {
  const data = points
    .filter((p) => p.actual != null && p.compound)
    .map((p) => ({
      value: [p.lap, p.actual] as [number, number | null],
      itemStyle: { color: tireColors[(p.compound ?? '').toLowerCase()] ?? ACTUAL_COLOR },
    }))
  return { name: 'compound', type: 'scatter', symbolSize: 6, z: 11, silent: true, data }
}

function buildPredSeries(points: AgentModelPoint[], predLabel: string): LineSeriesOption {
  return {
    name: predLabel,
    type: 'line',
    symbol: 'none',
    connectNulls: false,
    lineStyle: { color: PRED_COLOR, width: 1.5, type: 'dashed' },
    itemStyle: { color: PRED_COLOR },
    z: 9,
    data: points.map((point) => [point.lap, point.pred]),
  }
}

/** Composes the full option: a value x-axis over lap number, a small legend
 *  (its default line-shaped icon already carries the solid/dashed distinction,
 *  so no custom `icon` override is needed), and the two series above. Axis
 *  labels stay tiny (10px) — this chart lives inside an already-dense Agent
 *  Breakdown tab, not a standalone full-width instrument. */
interface BuildOptionFlags {
  ciBand: boolean
  compoundDots: boolean
  stintLines: boolean
}

function buildOption(
  points: AgentModelPoint[],
  actualLabel: string,
  predLabel: string,
  yUnit: string,
  cursorLap: number | undefined,
  hidePred: boolean,
  { ciBand, compoundDots, stintLines }: BuildOptionFlags,
): EChartsOption {
  const stintLaps = stintLines ? points.filter((p) => p.stintStart).map((p) => p.lap) : []
  const series: Array<LineSeriesOption | ScatterSeriesOption> = []
  if (ciBand) series.push(...buildCiBandSeries(points))
  series.push(buildActualSeries(points, actualLabel, cursorLap, stintLaps))
  if (!hidePred) series.push(buildPredSeries(points, predLabel))
  if (compoundDots) series.push(buildCompoundScatter(points))
  // Only the two real lines belong in the legend; the band/scatter helpers
  // carry structural names that would clutter it.
  const legendData = [actualLabel, ...(hidePred ? [] : [predLabel])]
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { fontSize: 10 }, data: legendData },
    grid: { top: 28, left: 8, right: 12, bottom: 22, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap',
      nameLocation: 'middle',
      nameGap: 18,
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, formatter: (value: number) => `${value.toFixed(1)}${yUnit}` },
    },
    series,
  }
}

/**
 * Compact actual-vs-model-estimate line chart, one lap per x tick. Backs both
 * PaceTab (XGBoost lap-time model) and TyresTab (TCN degradation model) in the
 * Agent Breakdown — see the module docstring for why one component serves
 * both. Null-tolerant throughout: a lap missing either value simply breaks
 * its line rather than crashing or interpolating over the gap.
 */
export function AgentModelChart({
  points,
  actualLabel,
  predLabel,
  yUnit = '',
  cursorLap,
  hidePred = false,
  ciBand = false,
  compoundDots = false,
  stintLines = false,
  height = DEFAULT_HEIGHT_PX,
  loading,
}: AgentModelChartProps) {
  const chartTheme = useChartTheme()
  const option = useMemo(
    () =>
      buildOption(points, actualLabel, predLabel, yUnit, cursorLap, hidePred, {
        ciBand,
        compoundDots,
        stintLines,
      }),
    [points, actualLabel, predLabel, yUnit, cursorLap, hidePred, ciBand, compoundDots, stintLines],
  )
  const paintedOption = useFirstPaintAnimation(option)

  if (loading) {
    return <Skeleton style={{ height }} className="w-full" />
  }

  if (!hasData(points)) {
    return <p className="px-2 py-8 text-center text-sm text-fg-3">No data</p>
  }

  return (
    <div role="img" aria-label={`${actualLabel} versus ${predLabel}, per lap`}>
      <ReactECharts
        theme={chartTheme}
        key={chartTheme}
        option={paintedOption}
        notMerge
        style={{ height }}
      />
    </div>
  )
}
