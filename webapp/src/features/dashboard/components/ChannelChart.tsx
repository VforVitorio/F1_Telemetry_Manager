// Shared ECharts line chart for the TELEMETRY grid (issue #34, §6.1). One
// component (`ChannelChart`) covers 7 of the 8 channels via `ChannelConfig`
// (channels.ts); Delta is cross-driver — it needs a reference lap to diff
// every other driver against, not a single telemetry array — so it gets its
// own `DeltaChart` below. Both share `SyncedLineChart`, the thin ECharts
// wrapper that joins every telemetry chart to one crosshair group.
//
// Streamlit parity: frontend/components/telemetry/*.py — same x-axis
// (distance), one line per loaded driver in the team colour, and
// `hovermode='x unified'` becomes `tooltip.trigger: 'axis'` here, so
// scrubbing any one chart shows every driver's value at that distance.

import { memo, useContext, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type {
  DefaultLabelFormatterCallbackParams,
  EChartsOption,
  LineSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import * as echarts from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { F1_LIGHT_THEME } from '@/charts/echartsTheme'
import { ChartMaximizedContext } from '@/components/ChartCard'
import type { LapTelemetry } from '@/lib/api/telemetry'
import { getDriverColor, getDriverTextColor } from '@/lib/drivers'
import { interp } from '@/lib/interp'
import type { ChannelConfig } from './channels'
import { TelemetryLoader } from './TelemetryLoader'

// Register the token theme at module load, before any chart's init runs
// (echarts-for-react inits with the `theme` prop in componentDidMount, which
// fires before a parent's passive effect — see charts/Gauge.tsx).
registerF1Theme()

const CHART_HEIGHT = 320
// DRS renders as a state band, not a full telemetry trace — a shorter card
// keeps it from claiming as much vertical rhythm as Speed/RPM/etc.
const BAND_CHART_HEIGHT = 180

// Legend only earns its keep once there's something to disambiguate between —
// a lone "— VER" floating atop a single-driver chart is noise, not
// information. Hiding it frees the strip `grid.top` reserved for it.
const LEGEND_GRID_TOP = 44
const NO_LEGEND_GRID_TOP = 16

// Every telemetry ECharts instance joins this group so `echarts.connect`
// moves every chart's crosshair together when one is scrubbed. That's a
// meaningful sync, not just a visual one: x is distance on all 8 charts —
// and, since dataZoom lives in `baseOption` below, a zoom/pan on one
// propagates group-wide too.
const CROSSHAIR_GROUP = 'telemetry-crosshair'

// Delta's y=0 reference markLine (see buildDeltaOption) is a per-series
// style, not governed by the registered ECharts theme — it needs its own
// light/dark swap, mirroring echartsTheme.ts's fg/hairline palettes.
const MARK_LINE_COLOR_DARK = 'rgba(255,255,255,0.35)'
const MARK_LINE_COLOR_LIGHT = 'rgba(20,18,31,0.35)'

interface LegendEntry {
  name: string
  color: string
}

/**
 * One tooltip row per hovered series: the driver code in its (readable) team
 * colour, the value right-aligned in mono — turns ECharts' default
 * left-aligned wall of numbers into something closer to a timing scoreboard.
 * Shared by every telemetry chart (baseOption below), so drivers read the
 * same way whether it's Speed, Delta, or the DRS band.
 */
function buildTooltipFormatter(year: number | undefined) {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items: DefaultLabelFormatterCallbackParams[] = Array.isArray(params) ? params : [params]
    return items
      .map(({ seriesName, value }) => {
        if (!seriesName) return ''
        const raw = Array.isArray(value) ? value[value.length - 1] : value
        const display =
          typeof raw === 'number'
            ? Number.isInteger(raw)
              ? String(raw) // gear / DRS are integers — no ".0"
              : raw.toFixed(1)
            : String(raw ?? '')
        return `<div style="display:flex;justify-content:space-between;gap:20px;">
  <span style="color:${getDriverTextColor(seriesName, year)}">${seriesName}</span>
  <span style="font-family:'JetBrains Mono Variable',monospace">${display}</span>
</div>`
      })
      .join('')
  }
}

/**
 * Shared option scaffolding (tooltip/legend/grid/x-axis/zoom) every
 * telemetry chart reuses; callers only supply the y-axis and series. Legend
 * entries carry each driver's readable team colour so the driver name shows
 * in-colour instead of plain white; with only one driver loaded the legend
 * is dropped entirely (nothing to disambiguate) and the freed strip goes
 * back to the plot via `grid.top`. Also wires drag-pan/zoom (`dataZoom`) and
 * a Plotly-style box-zoom + reset (`toolbox`) — see the inline comments on
 * each for why the specific settings, and `CROSSHAIR_GROUP` above for how
 * a zoom on one chart propagates to the rest.
 */
function baseOption(
  legendEntries: LegendEntry[],
  yAxis: EChartsOption['yAxis'],
  year: number | undefined,
): EChartsOption {
  const showLegend = legendEntries.length > 1
  const yAxisStyled = {
    // `scale: true` autoranges around the data instead of forcing a 0 baseline
    // (Plotly's default in the Streamlit original) — RPM/Speed/Delta would
    // otherwise waste half the plot. Channels that set explicit min/max
    // (throttle 0-100, gear, DRS) override this, so it only affects the
    // free-ranged ones.
    scale: true,
    ...(yAxis as object),
  }
  return {
    // Entrance paint animation on (ECharts default). The old double-paint was
    // React StrictMode double-mounting the chart in dev, not the animation
    // itself — that's dropped in main.tsx, so this now plays exactly once.
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      extraCssText: 'border-radius:12px;padding:10px 12px',
      formatter: buildTooltipFormatter(year),
    },
    legend: showLegend
      ? {
          data: legendEntries.map(({ name, color }) => ({ name, textStyle: { color } })),
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 3,
          top: 0,
        }
      : { show: false },
    grid: {
      top: showLegend ? LEGEND_GRID_TOP : NO_LEGEND_GRID_TOP,
      left: 8,
      right: 20,
      bottom: 8,
      containLabel: true,
    },
    // The y-axis drops its own `name` — each card's header already carries
    // the channel's unit-bearing title (e.g. "Speed (km/h)"), so a second
    // axis label would just repeat it a third time alongside the legend.
    // `splitLine` is off too: dense multi-driver traces over a full grid
    // read as moiré noise: a hairline axis alone is quieter.
    xAxis: {
      type: 'value',
      name: 'Distance (m)',
      nameLocation: 'middle',
      nameGap: 28,
      splitLine: { show: false },
    },
    yAxis: yAxisStyled,
    // Drag-pan + Shift+wheel zoom, inline (no visible slider). Plain wheel
    // stays page scroll on purpose — 7-8 tall charts stacked in a column
    // make unconditional wheel-capture a scroll trap. `filterMode: 'none'`
    // keeps each chart's own y range stable while panning, so 8 charts
    // synced on the same x don't rescale-jitter against each other.
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: 'shift',
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
    // Toolbox box-zoom (x-only, via `yAxisIndex: 'none'`) is the
    // click-drag-a-box gesture that matches the Streamlit/Plotly original;
    // `restore` resets it. Both actions propagate through `CROSSHAIR_GROUP`
    // (echarts.connect), so zooming one chart zooms every synced chart.
    toolbox: {
      right: 8,
      top: 0,
      feature: {
        dataZoom: { yAxisIndex: 'none', filterMode: 'none' },
        restore: {},
      },
    },
  }
}

/**
 * One ECharts line series per loaded driver, coloured by team. `points`
 * returns a driver's [distance, value] pairs — the only thing that differs
 * between a plain channel (read one array) and Delta (diff two arrays).
 * `band` fills the trace down to the axis at ~35% of the driver colour —
 * used only by the DRS state chart, where a filled band reads as "engaged"
 * more clearly than a thin stepped line does.
 */
function buildDriverSeries(
  drivers: string[],
  year: number | undefined,
  stepped: boolean | undefined,
  band: boolean | undefined,
  points: (driver: string) => Array<[number, number]>,
): LineSeriesOption[] {
  return drivers.map((driver) => ({
    name: driver,
    type: 'line',
    showSymbol: false,
    step: stepped ? 'end' : undefined,
    lineStyle: { width: 2, color: getDriverColor(driver, year) },
    itemStyle: { color: getDriverColor(driver, year) },
    areaStyle: band ? { opacity: 0.35 } : undefined,
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
  const legendEntries = loaded.map((driver) => ({
    name: driver,
    color: getDriverTextColor(driver, year),
  }))
  const series = buildDriverSeries(loaded, year, channel.stepped, channel.band, (driver) => {
    const telemetry = byDriver[driver]
    const values = channel.transform(telemetry)
    return telemetry.distance.map((distance, i): [number, number] => [distance, values[i]])
  })

  return {
    ...baseOption(
      legendEntries,
      {
        type: 'value',
        min: channel.yAxis?.min,
        max: channel.yAxis?.max,
        interval: channel.yAxis?.interval,
        axisLabel: channel.yAxis?.formatter ? { formatter: channel.yAxis.formatter } : undefined,
      },
      year,
    ),
    series,
  }
}

/**
 * ECharts wrapper shared by every telemetry chart: renders the F1-themed
 * line chart and joins the crosshair group so scrubbing one channel moves
 * the vertical guide on all the others at the same distance.
 */
function SyncedLineChart({
  option,
  ariaLabel,
  height = CHART_HEIGHT,
}: {
  option: EChartsOption
  ariaLabel: string
  height?: number
}) {
  const chartTheme = useChartTheme()
  // Inside the maximized overlay, fill the card instead of holding the fixed
  // grid height (which would leave dead space). The `key` folds in `maximized`
  // so the chart REMOUNTS at the new size — echarts-for-react only auto-resizes
  // on window resize, not on this container change, so a stale canvas would
  // mis-place the hover crosshair otherwise.
  const maximized = useContext(ChartMaximizedContext)
  // Animate the paint once, on the first render with data — a 2-3 driver
  // session's telemetry lands per driver, and `notMerge` would otherwise replay
  // the sweep on each arrival.
  const paintedOption = useFirstPaintAnimation(option)
  return (
    <div role="img" aria-label={ariaLabel} className={maximized ? 'h-full' : undefined}>
      <ReactECharts
        theme={chartTheme}
        key={`${chartTheme}-${maximized}`}
        option={paintedOption}
        style={{ height: maximized ? '100%' : height }}
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

/** Renders one telemetry channel (speed/throttle/brake/rpm/gear/accel/drs)
 *  as an ECharts line per loaded driver, x = distance in meters. DRS renders
 *  as a shorter, filled state band instead of the standard line height (see
 *  `channel.band` in channels.ts). Memoized: 7 of these mount per grid, and
 *  most re-renders (layout toggle, an unrelated driver's data settling)
 *  don't change this channel's own `byDriver`/`drivers`/`year`. */
export const ChannelChart = memo(function ChannelChart({
  title,
  byDriver,
  drivers,
  year,
  channel,
}: ChannelChartProps) {
  const option = useMemo(
    () => buildChannelOption(byDriver, drivers, year, channel),
    [byDriver, drivers, year, channel],
  )
  const chart = (
    <SyncedLineChart
      option={option}
      ariaLabel={`${title} telemetry chart`}
      height={channel.band ? BAND_CHART_HEIGHT : CHART_HEIGHT}
    />
  )
  if (!channel.band) return chart
  // The DRS band is a fixed 180px chart inside a grid-stretched card shell
  // (its row-mate is the full-height Accel line chart) — without this
  // wrapper it hugs the card's top edge instead of sitting centered in the
  // extra space the taller row-mate creates.
  return <div className="flex h-full flex-col justify-center">{chart}</div>
})

// ---- Delta: cross-driver, needs its own data prep --------------------------

const MIN_DELTA_DRIVERS = 2

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
  markLineColor: string,
): EChartsOption {
  const loaded = drivers.filter((driver) => byDriver[driver])
  const reference = findReferenceDriver(byDriver, loaded)
  if (!reference) return baseOption([], { type: 'value' }, year)

  const refTelemetry = byDriver[reference]
  const legendEntries = loaded.map((driver) => ({
    name: driver,
    color: getDriverTextColor(driver, year),
  }))
  const series = buildDriverSeries(loaded, year, false, false, (driver) => {
    const telemetry = byDriver[driver]
    return telemetry.distance.map((distance, i): [number, number] => {
      const refTime = interp(distance, refTelemetry.distance, refTelemetry.time)
      return [distance, telemetry.time[i] - refTime]
    })
  })

  // Dashed y=0 reference guide — the reference driver's own delta line hugs
  // it. ECharts attaches markLine per-series (no chart-level equivalent), so
  // it rides on the first series (mutating in place; `firstSeries` is the
  // same object as `series[0]`). markLine styles aren't governed by the
  // registered theme either (same reasoning as Gauge.tsx), so its color is
  // threaded in per active theme mode.
  const firstSeries = series[0]
  if (firstSeries) {
    firstSeries.markLine = {
      symbol: 'none',
      silent: true,
      lineStyle: { type: 'dashed', color: markLineColor },
      data: [{ yAxis: 0 }],
    }
  }

  return { ...baseOption(legendEntries, { type: 'value' }, year), series }
}

export interface DeltaChartProps {
  byDriver: Record<string, LapTelemetry>
  drivers: string[]
  year: number | undefined
  /** True while at least one selected lap is still loading (from
   *  `useLapTelemetries`). Distinguishes "still fetching the 2nd driver"
   *  from "nobody picked a 2nd driver yet" — without it, a 2-driver
   *  selection mid-fetch shows the same "needs ≥2 drivers" note as the true
   *  empty state, which reads as broken rather than in progress. */
  isLoading: boolean
}

/**
 * Time delta vs. the fastest loaded driver, interpolated onto their distance
 * grid. Needs >=2 loaded drivers to have anyone to compare against —
 * `delta_graph.py` shows an `st.info` notice in the same case, unless a 2nd+
 * driver is still loading, in which case the shared loader plays instead of
 * a note that looks like a bug.
 */
export const DeltaChart = memo(function DeltaChart({
  byDriver,
  drivers,
  year,
  isLoading,
}: DeltaChartProps) {
  const loaded = drivers.filter((driver) => byDriver[driver])
  const chartTheme = useChartTheme()
  const markLineColor = chartTheme === F1_LIGHT_THEME ? MARK_LINE_COLOR_LIGHT : MARK_LINE_COLOR_DARK
  const option = useMemo(
    () => buildDeltaOption(byDriver, drivers, year, markLineColor),
    [byDriver, drivers, year, markLineColor],
  )

  if (loaded.length < MIN_DELTA_DRIVERS) {
    if (drivers.length >= MIN_DELTA_DRIVERS && isLoading) {
      return <TelemetryLoader />
    }
    return <p className="px-2 py-12 text-center text-sm text-fg-3">Delta needs ≥2 drivers</p>
  }

  return <SyncedLineChart option={option} ariaLabel="Delta telemetry chart" />
})
