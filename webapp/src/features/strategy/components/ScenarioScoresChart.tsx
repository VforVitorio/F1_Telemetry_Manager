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
// a dot at E. That series shares the bar series' category axis, so the two
// stay pixel-aligned without any extra bookkeeping.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type {
  BarSeriesOption,
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
  mutedBar: string
  mutedWhisker: string
  label: string
}

const DARK_SCORE_PALETTE: ScorePalette = {
  mutedBar: 'rgba(255,255,255,0.16)',
  mutedWhisker: 'rgba(255,255,255,0.45)',
  label: 'rgba(255,255,255,0.72)',
}

const LIGHT_SCORE_PALETTE: ScorePalette = {
  mutedBar: 'rgba(20,18,31,0.14)',
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

/** The x-axis window: `min` is pinned to 0 rather than the widest P10 lower
 *  bound — scores are bounded [0,1], and a truncated baseline made bar
 *  LENGTH encode `E - baseline` instead of `E` itself, visually exaggerating
 *  how much better the winner looked. `max` is still padded a little past
 *  the widest P10-P90 spread (capped at 1) so no whisker cap ever touches
 *  the plot edge. */
function axisRange(rows: ScenarioRow[]): { min: number; max: number } {
  const bounds = rows.flatMap((row) => [row.score.P10, row.score.P90])
  const low = Math.min(...bounds)
  const high = Math.max(...bounds)
  const pad = (high - low) * 0.15 || 0.1
  return { min: 0, max: Math.min(1, high + pad) }
}

/**
 * Draws one row's P10-P90 whisker: a horizontal line between the two bounds,
 * a short vertical cap at each end, a dot at E, and — past the P90 cap — the
 * E/delta label itself. That label used to be the bar series' own
 * `label: { position: 'right' }`, which sits at x = E: exactly where this
 * whisker's line crosses, so it got struck through. Drawing it here instead,
 * clear of the P90 cap, is the fix. Row data is `[categoryIndex, P10, P90, E]`;
 * `api.coord()` projects an `[x, categoryIndex]` pair through the shared
 * value/category axes, so the whisker (and its label) lands exactly where
 * the paired bar series' row sits — no separate layout math needed.
 */
function buildWhiskerRenderItem(
  chosenIndex: number,
  palette: ScorePalette,
  rows: ScenarioRow[],
  bestE: number,
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
            x: highPoint[0] + WHISKER_LABEL_GAP_PX,
            y: highPoint[1],
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

/** The bar series: length = E, colored purple for the chosen action and a
 *  muted neutral for the rest, so the recommendation reads as the obvious
 *  pick even before a viewer reads any label. Its own label stays off — a
 *  `position: 'right'` label sits at x = E, exactly where the paired
 *  whisker's line crosses it, so the label now renders inside
 *  `buildWhiskerRenderItem` instead, past the P90 cap where nothing
 *  overlaps it. */
function buildBarSeries(
  rows: ScenarioRow[],
  chosenAction: StrategyAction,
  palette: ScorePalette,
): BarSeriesOption {
  return {
    type: 'bar',
    barWidth: '46%',
    z: 5,
    data: rows.map((row) => ({
      value: row.score.E,
      itemStyle: {
        color: row.action === chosenAction ? ACCENT : palette.mutedBar,
        borderRadius: 4,
      },
    })),
    label: { show: false },
  }
}

/** The whisker overlay — a `silent` custom series (see module docstring)
 *  sharing the bar series' category axis so both stay pixel-aligned. Also
 *  draws the E/delta label past its P90 cap (see `buildWhiskerRenderItem`),
 *  hence the extra `bestE` argument. */
function buildWhiskerSeries(
  rows: ScenarioRow[],
  chosenAction: StrategyAction,
  palette: ScorePalette,
  bestE: number,
): CustomSeriesOption {
  const chosenIndex = rows.findIndex((row) => row.action === chosenAction)
  return {
    type: 'custom',
    silent: true,
    z: 10,
    renderItem: buildWhiskerRenderItem(chosenIndex, palette, rows, bestE),
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
    series: [
      buildBarSeries(rows, chosenAction, palette),
      buildWhiskerSeries(rows, chosenAction, palette, bestE),
    ],
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

/** Horizontal Monte-Carlo evidence bar: one row per candidate action, sorted
 *  best-first by expected value, with a P10-P90 uncertainty whisker per row.
 *  The chosen action's bar and whisker render in the purple accent; the rest
 *  in a muted neutral. */
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
