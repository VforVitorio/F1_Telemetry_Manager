// ScenarioScoresChart (#35) — the Monte-Carlo evidence bar for the Strategy
// tab. The Streamlit page plotted only `score` per candidate action; the
// orchestrator's 500-sample MC step (`strategy_orchestrator.py:319`) already
// computes a P10-P90 band around each candidate's expected value `E`, so this
// chart surfaces that band too — a "winner" whose whisker spans wide is a much
// weaker pick than one with a tight band at the same E, and the old bar chart
// couldn't show that difference at all.
//
// ECharts has no built-in horizontal error-bar mark, so the whisker is drawn
// with a `custom` series — the documented ECharts recipe for error bars:
// `renderItem` reads `[categoryIndex, P10, P90, E]` per row and projects it
// through `api.coord()` into pixel space, then draws a line + two end caps +
// a dot at E, plus a right-margin value label. It is the ONLY series (no bars:
// a bar's LENGTH is meaningless once MC scores go negative, which they
// routinely do), so it owns the category axis directly — a dot-interval plot,
// where position, not length, carries the value.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type {
  CustomSeriesOption,
  CustomSeriesRenderItem,
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { F1_LIGHT_THEME } from '@/charts/echartsTheme'
import { ChartCard } from '@/components/ChartCard'
import type { ScenarioScore, StrategyAction } from '@/lib/api/strategy'

registerF1Theme()

const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"

// Identity colors — the accent reads the same purple in both themes (mirrors
// echartsTheme.ts's SERIES_COLORS[1] / tokens.css --purple-600/300).
const ACCENT = '#6c5ce7'
const ACCENT_WHISKER = '#a29bfe'

// The muted tones DO need a per-theme swap (an ECharts per-series/per-item
// color bypasses the registered theme entirely) — same reasoning as
// Gauge.tsx's GaugePalette and ChannelChart's DeltaChart markLineColor.
interface ScorePalette {
  mutedWhisker: string
  label: string
}

const DARK_SCORE_PALETTE: ScorePalette = {
  mutedWhisker: 'rgba(255,255,255,0.45)',
  label: 'rgba(255,255,255,0.72)',
}

const LIGHT_SCORE_PALETTE: ScorePalette = {
  mutedWhisker: 'rgba(20,18,31,0.45)',
  label: 'rgba(20,18,31,0.75)',
}

const MIN_HEIGHT_PX = 220
const MAX_HEIGHT_PX = 280
const ROW_HEIGHT_PX = 42
// Fixed vertical allowance (axis + card padding) on top of the per-row height.
const CHROME_PX = 60

const CAP_HALF_HEIGHT_PX = 6
const WHISKER_LINE_WIDTH = 1.5
const WHISKER_DOT_RADIUS = 3.5
// Gap between the P90 cap and the E/delta label drawn past it (fix for the
// label being struck through by the whisker line when it sat on the bar).
const WHISKER_LABEL_GAP_PX = 8

interface ScenarioRow {
  action: string
  score: ScenarioScore
}

/** Rows sorted best-first (E descending). Combined with `yAxis.inverse` in
 *  `buildScoresOption`, the winner renders at the TOP of the chart. */
function sortedRows(scores: Record<string, ScenarioScore>): ScenarioRow[] {
  return Object.entries(scores)
    .map(([action, score]) => ({ action, score }))
    .sort((a, b) => b.score.E - a.score.E)
}

/** Clamp the chart's pixel height to the row count so a 2-candidate run
 *  doesn't stretch as tall as a 4-candidate one. */
function chartHeight(rowCount: number): number {
  return Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, rowCount * ROW_HEIGHT_PX + CHROME_PX))
}

/** "0.842  (0.00)" for the winner, "0.671  (-0.17)" for the rest — the
 *  delta-to-winner Streamlit's plain score bar never showed. Rounds -0 to
 *  "0.00" so a near-zero delta never prints a confusing "-0.00". */
function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 100) / 100
  return rounded === 0 ? '0.00' : rounded.toFixed(2)
}

function formatScoreLabel(row: ScenarioRow, bestE: number): string {
  const delta = row.score.E - bestE
  return `${row.score.E.toFixed(3)}  (${formatDelta(delta)})`
}

/** One tooltip per row: the action name plus its full E / P10-P90 spread —
 *  the label on the bar only has room for E and the delta, this fills in the
 *  rest on hover. Defensive `Array.isArray` check mirrors ChannelChart's
 *  `buildTooltipFormatter` since the callback's param type covers both the
 *  axis-trigger (array) and item-trigger (single object) shapes. */
function buildScoreTooltipFormatter(rows: ScenarioRow[]) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items = Array.isArray(params) ? params : [params]
    const first = items[0]
    const row = first ? rows[first.dataIndex] : undefined
    if (!row) return ''
    return `<div style="font-family:${MONO}">
  <div style="font-weight:600;margin-bottom:4px">${row.action}</div>
  <div>E &nbsp;${row.score.E.toFixed(3)}</div>
  <div style="opacity:0.7">P10-P90 &nbsp;${row.score.P10.toFixed(3)} to ${row.score.P90.toFixed(3)}</div>
</div>`
  }
}

/** The x-axis window spans the full P10-P90-E range across rows, padded so no
 *  cap or dot touches the plot edge. DATA-DRIVEN, not pinned to 0: the
 *  Monte-Carlo score `α·E + (1−α)·P10` is routinely NEGATIVE (a losing
 *  scenario scores below zero), so a zero baseline would clip most rows
 *  off-scale and pile their labels onto the category axis. This is a
 *  dot-interval plot — position, not bar length, encodes the value — so a
 *  non-zero baseline is honest: a point's POSITION never lies the way a
 *  truncated bar LENGTH would. */
function axisRange(rows: ScenarioRow[]): { min: number; max: number } {
  const bounds = rows.flatMap((row) => [row.score.P10, row.score.P90, row.score.E])
  const low = Math.min(...bounds)
  const high = Math.max(...bounds)
  const pad = (high - low) * 0.12 || 0.1
  return { min: low - pad, max: high + pad }
}

/**
 * Draws one row of the dot-interval plot: a P10-P90 whisker (line + end caps),
 * a dot at the expected value E, and the E/delta label. The label is pinned to
 * the RIGHT MARGIN (`axisMax` position + a gap), aligned into a value column,
 * NOT anchored past the whisker's own P90 cap: with negative scores the P90
 * point can sit at the far left, so a label tied to it would collide with the
 * category-axis labels. Row data is `[categoryIndex, P10, P90, E]`; `api.coord()`
 * projects an `[x, categoryIndex]` pair through the value/category axes so every
 * mark lands on its category's row without separate layout math.
 */
function buildWhiskerRenderItem(
  chosenIndex: number,
  palette: ScorePalette,
  rows: ScenarioRow[],
  bestE: number,
  axisMax: number,
): CustomSeriesRenderItem {
  return (params, api) => {
    const categoryIndex = api.value(0) as number
    const p10 = api.value(1) as number
    const p90 = api.value(2) as number
    const e = api.value(3) as number
    const isChosen = params.dataIndex === chosenIndex
    const color = isChosen ? ACCENT_WHISKER : palette.mutedWhisker

    const lowPoint = api.coord([p10, categoryIndex])
    const highPoint = api.coord([p90, categoryIndex])
    const meanPoint = api.coord([e, categoryIndex])

    const row = rows[params.dataIndex]
    const labelText = row ? formatScoreLabel(row, bestE) : ''
    const labelColor = isChosen ? ACCENT : palette.label

    return {
      type: 'group',
      children: [
        {
          type: 'line',
          shape: { x1: lowPoint[0], y1: lowPoint[1], x2: highPoint[0], y2: highPoint[1] },
          style: { stroke: color, lineWidth: WHISKER_LINE_WIDTH },
        },
        {
          type: 'line',
          shape: {
            x1: lowPoint[0],
            y1: lowPoint[1] - CAP_HALF_HEIGHT_PX,
            x2: lowPoint[0],
            y2: lowPoint[1] + CAP_HALF_HEIGHT_PX,
          },
          style: { stroke: color, lineWidth: WHISKER_LINE_WIDTH },
        },
        {
          type: 'line',
          shape: {
            x1: highPoint[0],
            y1: highPoint[1] - CAP_HALF_HEIGHT_PX,
            x2: highPoint[0],
            y2: highPoint[1] + CAP_HALF_HEIGHT_PX,
          },
          style: { stroke: color, lineWidth: WHISKER_LINE_WIDTH },
        },
        {
          type: 'circle',
          shape: { cx: meanPoint[0], cy: meanPoint[1], r: WHISKER_DOT_RADIUS },
          style: { fill: color },
        },
        {
          type: 'text',
          style: {
            text: labelText,
            x: api.coord([axisMax, categoryIndex])[0] + WHISKER_LABEL_GAP_PX,
            y: meanPoint[1],
            textAlign: 'left',
            textVerticalAlign: 'middle',
            fontFamily: MONO,
            fontSize: 11,
            fill: labelColor,
          },
        },
      ],
    }
  }
}

/** The dot-interval series — a single `custom` series (see module docstring):
 *  one P10-P90 whisker + a dot at E + a right-aligned E/delta label per row.
 *  It is the ONLY series; there is deliberately no bar, because a bar's LENGTH
 *  is meaningless once scores go negative (see axisRange). It owns the category
 *  axis, so its rows line up with the y-axis labels. The chosen action renders
 *  in the purple accent, the rest muted. */
function buildWhiskerSeries(
  rows: ScenarioRow[],
  chosenAction: StrategyAction,
  palette: ScorePalette,
  bestE: number,
  axisMax: number,
): CustomSeriesOption {
  const chosenIndex = rows.findIndex((row) => row.action === chosenAction)
  return {
    type: 'custom',
    silent: true,
    z: 10,
    renderItem: buildWhiskerRenderItem(chosenIndex, palette, rows, bestE, axisMax),
    data: rows.map((row, index) => [index, row.score.P10, row.score.P90, row.score.E]),
  }
}

/** Composes the full option: a category axis of scenario names (best row on
 *  top, via `inverse`), a padded value axis wide enough for every whisker,
 *  and the two series above. Returns an empty series list for zero rows —
 *  the component itself renders a text empty-state instead of this option. */
function buildScoresOption(
  rows: ScenarioRow[],
  chosenAction: StrategyAction,
  palette: ScorePalette,
): EChartsOption {
  if (rows.length === 0) return { series: [] }

  const bestE = rows[0].score.E
  const { min, max } = axisRange(rows)

  return {
    tooltip: {
      trigger: 'item',
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: buildScoreTooltipFormatter(rows),
    },
    // `right` reserves room for the E/delta label now drawn past each
    // whisker's P90 cap (see buildWhiskerRenderItem) instead of on the bar.
    grid: { top: 8, left: 8, right: 140, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      min,
      max,
      // Fewer, non-overlapping ticks — the default split count crammed
      // 8 labels ("0.2", "0.3", ...) into digit soup at this chart's width.
      splitNumber: 3,
      splitLine: { show: false },
      axisLabel: {
        fontSize: 10,
        hideOverlap: true,
        margin: 10,
        formatter: (value: number) => value.toFixed(2),
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      // Humanized for display only — the tooltip (buildScoreTooltipFormatter)
      // still reads the raw `row.action` enum key.
      data: rows.map((row) => row.action.replace(/_/g, ' ')),
    },
    series: [buildWhiskerSeries(rows, chosenAction, palette, bestE, max)],
  }
}

export interface ScenarioScoresChartProps {
  /** e.g. `{"STAY_OUT": {E,P10,P90,score}, "PIT_NOW": {...}}` — one entry per
   *  Monte-Carlo-scored strategy candidate. Always present on a completed run,
   *  possibly empty (see `StrategyRecommendation`'s docstring). */
  scores: Record<string, ScenarioScore>
  /** The orchestrator's recommended action — its row is highlighted. */
  chosenAction: StrategyAction
}

/** Monte-Carlo evidence as a dot-interval plot: one row per candidate action,
 *  sorted best-first by expected value, each an E dot + P10-P90 uncertainty
 *  whisker + a right-aligned E/delta-to-winner label. The chosen action renders
 *  in the purple accent, the rest muted. Scores routinely go negative, so the
 *  axis is data-driven, not zero-based. */
export function ScenarioScoresChart({ scores, chosenAction }: ScenarioScoresChartProps) {
  const chartTheme = useChartTheme()
  const palette = chartTheme === F1_LIGHT_THEME ? LIGHT_SCORE_PALETTE : DARK_SCORE_PALETTE
  const rows = useMemo(() => sortedRows(scores), [scores])
  const option = useMemo(
    () => buildScoresOption(rows, chosenAction, palette),
    [rows, chosenAction, palette],
  )
  const paintedOption = useFirstPaintAnimation(option)

  if (rows.length === 0) {
    return (
      <ChartCard title="Scenario scores">
        <p className="px-2 py-12 text-center text-sm text-fg-3">No scenario scores for this run</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Scenario scores">
      <div
        role="img"
        aria-label="Monte-Carlo scenario scores: expected value with P10 to P90 range, one row per candidate action"
      >
        <ReactECharts
          theme={chartTheme}
          key={chartTheme}
          option={paintedOption}
          style={{ height: chartHeight(rows.length) }}
          notMerge
        />
      </div>
    </ChartCard>
  )
}
