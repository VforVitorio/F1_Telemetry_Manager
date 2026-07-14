// Lap-time line chart (ECharts). Streamlit parity:
// `frontend/components/dashboard/lap_graph.py::render_lap_graph`.
//
// One line+marker series PER DRIVER, coloured by TEAM colour (never by
// compound — compound is tooltip-only information). Clicking a point loads
// that lap's telemetry via `onLapClick`, which the section wires to the
// dashboard store's `setLap` (click-to-load; this component never fetches
// telemetry itself).

import { useCallback, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { registerF1Theme } from '@/charts/registerEcharts'
import { echartsTheme, F1_THEME } from '@/charts/echartsTheme'
import type { LapTime } from '@/lib/api/telemetry'
import { getDriverColor } from '../lib/drivers'
import { compoundEmoji, compoundLabel } from '../lib/compounds'
import { formatLapTime, formatLapTimeAxis } from '../lib/lapTime'

// Register the token theme at module load, before any chart's init runs
// (mirrors charts/Gauge.tsx — echarts-for-react inits with the `theme` prop
// in componentDidMount, which can fire before an effect-time registration).
registerF1Theme()

// Reuse the shared theme's axis-label color/font for axis NAMES ("Lap
// Number", "Lap Time") so they read consistently with the tick labels
// without duplicating the theme's magic color values here.
const AXIS_NAME_STYLE = {
  color: echartsTheme.valueAxis.axisLabel.color,
  fontFamily: echartsTheme.valueAxis.axisLabel.fontFamily,
}

/** One plotted point: `[lapNumber, lapTime]`, with `compound` carried
 *  alongside so the tooltip can show tyre info without a second lookup. */
interface LapPoint {
  value: [number, number]
  compound: string
}

/** A single driver's series — kept as our own shape (not `echarts`'
 *  `LineSeriesOption`) so the extra `compound` field on each point never
 *  gets excess-property-checked against the library's stricter data type;
 *  it is still structurally assignable into `EChartsOption.series`. */
interface DriverSeriesOption {
  name: string
  type: 'line'
  symbolSize: number
  lineStyle: { color: string }
  itemStyle: { color: string }
  data: LapPoint[]
}

/** Runtime narrowing for whatever `unknown` an ECharts callback hands back. */
function isLapPoint(data: unknown): data is LapPoint {
  if (!data || typeof data !== 'object') return false
  const candidate = data as { value?: unknown; compound?: unknown }
  return (
    Array.isArray(candidate.value) &&
    candidate.value.length === 2 &&
    typeof candidate.value[0] === 'number' &&
    typeof candidate.value[1] === 'number' &&
    typeof candidate.compound === 'string'
  )
}

/** Group already-filtered laps by driver code, preserving lap order. */
function groupByDriver(laps: LapTime[]): Map<string, LapTime[]> {
  const byDriver = new Map<string, LapTime[]>()
  for (const lap of laps) {
    const list = byDriver.get(lap.driver) ?? []
    list.push(lap)
    byDriver.set(lap.driver, list)
  }
  return byDriver
}

/** Build one driver's line+marker series, coloured by TEAM colour. */
function buildDriverSeries(driver: string, laps: LapTime[], color: string): DriverSeriesOption {
  return {
    name: driver,
    type: 'line',
    symbolSize: 7,
    lineStyle: { color },
    itemStyle: { color },
    data: laps.map((lap) => ({ value: [lap.lap_number, lap.lap_time], compound: lap.compound })),
  }
}

/** Tooltip text: `<emoji> DRIVER — Lap N — M:SS.mmm — Compound`. */
function formatLapTooltip(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const { seriesName, data } = raw as { seriesName?: string; data?: unknown }
  if (!isLapPoint(data)) return ''
  const [lapNumber, lapTime] = data.value
  return `${compoundEmoji(data.compound)} ${seriesName ?? ''} — Lap ${lapNumber} — ${formatLapTime(lapTime)} — ${compoundLabel(data.compound)}`
}

/** Build the full chart option from the per-driver series list. */
function buildLapChartOption(seriesList: DriverSeriesOption[]): EChartsOption {
  return {
    tooltip: { trigger: 'item', formatter: formatLapTooltip },
    legend: { data: seriesList.map((series) => series.name), top: 0 },
    grid: { top: 44, left: 56, right: 24, bottom: 44, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap Number',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: AXIS_NAME_STYLE,
      scale: true,
    },
    yAxis: {
      type: 'value',
      name: 'Lap Time',
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: AXIS_NAME_STYLE,
      axisLabel: { formatter: formatLapTimeAxis },
      // Autorange around the lap times (~78-95 s) instead of forcing a 0:00
      // baseline, which would squash every line into the top of the plot.
      scale: true,
    },
    series: seriesList,
  }
}

/** A driver code + lap number pulled off a click event, or null when the
 *  click missed a data point (background/axis click). */
interface LapClickTarget {
  driver: string
  lapNumber: number
}

function extractLapClick(raw: unknown): LapClickTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const params = raw as { seriesName?: string; data?: unknown; value?: unknown }
  const driver = params.seriesName
  const fromData = isLapPoint(params.data) ? params.data.value[0] : undefined
  const fromValue =
    Array.isArray(params.value) && typeof params.value[0] === 'number' ? params.value[0] : undefined
  const lapNumber = fromData ?? fromValue
  if (!driver || lapNumber == null) return null
  return { driver, lapNumber }
}

export interface LapChartProps {
  /** Laps already passed through `applyLapFilters` (the visible set). */
  laps: LapTime[]
  /** Selection order — controls series/legend order (Streamlit parity). */
  drivers: string[]
  year: number | undefined
  onLapClick: (driver: string, lapNumber: number) => void
}

/** Lap-time chart: one coloured-by-driver line per selected driver, with
 *  click-to-load and a compound-aware tooltip. */
export function LapChart({ laps, drivers, year, onLapClick }: LapChartProps) {
  const option = useMemo(() => {
    const byDriver = groupByDriver(laps)
    const seriesList = drivers
      .filter((driver) => byDriver.has(driver))
      .map((driver) =>
        buildDriverSeries(driver, byDriver.get(driver) ?? [], getDriverColor(driver, year)),
      )
    return buildLapChartOption(seriesList)
  }, [laps, drivers, year])

  const handleClick = useCallback(
    (raw: unknown) => {
      const click = extractLapClick(raw)
      if (click) onLapClick(click.driver, click.lapNumber)
    },
    [onLapClick],
  )

  return (
    <ReactECharts
      theme={F1_THEME}
      option={option}
      style={{ height: 400 }}
      notMerge
      onEvents={{ click: handleClick }}
    />
  )
}
