// Pure ECharts option builders for the Gaps tab. Faithful port of
// frontend/utils/race_viz.py's st_plot_gap_evolution + st_plot_undercut_
// opportunities (merged here into ONE chart — the zone shading rides directly
// under the gap lines instead of a second near-duplicate line chart) and
// st_plot_gap_consistency (the bar chart, unchanged in shape).
//
// Multi-driver tooltip trap (same one ChannelChart.tsx documents): each
// driver's rows land on their own lap numbers (a retirement, a Safety-Car lap
// dropped from the featured parquet), so a `trigger:'axis'` tooltip only shows
// the drivers that have a point at the exact hovered lap. Both charts resample
// every driver onto ONE shared lap grid first — continuous gaps via linear
// `interp` (bounded to each driver's own observed lap range, never
// extrapolated past a retirement), discrete consistency counts via an exact
// lookup (interpolating a run-length count would fabricate a value that never
// existed).

import type {
  BarSeriesOption,
  DefaultLabelFormatterCallbackParams,
  EChartsOption,
  LineSeriesOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  MarkPointComponentOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import type { RaceRecord } from '@/lib/api/race'
import { getDriverColor, getDriverTextColor } from '@/lib/drivers'
import { interp } from '@/lib/interp'

// ── Domain thresholds ─────────────────────────────────────────────────────────
// Mirror the private UNDERCUT_MAX/OVERCUT_MAX/CONSISTENCY_MIN constants in
// raceFrame.ts (not exported there, and that file is off-limits here) — these
// copies drive only the chart's visual zones/thresholds, never the opportunity
// counts themselves (those always come from `calculateStrategicWindows`).
const UNDERCUT_MAX = 2.0
const OVERCUT_MAX = 3.5
const CONSISTENCY_THRESHOLD = 3
const DEFAULT_Y_MAX = OVERCUT_MAX + 2

const UNDERCUT_ZONE_COLOR = 'rgba(34,197,94,0.12)'
const OVERCUT_ZONE_COLOR = 'rgba(234,179,8,0.10)'
const NO_STRATEGY_ZONE_COLOR = 'rgba(239,68,68,0.08)'
const UNDERCUT_LINE_COLOR = '#22c55e'
const OVERCUT_LINE_COLOR = '#eab308'
const DEFENSIVE_LINE_COLOR = '#ef4444'
const THRESHOLD_LABEL_FONT_SIZE = 10
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"

// ── Highlight (StrategicWindowCards → chart) ─────────────────────────────────

export type GapHighlightKind = 'undercut' | 'overcut' | 'defensive'

/** A clicked strategic-window card: which driver, which kind of opportunity,
 *  and the laps that qualified — rendered as coloured pins on the evolution
 *  chart. `undercut`/`overcut` pin the AHEAD line (they're gap-ahead windows);
 *  `defensive` pins the BEHIND line (a gap-behind window) — see
 *  `highlightField`. */
export interface GapHighlight {
  driver: string
  kind: GapHighlightKind
  laps: number[]
}

const HIGHLIGHT_COLOR_BY_KIND: Record<GapHighlightKind, string> = {
  undercut: UNDERCUT_LINE_COLOR,
  overcut: OVERCUT_LINE_COLOR,
  defensive: DEFENSIVE_LINE_COLOR,
}

function highlightField(kind: GapHighlightKind): 'GapToCarAhead' | 'GapToCarBehind' {
  return kind === 'defensive' ? 'GapToCarBehind' : 'GapToCarAhead'
}

// ── Row shaping ───────────────────────────────────────────────────────────────

/** Rows grouped by driver code, each group sorted ascending by LapNumber —
 *  the shape every builder below needs (per-driver line/bar data, the shared
 *  lap grid, the highlight lookup). */
function groupRowsByDriver(rows: RaceRecord[]): Map<string, RaceRecord[]> {
  const byDriver = new Map<string, RaceRecord[]>()
  for (const row of rows) {
    if (!row.Driver) continue
    const list = byDriver.get(row.Driver) ?? []
    list.push(row)
    byDriver.set(row.Driver, list)
  }
  for (const list of byDriver.values()) {
    list.sort((a, b) => (a.LapNumber ?? 0) - (b.LapNumber ?? 0))
  }
  return byDriver
}

/** Every lap number any loaded driver has a row for, ascending — the shared
 *  x-grid both charts resample onto so `trigger:'axis'` can show every driver
 *  at once (see the module docstring). */
function sharedLapGrid(byDriver: Map<string, RaceRecord[]>): number[] {
  const laps = new Set<number>()
  for (const rows of byDriver.values()) {
    for (const row of rows) {
      if (row.LapNumber != null) laps.add(row.LapNumber)
    }
  }
  return [...laps].sort((a, b) => a - b)
}

type NumericField = 'GapToCarAhead' | 'GapToCarBehind' | 'consistent_gap_ahead_laps'

/** A driver's (lap, value) pairs for one numeric column, non-null only,
 *  ascending (rows are pre-sorted by `groupRowsByDriver`). */
function extractSeries(
  rows: RaceRecord[],
  field: NumericField,
): { laps: number[]; values: number[] } {
  const laps: number[] = []
  const values: number[] = []
  for (const row of rows) {
    const value = row[field]
    if (row.LapNumber == null || value == null) continue
    laps.push(row.LapNumber)
    values.push(value)
  }
  return { laps, values }
}

/** Linear-interpolate a continuous quantity (a gap in seconds) onto the shared
 *  grid, but only WITHIN the driver's own observed lap range — outside it
 *  (before their first logged lap, after a retirement) stays `null` rather
 *  than clamping to the nearest endpoint, so the line doesn't invent a gap
 *  that was never measured. */
function resampleContinuous(grid: number[], laps: number[], values: number[]): (number | null)[] {
  if (laps.length === 0) return grid.map(() => null)
  const domainStart = laps[0]
  const domainEnd = laps[laps.length - 1]
  return grid.map((lap) =>
    lap < domainStart || lap > domainEnd ? null : interp(lap, laps, values),
  )
}

/** Exact lookup onto the shared grid for a discrete count (consecutive laps in
 *  a gap window) — never interpolated, since a fractional run-length would be
 *  a fabricated value. Laps the driver has no row for stay `null`. */
function resampleExact(grid: number[], laps: number[], values: number[]): (number | null)[] {
  const byLap = new Map(laps.map((lap, i) => [lap, values[i]]))
  return grid.map((lap) => byLap.get(lap) ?? null)
}

/** Highest observed GapToCarAhead across every loaded driver, +1 — the top
 *  edge of the "no strategy" zone, mirroring `y_max = gap_all.max() + 1` in
 *  `st_plot_undercut_opportunities`. Falls back to a fixed ceiling when no
 *  driver has any gap-ahead value at all (e.g. a lone race leader). */
function computeYMax(byDriver: Map<string, RaceRecord[]>): number {
  let max = 0
  let found = false
  for (const rows of byDriver.values()) {
    for (const row of rows) {
      if (row.GapToCarAhead != null && row.GapToCarAhead > max) {
        max = row.GapToCarAhead
        found = true
      }
    }
  }
  return found ? max + 1 : DEFAULT_Y_MAX
}

// ── Shared chart scaffolding ──────────────────────────────────────────────────

interface LegendEntry {
  name: string
  color: string
}

function buildLegend(entries: LegendEntry[]): EChartsOption['legend'] {
  if (entries.length === 0) return { show: false }
  return {
    data: entries.map(({ name, color }) => ({ name, textStyle: { color } })),
    icon: 'roundRect',
    itemWidth: 10,
    itemHeight: 3,
    top: 0,
    type: 'scroll',
  }
}

function buildGrid(hasLegend: boolean): EChartsOption['grid'] {
  return {
    top: hasLegend ? 44 : 16,
    left: 8,
    right: 20,
    bottom: 8,
    containLabel: true,
  }
}

function lapAxis(): EChartsOption['xAxis'] {
  return {
    type: 'value',
    name: 'Lap',
    nameLocation: 'middle',
    nameGap: 28,
    splitLine: { show: false },
  }
}

/** Box-zoom only, no `inside` dataZoom — the known scroll-trap: `inside`
 *  captures the mouse wheel even with wheel-zoom disabled, so a plain scroll
 *  over the chart would stop scrolling the page. Mirrors ChannelChart.tsx. */
function zoomToolbox(): EChartsOption['toolbox'] {
  return {
    right: 8,
    top: 0,
    feature: {
      dataZoom: { yAxisIndex: 'none', filterMode: 'none' },
      restore: {},
    },
  }
}

/** One tooltip row per hovered series, in the series' own readable colour —
 *  built from an explicit name→colour map (rather than re-deriving a driver
 *  code from the series name, which carries an " ahead"/" behind" suffix here)
 *  so ghost series (zones/highlight/threshold, absent from the map) never show. */
function buildAxisTooltipFormatter(textColorByName: Map<string, string>, formatValue: (raw: number) => string) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    return items
      .filter((item) => item.seriesName && textColorByName.has(item.seriesName))
      .map((item) => {
        const raw = Array.isArray(item.value) ? item.value[1] : item.value
        const display = typeof raw === 'number' ? formatValue(raw) : '—'
        const color = textColorByName.get(item.seriesName ?? '') ?? '#f5f5f5'
        return `<div style="display:flex;justify-content:space-between;gap:20px;">
  <span style="color:${color}">${item.seriesName}</span>
  <span style="font-family:${MONO}">${display}</span>
</div>`
      })
      .join('')
  }
}

// ── Gap evolution (+ undercut/overcut zones) ─────────────────────────────────

type MarkAreaEntry = NonNullable<MarkAreaComponentOption['data']>[number]
type MarkLineEntry = NonNullable<MarkLineComponentOption['data']>[number]
type MarkPointEntry = NonNullable<MarkPointComponentOption['data']>[number]

/** Ghost series (no visible line of its own) hosting the three zone
 *  `markArea` bands — undercut/overcut/no-strategy, bottom to top — and the
 *  two boundary `markLine`s. A low `z` keeps it painting under every driver's
 *  real line, mirroring RaceTrace.tsx's `buildStintBandsSeries`. */
function buildZonesSeries(yMax: number): LineSeriesOption {
  const areaData: MarkAreaEntry[] = [
    [{ yAxis: 0, itemStyle: { color: UNDERCUT_ZONE_COLOR } }, { yAxis: UNDERCUT_MAX }],
    [{ yAxis: UNDERCUT_MAX, itemStyle: { color: OVERCUT_ZONE_COLOR } }, { yAxis: OVERCUT_MAX }],
    [{ yAxis: OVERCUT_MAX, itemStyle: { color: NO_STRATEGY_ZONE_COLOR } }, { yAxis: yMax }],
  ]
  const lineData: MarkLineEntry[] = [
    {
      yAxis: UNDERCUT_MAX,
      lineStyle: { color: UNDERCUT_LINE_COLOR, type: 'dashed' },
      label: {
        show: true,
        formatter: `Undercut ≤ ${UNDERCUT_MAX.toFixed(1)}s`,
        position: 'insideEndTop',
        fontFamily: MONO,
        fontSize: THRESHOLD_LABEL_FONT_SIZE,
        color: UNDERCUT_LINE_COLOR,
      },
    },
    {
      yAxis: OVERCUT_MAX,
      lineStyle: { color: OVERCUT_LINE_COLOR, type: 'dashed' },
      label: {
        show: true,
        formatter: `Overcut ≤ ${OVERCUT_MAX.toFixed(1)}s`,
        position: 'insideEndTop',
        fontFamily: MONO,
        fontSize: THRESHOLD_LABEL_FONT_SIZE,
        color: OVERCUT_LINE_COLOR,
      },
    },
  ]
  return {
    name: 'zones',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 1,
    markArea: { silent: true, data: areaData },
    markLine: { silent: true, symbol: 'none', data: lineData },
  }
}

/** Ghost series hosting the highlight pins for a clicked strategic-window
 *  card — the qualifying laps for `highlight.driver`/`highlight.kind`, pinned
 *  at that driver's own recorded gap (never the resampled/interpolated one),
 *  on the ahead or behind line per `highlightField`. Returns `null` when
 *  there's nothing to draw (no highlight, or the driver has no row at any of
 *  the qualifying laps). */
function buildHighlightSeries(
  byDriver: Map<string, RaceRecord[]>,
  highlight: GapHighlight | undefined,
): LineSeriesOption | null {
  if (!highlight || highlight.laps.length === 0) return null
  const rows = byDriver.get(highlight.driver)
  if (!rows) return null

  const field = highlightField(highlight.kind)
  const rowByLap = new Map(rows.filter((row) => row.LapNumber != null).map((row) => [row.LapNumber as number, row]))
  // ECharts accepts coord-only markPoints at runtime; its types over-require a
  // `name`, so cast the coord list to the data-item shape.
  const points = highlight.laps.flatMap((lap) => {
    const value = rowByLap.get(lap)?.[field]
    return value != null ? [{ coord: [lap, value] as [number, number] }] : []
  }) as unknown as MarkPointEntry[]
  if (points.length === 0) return null

  const color = HIGHLIGHT_COLOR_BY_KIND[highlight.kind]
  return {
    name: 'highlight',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 50,
    markPoint: {
      silent: true,
      symbol: 'circle',
      symbolSize: 10,
      itemStyle: { color, borderColor: '#f5f5f5', borderWidth: 1.5 },
      label: { show: false },
      data: points,
    },
  }
}

/**
 * Gap-to-car-ahead (solid) and gap-to-car-behind (dashed) per loaded driver,
 * team-coloured, over undercut/overcut/no-strategy zone shading — the merge of
 * `st_plot_gap_evolution` and `st_plot_undercut_opportunities` into one chart.
 * `highlight` (from a clicked StrategicWindowCards tile) adds coloured pins at
 * that driver's qualifying laps.
 */
export function buildGapEvolutionOption(
  rows: RaceRecord[],
  year: number | undefined,
  highlight?: GapHighlight,
): EChartsOption {
  const byDriver = groupRowsByDriver(rows)
  const drivers = [...byDriver.keys()].sort()
  const grid = sharedLapGrid(byDriver)
  const yMax = computeYMax(byDriver)

  const legendEntries: LegendEntry[] = []
  const textColorByName = new Map<string, string>()
  const series: LineSeriesOption[] = []

  for (const driver of drivers) {
    const driverRows = byDriver.get(driver) ?? []
    const lineColor = getDriverColor(driver, year)
    const textColor = getDriverTextColor(driver, year)

    const ahead = extractSeries(driverRows, 'GapToCarAhead')
    if (ahead.laps.length > 0) {
      const name = `${driver} ahead`
      const values = resampleContinuous(grid, ahead.laps, ahead.values)
      series.push({
        name,
        type: 'line',
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2, color: lineColor },
        itemStyle: { color: lineColor },
        data: grid.map((lap, i): [number, number | null] => [lap, values[i]]),
      })
      legendEntries.push({ name, color: textColor })
      textColorByName.set(name, textColor)
    }

    const behind = extractSeries(driverRows, 'GapToCarBehind')
    if (behind.laps.length > 0) {
      const name = `${driver} behind`
      const values = resampleContinuous(grid, behind.laps, behind.values)
      series.push({
        name,
        type: 'line',
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: lineColor, type: 'dashed', opacity: 0.7 },
        itemStyle: { color: lineColor },
        data: grid.map((lap, i): [number, number | null] => [lap, values[i]]),
      })
      legendEntries.push({ name, color: textColor })
      textColorByName.set(name, textColor)
    }
  }

  series.push(buildZonesSeries(yMax))
  const highlightSeries = buildHighlightSeries(byDriver, highlight)
  if (highlightSeries) series.push(highlightSeries)

  const hasLegend = legendEntries.length > 0
  const formatSeconds = (raw: number) => `${raw.toFixed(2)}s`

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: buildAxisTooltipFormatter(textColorByName, formatSeconds),
    },
    legend: buildLegend(legendEntries),
    grid: buildGrid(hasLegend),
    xAxis: lapAxis(),
    yAxis: { type: 'value', name: 'Gap (s)', min: 0, max: yMax },
    toolbox: zoomToolbox(),
    series,
  }
}

// ── Gap consistency ───────────────────────────────────────────────────────────

/** Ghost series hosting the "strategic threshold" reference line (3
 *  consecutive laps) — the bar chart's one reference marker, matching
 *  `st_plot_gap_consistency`'s `add_hline(y=3, ...)`. */
function buildConsistencyThresholdSeries(): LineSeriesOption {
  return {
    name: 'threshold',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    z: 1,
    markLine: {
      silent: true,
      symbol: 'none',
      data: [
        {
          yAxis: CONSISTENCY_THRESHOLD,
          lineStyle: { color: UNDERCUT_LINE_COLOR, type: 'dashed' },
          label: {
            show: true,
            formatter: `Strategic threshold (${CONSISTENCY_THRESHOLD} laps)`,
            position: 'insideEndTop',
            fontFamily: MONO,
            fontSize: THRESHOLD_LABEL_FONT_SIZE,
            color: UNDERCUT_LINE_COLOR,
          },
        },
      ],
    },
  }
}

/**
 * Consecutive laps each driver stayed in the same gap-ahead window, one bar
 * series per driver — a faithful port of `st_plot_gap_consistency`'s
 * multi-driver branch (ahead-only bars, since this webapp's Gaps tab is
 * always in "compare drivers" mode, never a single global driver page).
 */
export function buildGapConsistencyOption(rows: RaceRecord[], year: number | undefined): EChartsOption {
  const byDriver = groupRowsByDriver(rows)
  const drivers = [...byDriver.keys()].sort()
  const grid = sharedLapGrid(byDriver)

  const legendEntries: LegendEntry[] = []
  const textColorByName = new Map<string, string>()
  // The threshold reference line (a `LineSeriesOption` ghost series, pushed
  // below) rides alongside the per-driver bars, so the array holds both.
  const series: (BarSeriesOption | LineSeriesOption)[] = []

  for (const driver of drivers) {
    const driverRows = byDriver.get(driver) ?? []
    const { laps, values } = extractSeries(driverRows, 'consistent_gap_ahead_laps')
    if (laps.length === 0) continue

    const color = getDriverColor(driver, year)
    const textColor = getDriverTextColor(driver, year)
    const aligned = resampleExact(grid, laps, values)
    series.push({
      name: driver,
      type: 'bar',
      itemStyle: { color },
      data: grid.map((lap, i): [number, number | null] => [lap, aligned[i]]),
    })
    legendEntries.push({ name: driver, color: textColor })
    textColorByName.set(driver, textColor)
  }

  series.push(buildConsistencyThresholdSeries())
  const hasLegend = legendEntries.length > 0
  const formatLaps = (raw: number) => `${Math.round(raw)} laps`

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: buildAxisTooltipFormatter(textColorByName, formatLaps),
    },
    legend: buildLegend(legendEntries),
    grid: buildGrid(hasLegend),
    xAxis: lapAxis(),
    yAxis: { type: 'value', name: 'Consecutive laps', min: 0 },
    toolbox: zoomToolbox(),
    series,
  }
}
