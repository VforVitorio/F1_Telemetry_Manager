// Shared ECharts line chart for the TELEMETRY grid (issue #34, §6.1). One
// component (`ChannelChart`) covers 6 of the 7 channels via `ChannelConfig`
// (channels.ts); Delta is cross-driver — it needs a reference lap to diff
// every other driver against, not a single telemetry array — so it gets its
// own `DeltaChart` below. Both share `SyncedLineChart`, the thin ECharts
// wrapper that joins every telemetry chart to one crosshair group.
//
// Streamlit parity: frontend/components/telemetry/*.py — same x-axis
// (distance), one line per loaded driver in the team colour, and
// `hovermode='x unified'` becomes `tooltip.trigger: 'axis'` here, so
// scrubbing any one chart shows every driver's value at that distance.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption, LineSeriesOption } from 'echarts'
import * as echarts from 'echarts'
import { registerF1Theme } from '@/charts/registerEcharts'
import { F1_THEME } from '@/charts/echartsTheme'
import type { LapTelemetry } from '@/lib/api/telemetry'
import { getDriverColor } from '../lib/drivers'
import type { ChannelConfig } from './channels'

// Register the token theme at module load, before any chart's init runs
// (echarts-for-react inits with the `theme` prop in componentDidMount, which
// fires before a parent's passive effect — see charts/Gauge.tsx).
registerF1Theme()

const CHART_HEIGHT = 320

// Every telemetry ECharts instance joins this group so `echarts.connect`
// moves every chart's crosshair together when one is scrubbed. That's a
// meaningful sync, not just a visual one: x is distance on all 7 charts.
const CROSSHAIR_GROUP = 'telemetry-crosshair'

const AXIS_TOOLTIP: EChartsOption['tooltip'] = { trigger: 'axis', axisPointer: { type: 'line' } }

/** Shared option scaffolding (tooltip/legend/grid/x-axis) every telemetry
 *  chart reuses; callers only supply the y-axis and series. The y-axis name is
 *  anchored to the left of the axis line (`align: 'left'`) so a label like
 *  "Throttle (%)" extends into the plot instead of half of it clipping off the
 *  container's left edge. */
function baseOption(driversWithData: string[], yAxis: EChartsOption['yAxis']): EChartsOption {
  const yAxisStyled = {
    // `scale: true` autoranges around the data instead of forcing a 0 baseline
    // (Plotly's default in the Streamlit original) — RPM/Speed/Delta would
    // otherwise waste half the plot. Channels that set explicit min/max
    // (throttle 0-100, gear, DRS) override this, so it only affects the
    // free-ranged ones.
    scale: true,
    nameLocation: 'end' as const,
    nameGap: 12,
    nameTextStyle: { align: 'left' as const },
    ...(yAxis as object),
  }
  return {
    tooltip: AXIS_TOOLTIP,
    legend: { data: driversWithData, top: 0 },
    grid: { top: 44, left: 8, right: 20, bottom: 8, containLabel: true },
    xAxis: { type: 'value', name: 'Distance (m)', nameLocation: 'middle', nameGap: 28 },
    yAxis: yAxisStyled,
  }
}

/**
 * One ECharts line series per loaded driver, coloured by team. `points`
 * returns a driver's [distance, value] pairs — the only thing that differs
 * between a plain channel (read one array) and Delta (diff two arrays).
 */
function buildDriverSeries(
  drivers: string[],
  year: number | undefined,
  stepped: boolean | undefined,
  points: (driver: string) => Array<[number, number]>,
): LineSeriesOption[] {
  return drivers.map((driver) => ({
    name: driver,
    type: 'line',
    showSymbol: false,
    step: stepped ? 'end' : undefined,
    lineStyle: { width: 2, color: getDriverColor(driver, year) },
    itemStyle: { color: getDriverColor(driver, year) },
    data: points(driver),
  }))
}

function buildChannelOption(
  byDriver: Record<string, LapTelemetry>,
  drivers: string[],
  year: number | undefined,
  channel: ChannelConfig,
): EChartsOption {
  const loaded = drivers.filter((driver) => byDriver[driver])
  const series = buildDriverSeries(loaded, year, channel.stepped, (driver) => {
    const telemetry = byDriver[driver]
    const values = channel.transform(telemetry)
    return telemetry.distance.map((distance, i): [number, number] => [distance, values[i]])
  })

  return {
    ...baseOption(loaded, {
      type: 'value',
      name: channel.yName,
      min: channel.yAxis?.min,
      max: channel.yAxis?.max,
      interval: channel.yAxis?.interval,
      axisLabel: channel.yAxis?.formatter ? { formatter: channel.yAxis.formatter } : undefined,
    }),
    series,
  }
}

/**
 * ECharts wrapper shared by every telemetry chart: renders the F1-themed
 * line chart and joins the crosshair group so scrubbing one channel moves
 * the vertical guide on all the others at the same distance.
 */
function SyncedLineChart({ option, ariaLabel }: { option: EChartsOption; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <ReactECharts
        theme={F1_THEME}
        option={option}
        style={{ height: CHART_HEIGHT }}
        notMerge
        onChartReady={(instance) => {
          instance.group = CROSSHAIR_GROUP
          echarts.connect(CROSSHAIR_GROUP)
        }}
      />
    </div>
  )
}

export interface ChannelChartProps {
  title: string
  byDriver: Record<string, LapTelemetry>
  drivers: string[]
  year: number | undefined
  channel: ChannelConfig
}

/** Renders one telemetry channel (speed/throttle/brake/rpm/gear/drs) as an
 *  ECharts line per loaded driver, x = distance in meters. */
export function ChannelChart({ title, byDriver, drivers, year, channel }: ChannelChartProps) {
  const option = useMemo(
    () => buildChannelOption(byDriver, drivers, year, channel),
    [byDriver, drivers, year, channel],
  )
  return <SyncedLineChart option={option} ariaLabel={`${title} telemetry chart`} />
}

// ---- Delta: cross-driver, needs its own data prep --------------------------

const MIN_DELTA_DRIVERS = 2

/**
 * Linear interpolation of `ys` at `x`, given a monotonically increasing `xs`
 * (mirrors `numpy.interp`, used by the Streamlit original in
 * `delta_graph.py::_calculate_deltas` to align a driver's time series onto
 * the reference driver's distance grid). Values outside `[xs[0], xs[last]]`
 * clamp to the nearest endpoint instead of extrapolating.
 */
function interp(x: number, xs: number[], ys: number[]): number {
  const last = xs.length - 1
  if (x <= xs[0]) return ys[0]
  if (x >= xs[last]) return ys[last]

  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo])
  return ys[lo] + t * (ys[hi] - ys[lo])
}

/**
 * The reference lap is the loaded driver with the smallest final cumulative
 * time — the fastest lap among those currently loaded. `delta_graph.py`
 * picks the same reference before diffing every other driver against it.
 */
function findReferenceDriver(
  byDriver: Record<string, LapTelemetry>,
  drivers: string[],
): string | undefined {
  let reference: string | undefined
  let bestFinalTime = Infinity
  for (const driver of drivers) {
    const telemetry = byDriver[driver]
    const finalTime = telemetry.time[telemetry.time.length - 1]
    if (finalTime < bestFinalTime) {
      bestFinalTime = finalTime
      reference = driver
    }
  }
  return reference
}

function buildDeltaOption(
  byDriver: Record<string, LapTelemetry>,
  drivers: string[],
  year: number | undefined,
): EChartsOption {
  const loaded = drivers.filter((driver) => byDriver[driver])
  const reference = findReferenceDriver(byDriver, loaded)
  if (!reference) return baseOption([], { type: 'value', name: 'Delta (s)' })

  const refTelemetry = byDriver[reference]
  const series = buildDriverSeries(loaded, year, false, (driver) => {
    const telemetry = byDriver[driver]
    return telemetry.distance.map((distance, i): [number, number] => {
      const refTime = interp(distance, refTelemetry.distance, refTelemetry.time)
      return [distance, telemetry.time[i] - refTime]
    })
  })

  // Dashed y=0 reference guide — the reference driver's own delta line hugs
  // it. ECharts attaches markLine per-series (no chart-level equivalent), so
  // it rides on the first series (mutating in place; `firstSeries` is the
  // same object as `series[0]`).
  const firstSeries = series[0]
  if (firstSeries) {
    firstSeries.markLine = {
      symbol: 'none',
      silent: true,
      lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.35)' },
      data: [{ yAxis: 0 }],
    }
  }

  return { ...baseOption(loaded, { type: 'value', name: 'Delta (s)' }), series }
}

export interface DeltaChartProps {
  byDriver: Record<string, LapTelemetry>
  drivers: string[]
  year: number | undefined
}

/**
 * Time delta vs. the fastest loaded driver, interpolated onto their distance
 * grid. Needs >=2 loaded drivers to have anyone to compare against —
 * `delta_graph.py` shows an `st.info` notice in the same case.
 */
export function DeltaChart({ byDriver, drivers, year }: DeltaChartProps) {
  const loaded = drivers.filter((driver) => byDriver[driver])
  const option = useMemo(() => buildDeltaOption(byDriver, drivers, year), [byDriver, drivers, year])

  if (loaded.length < MIN_DELTA_DRIVERS) {
    return <p className="px-2 py-12 text-center text-sm text-fg-3">Delta needs ≥2 drivers</p>
  }

  return <SyncedLineChart option={option} ariaLabel="Delta telemetry chart" />
}
