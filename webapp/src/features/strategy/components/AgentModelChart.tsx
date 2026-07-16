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
import type { EChartsOption, LineSeriesOption } from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
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
  height?: number
  loading?: boolean
}

/** True once at least one lap has a real actual or predicted value — the
 *  guard between the chart and the muted "No data" state. An all-null
 *  `points` array (or an empty one) fails this the same way. */
function hasData(points: AgentModelPoint[]): boolean {
  return points.some((point) => point.actual != null || point.pred != null)
}

/** A faint dashed vertical line at `cursorLap` — where "now" sits on the
 *  trace. Deliberately unlabelled (unlike RaceTrace's "DECISION" marker):
 *  this chart is a compact evidence pane, not the full-width navigable
 *  instrument, so a text label would compete with the legend for room. */
function buildCursorMarkLine(cursorLap: number): LineSeriesOption['markLine'] {
  return {
    silent: true,
    symbol: 'none',
    data: [
      {
        xAxis: cursorLap,
        lineStyle: { color: CURSOR_COLOR, width: 1, type: 'dashed', opacity: 0.5 },
      },
    ],
  }
}

function buildActualSeries(
  points: AgentModelPoint[],
  actualLabel: string,
  cursorLap: number | undefined,
): LineSeriesOption {
  return {
    name: actualLabel,
    type: 'line',
    symbol: 'none',
    connectNulls: false,
    lineStyle: { color: ACTUAL_COLOR, width: 2 },
    itemStyle: { color: ACTUAL_COLOR },
    z: 10,
    data: points.map((point) => [point.lap, point.actual]),
    ...(cursorLap != null ? { markLine: buildCursorMarkLine(cursorLap) } : {}),
  }
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
function buildOption(
  points: AgentModelPoint[],
  actualLabel: string,
  predLabel: string,
  yUnit: string,
  cursorLap: number | undefined,
  hidePred: boolean,
): EChartsOption {
  const series: LineSeriesOption[] = [buildActualSeries(points, actualLabel, cursorLap)]
  if (!hidePred) series.push(buildPredSeries(points, predLabel))
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { fontSize: 10 } },
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
  height = DEFAULT_HEIGHT_PX,
  loading,
}: AgentModelChartProps) {
  const chartTheme = useChartTheme()
  const option = useMemo(
    () => buildOption(points, actualLabel, predLabel, yUnit, cursorLap, hidePred),
    [points, actualLabel, predLabel, yUnit, cursorLap, hidePred],
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
