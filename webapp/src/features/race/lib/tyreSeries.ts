// Pure ECharts option builders for the Tyres tab's five degradation views,
// ported from the Streamlit originals (frontend/utils/race_viz.py,
// frontend/components/race_analysis/tire_charts.py). One series per
// (driver, stint): line colour carries the driver identity, dash style
// carries the compound that stint ran, so a driver's Medium and Hard stints
// stay visually linked (same hue) yet distinguishable (different dash) —
// the same encoding race_viz.py uses in its multi-driver mode.
//
// Every series is resampled onto ONE shared TyreLife grid before it reaches
// ECharts: with per-stint sample points, an axis tooltip only reports the
// series that happens to have a point at the snapped x, so scrubbing would
// silently show a single driver instead of the whole field. Same fix as the
// Dashboard telemetry charts (`ChannelChart.tsx`, `findDensestDistanceGrid`).

import type {
  DefaultLabelFormatterCallbackParams,
  EChartsOption,
  LineSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { RACE_YEAR, type RaceRecord } from '@/lib/api/race'
import { getDriverColor, getDriverTextColor, resolvePilotColor } from '@/lib/drivers'
import { compoundLabel, compoundVariant } from '@/lib/compounds'
import { interp } from '@/lib/interp'
import type { Theme } from '@/stores/ui'
import type { TyreChartKey } from '../store'

const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"

// ── Compound dash encoding (ported from race_viz.py COMPOUND_DASHES) ────────

type LineDash = 'solid' | number[]

const DASH_BY_COMPOUND_ID: Record<number, LineDash> = {
  1: 'solid', // soft
  2: [6, 4], // medium
  3: [1, 3], // hard
  4: [8, 3, 2, 3], // intermediate
  5: [12, 4], // wet
}

const DASH_BY_COMPOUND_NAME: Record<string, LineDash> = {
  soft: 'solid',
  medium: [6, 4],
  hard: [1, 3],
  intermediate: [8, 3, 2, 3],
  inter: [8, 3, 2, 3],
  wet: [12, 4],
}

/** SVG `stroke-dasharray` equivalents of the patterns above, so StintGantt's
 *  legend strip (fill-colour encoding) can also show what each compound looks
 *  like as a dash on the five charts below — the two views bridge into one
 *  visual system instead of two unrelated encodings. */
export const COMPOUND_DASH_PREVIEW: Record<string, string> = {
  SOFT: '0',
  MEDIUM: '6 4',
  HARD: '1 3',
  INTERMEDIATE: '8 3 2 3',
  WET: '12 4',
}

function dashForCompound(compoundId: number | null, compound: string): LineDash {
  if (compoundId != null && DASH_BY_COMPOUND_ID[compoundId]) return DASH_BY_COMPOUND_ID[compoundId]
  return DASH_BY_COMPOUND_NAME[compound.toLowerCase()] ?? 'solid'
}

// ── (driver, stint) grouping shared by every degradation-metric builder ─────

interface StintGroup {
  driver: string
  compound: string
  compoundId: number | null
  stint: number
  rows: RaceRecord[]
}

/** Groups rows by (DriverNumber, Stint), sorted ascending by TyreLife within
 *  each group. Rows missing any of DriverNumber/Stint/TyreLife are dropped —
 *  a degradation point without a tyre-age x value can't be plotted. */
function groupByDriverStint(rows: RaceRecord[]): StintGroup[] {
  const groups = new Map<string, StintGroup>()
  for (const row of rows) {
    if (row.DriverNumber == null || row.Stint == null || row.TyreLife == null) continue
    const key = `${row.DriverNumber}-${row.Stint}`
    let group = groups.get(key)
    if (!group) {
      group = {
        driver: row.Driver,
        compound: row.Compound,
        compoundId: row.CompoundID,
        stint: row.Stint,
        rows: [],
      }
      groups.set(key, group)
    }
    group.rows.push(row)
  }
  const list = [...groups.values()]
  for (const group of list) group.rows.sort((a, b) => (a.TyreLife ?? 0) - (b.TyreLife ?? 0))
  list.sort((a, b) => a.driver.localeCompare(b.driver) || a.stint - b.stint)
  return list
}

/** Legend/tooltip name for a stint's series — the stint number keeps two
 *  stints on the same compound (a driver pitting back onto the same tyre)
 *  from sharing an identical label. */
function seriesName(group: StintGroup): string {
  return `${group.driver} · ${compoundLabel(group.compound)} S${group.stint}`
}

/** (x, y) pairs for one metric, dropping rows where TyreLife or the metric
 *  itself is null — a builder can't plot a point it doesn't have. */
function extractPoints(rows: RaceRecord[], metric: (row: RaceRecord) => number | null) {
  const xs: number[] = []
  const ys: number[] = []
  for (const row of rows) {
    const y = metric(row)
    if (row.TyreLife == null || y == null) continue
    xs.push(row.TyreLife)
    ys.push(y)
  }
  return { xs, ys }
}

/** The shared TyreLife grid every series resamples onto: integer laps from 0
 *  up to the longest stint in the frame. */
function tyreLifeGrid(groups: StintGroup[]): number[] {
  let max = 0
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.TyreLife != null && row.TyreLife > max) max = row.TyreLife
    }
  }
  const grid: number[] = []
  for (let lap = 0; lap <= Math.max(Math.ceil(max), 1); lap++) grid.push(lap)
  return grid
}

/** Interpolates (xs, ys) onto `grid`, but only inside [min(xs), max(xs)] — a
 *  stint that ran 8 laps has nothing meaningful to say about lap 40, so grid
 *  points outside its own range stay `null` (and `connectNulls: false` keeps
 *  the line from stretching across them). */
function resampleOnGrid(grid: number[], xs: number[], ys: number[]): Array<number | null> {
  if (xs.length === 0) return grid.map(() => null)
  const lo = xs[0]
  const hi = xs[xs.length - 1]
  return grid.map((x) => (x < lo || x > hi ? null : interp(x, xs, ys)))
}

/** Pairs the grid with its resampled values into ECharts' `[x, y]` data
 *  format, in one place so every builder below shares the same tuple shape. */
function toSeriesData(
  grid: number[],
  values: Array<number | null>,
): Array<[number, number | null]> {
  return grid.map((x, i): [number, number | null] => [x, values[i]])
}

// ── Shared chart scaffolding ─────────────────────────────────────────────────

/** The tyres tab's shared axis-tooltip formatter: a "Tyre life N laps" header
 *  (the shared x-axis value rounded to a whole lap, replacing ECharts' default
 *  two-decimal float) followed by one coloured row per hovered series. Kept
 *  as its own copy of the header-plus-rows shape gapSeries.ts's tooltip
 *  formatter uses, rather than importing it, so the two chart files stay
 *  independent of each other. The header has no explicit colour, so it
 *  inherits the tooltip's own theme text colour and just dims via opacity
 *  instead of hardcoding a light/dark hex here. */
function tyreAxisTooltipFormatter(textColorByName: Map<string, string>, valueSuffix: string) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    const rows = items
      .filter((item) => item.seriesName && textColorByName.has(item.seriesName))
      .map((item) => {
        const raw = Array.isArray(item.value) ? item.value[1] : item.value
        const display = typeof raw === 'number' ? `${raw.toFixed(2)}${valueSuffix}` : '-'
        const color = textColorByName.get(item.seriesName ?? '') ?? '#f5f5f5'
        return `<div style="display:flex;justify-content:space-between;gap:20px;">
  <span style="color:${color}">${item.seriesName}</span>
  <span style="font-family:${MONO}">${display}</span>
</div>`
      })
      .join('')
    const firstAxisValue = (items[0] as { axisValue?: number | string } | undefined)?.axisValue
    const lap = typeof firstAxisValue === 'number' ? Math.round(firstAxisValue) : firstAxisValue
    const header = `<div style="font-family:${MONO};margin-bottom:6px;opacity:0.7;">Tyre life ${lap ?? '-'} laps</div>`
    return header + rows
  }
}

/** Scaffolding shared by every degradation view. The ECharts legend stays off
 *  (`show: false`): with six to twelve (driver, stint) entries it was the
 *  single most cramped element on the chart, and driver identity is now
 *  carried once, in HTML, by the chip row in the ChartCard header instead
 *  (see TyreChartSwitcher.tsx), freeing the top of the grid back down from
 *  44px to 16px. `textColorByName` feeds the per-series tooltip rows; each
 *  builder assembles it as it creates its series, since that's where a
 *  series' driver (and hence its colour) is known. */
function baseTyreOption(valueSuffix: string, textColorByName: Map<string, string>): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: tyreAxisTooltipFormatter(textColorByName, valueSuffix),
    },
    legend: { show: false },
    grid: { top: 16, left: 8, right: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'value', name: 'Tyre life (laps)', nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', scale: true },
    // No `inside` dataZoom — it traps the page's mouse wheel (see
    // ChannelChart.tsx). Zoom stays available through the toolbox box-zoom
    // (drag a box), which never touches the wheel.
    toolbox: {
      right: 8,
      top: 0,
      feature: { dataZoom: { yAxisIndex: 'none', filterMode: 'none' }, restore: {} },
    },
  }
}

function lineSeries(
  name: string,
  color: string,
  dash: LineDash,
  width: number,
  opacity: number | undefined,
  data: Array<[number, number | null]>,
): LineSeriesOption {
  return {
    name,
    type: 'line',
    showSymbol: false,
    connectNulls: false,
    lineStyle: { width, color, type: dash, opacity },
    itemStyle: { color, opacity },
    data,
  }
}

// ── Builder 1: speed vs tyre age (single-compound view) ──────────────────────

const SECTOR_FIELDS: Array<{
  key: 'SpeedI1' | 'SpeedI2' | 'SpeedFL'
  label: string
  dash: LineDash
}> = [
  { key: 'SpeedI1', label: 'Sector 1', dash: 'solid' },
  { key: 'SpeedI2', label: 'Sector 2', dash: [6, 4] },
  { key: 'SpeedFL', label: 'Finish line', dash: [1, 3] },
]

/** The compound the Speed view falls back to when none is selected — the
 *  one most laps in the frame ran, matching race_viz.py's
 *  `counts.index[0]` fallback. */
function mostCommonCompoundVariant(rows: RaceRecord[]): string | undefined {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const variant = compoundVariant(row.Compound)
    if (!variant) continue
    counts.set(variant, (counts.get(variant) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [variant, count] of counts) {
    if (count > bestCount) {
      best = variant
      bestCount = count
    }
  }
  return best
}

/**
 * Speed vs tyre age, split by speed-trap sector (I1/I2/FL) — the one view
 * that looks at a SINGLE compound at a time (the CompoundPill filter above
 * the switcher). Since compound is already fixed here, dash is repurposed to
 * the sector split instead of the compound; driver colour still carries the
 * driver identity, same as every other view.
 */
function buildSpeedOption(
  rows: RaceRecord[],
  compound: string | undefined,
  theme: Theme,
): EChartsOption {
  const activeCompound = compound ?? mostCommonCompoundVariant(rows)
  const filtered = activeCompound
    ? rows.filter((row) => compoundVariant(row.Compound) === activeCompound)
    : rows

  const groups = groupByDriverStint(filtered)
  const grid = tyreLifeGrid(groups)
  const series: LineSeriesOption[] = []
  const textColorByName = new Map<string, string>()
  for (const group of groups) {
    const color = resolvePilotColor(getDriverColor(group.driver, RACE_YEAR), theme)
    const textColor = getDriverTextColor(group.driver, RACE_YEAR)
    for (const sector of SECTOR_FIELDS) {
      const { xs, ys } = extractPoints(group.rows, (row) => row[sector.key])
      if (xs.length === 0) continue
      const values = resampleOnGrid(grid, xs, ys)
      const name = `${seriesName(group)} · ${sector.label}`
      series.push(lineSeries(name, color, sector.dash, 2, undefined, toSeriesData(grid, values)))
      textColorByName.set(name, textColor)
    }
  }
  return { ...baseTyreOption(' km/h', textColorByName), series }
}

// ── Builders 2-3-5: one metric, one line per (driver, stint) ────────────────

function buildMetricOption(
  rows: RaceRecord[],
  metric: (row: RaceRecord) => number | null,
  valueSuffix: string,
  theme: Theme,
): EChartsOption {
  const groups = groupByDriverStint(rows)
  const grid = tyreLifeGrid(groups)
  const series: LineSeriesOption[] = []
  const textColorByName = new Map<string, string>()
  for (const group of groups) {
    const { xs, ys } = extractPoints(group.rows, metric)
    if (xs.length === 0) continue
    const color = resolvePilotColor(getDriverColor(group.driver, RACE_YEAR), theme)
    const values = resampleOnGrid(grid, xs, ys)
    const name = seriesName(group)
    series.push(
      lineSeries(
        name,
        color,
        dashForCompound(group.compoundId, group.compound),
        2,
        undefined,
        toSeriesData(grid, values),
      ),
    )
    textColorByName.set(name, getDriverTextColor(group.driver, RACE_YEAR))
  }
  return { ...baseTyreOption(valueSuffix, textColorByName), series }
}

// ── Builder 4: regular vs fuel-adjusted degradation ──────────────────────────

/**
 * Regular (DegradationRate) vs fuel-adjusted (FuelAdjustedDegAbsolute)
 * degradation, two series per (driver, stint) sharing that stint's colour and
 * compound dash — the regular trace is thin and translucent, the adjusted
 * trace is bold, mirroring race_viz.py's thin-dashed-vs-bold-solid pairing
 * (there the dash was free for this; here it already carries the compound,
 * so weight + opacity take over as the regular/adjusted signal instead).
 *
 * The regular trace's opacity and width are themed: at dark-mode's 0.5
 * opacity the raw line washes out to near-invisible over a white light-mode
 * card, so light mode gets a stronger 0.65 opacity and a touch more width to
 * keep the raw-vs-adjusted contrast the whole view exists to show.
 */
function buildRegVsAdjOption(rows: RaceRecord[], theme: Theme): EChartsOption {
  const groups = groupByDriverStint(rows)
  const grid = tyreLifeGrid(groups)
  const series: LineSeriesOption[] = []
  const textColorByName = new Map<string, string>()
  const regularOpacity = theme === 'light' ? 0.65 : 0.5
  const regularWidth = theme === 'light' ? 1.75 : 1.5
  for (const group of groups) {
    const color = resolvePilotColor(getDriverColor(group.driver, RACE_YEAR), theme)
    const dash = dashForCompound(group.compoundId, group.compound)
    const name = seriesName(group)
    const textColor = getDriverTextColor(group.driver, RACE_YEAR)

    const regular = extractPoints(group.rows, (row) => row.DegradationRate)
    if (regular.xs.length > 0) {
      const values = resampleOnGrid(grid, regular.xs, regular.ys)
      const regularName = `${name} · regular`
      series.push(
        lineSeries(
          regularName,
          color,
          dash,
          regularWidth,
          regularOpacity,
          toSeriesData(grid, values),
        ),
      )
      textColorByName.set(regularName, textColor)
    }

    const adjusted = extractPoints(group.rows, (row) => row.FuelAdjustedDegAbsolute)
    if (adjusted.xs.length > 0) {
      const values = resampleOnGrid(grid, adjusted.xs, adjusted.ys)
      const adjustedName = `${name} · adjusted`
      series.push(lineSeries(adjustedName, color, dash, 2.5, undefined, toSeriesData(grid, values)))
      textColorByName.set(adjustedName, textColor)
    }
  }
  return { ...baseTyreOption('s', textColorByName), series }
}

// ── Public entry point ───────────────────────────────────────────────────────

/** Tab label + chart-card title for each of the five views. Titles carry the
 *  unit that used to live in the (clipped) ECharts y-axis name: deleting
 *  that name in `baseTyreOption` means the title is now the only place the
 *  unit shows up, so it has to say it. */
export const TYRE_CHART_META: Record<TyreChartKey, { label: string; title: string }> = {
  speed: { label: 'Speed', title: 'Speed vs tyre age (km/h)' },
  fuelAdj: { label: 'Fuel-adj', title: 'Fuel-adjusted degradation (s/lap)' },
  regVsAdj: { label: 'Raw vs adj', title: 'Regular vs fuel-adjusted degradation (s/lap)' },
  rate: { label: 'Rate', title: 'Degradation rate (s/lap)' },
  pct: { label: 'Deg %', title: 'Fuel-adjusted degradation (%)' },
}

export interface TyreChartBuildOptions {
  /** Active compound filter — only the Speed view uses it (the other four
   *  already show every compound at once via the dash encoding). */
  compound?: string
  theme: Theme
}

/** Builds the ECharts option for one of the five tyre-degradation views. */
export function buildTyreChartOption(
  key: TyreChartKey,
  rows: RaceRecord[],
  opts: TyreChartBuildOptions,
): EChartsOption {
  switch (key) {
    case 'speed':
      return buildSpeedOption(rows, opts.compound, opts.theme)
    case 'fuelAdj':
      return buildMetricOption(rows, (row) => row.FuelAdjustedDegAbsolute, 's', opts.theme)
    case 'regVsAdj':
      return buildRegVsAdjOption(rows, opts.theme)
    case 'rate':
      return buildMetricOption(rows, (row) => row.DegradationRate, 's', opts.theme)
    case 'pct':
      return buildMetricOption(rows, (row) => row.FuelAdjustedDegPercent, '%', opts.theme)
  }
}

// ── Stint gantt model ────────────────────────────────────────────────────────

export interface GanttStint {
  driver: string
  stint: number
  compound: string
  startLap: number
  endLap: number
}

/**
 * One block per (DriverNumber, Stint): the lap range it covers and the
 * compound it ran. Unlike the degradation groupings above, this only needs
 * LapNumber (not TyreLife) — every lap in a stint counts toward its range
 * even if the degradation features are null for that lap.
 */
export function buildGanttModel(rows: RaceRecord[]): GanttStint[] {
  const groups = new Map<string, GanttStint>()
  for (const row of rows) {
    if (row.DriverNumber == null || row.Stint == null || row.LapNumber == null) continue
    const key = `${row.DriverNumber}-${row.Stint}`
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        driver: row.Driver,
        stint: row.Stint,
        compound: row.Compound,
        startLap: row.LapNumber,
        endLap: row.LapNumber,
      })
    } else {
      existing.startLap = Math.min(existing.startLap, row.LapNumber)
      existing.endLap = Math.max(existing.endLap, row.LapNumber)
    }
  }
  return [...groups.values()].sort((a, b) => a.driver.localeCompare(b.driver) || a.stint - b.stint)
}
