// Lap-time line chart (ECharts). Streamlit parity:
// `frontend/components/dashboard/lap_graph.py::render_lap_graph`.
//
// One line+marker series PER DRIVER, coloured by TEAM colour (never by
// compound — compound is tooltip-only information). Clicking a point loads
// that lap's telemetry via `onLapClick`, which the section wires to the
// dashboard store's `setLap` (click-to-load; this component never fetches
// telemetry itself).
//
// Click picking runs on zrender directly (`bindNearestPointClick`), not
// ECharts' `onEvents.click` — the plotted symbols are a de-cluttered 5px dot
// (see `buildDriverSeries`), too small a hit target on a ~80-lap race. The
// picker instead accepts any click within a 20px radius of the nearest
// plotted point (round-2 fix, see `docs/migration/design-specs/dashboard-round2.md#1`).

import { useCallback, useContext, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { ECharts, EChartsOption } from 'echarts'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { buildEchartsTheme, F1_LIGHT_THEME, tireColors } from '@/charts/echartsTheme'
import { ChartMaximizedContext } from '@/components/ChartCard'
import type { LapTime } from '@/lib/api/telemetry'
import { getDriverColor, getDriverTextColor } from '../lib/drivers'
import { compoundLabel, compoundVariant } from '../lib/compounds'
import { formatLapTime, formatLapTimeAxis } from '../lib/lapTime'

// Register the token theme at module load, before any chart's init runs
// (mirrors charts/Gauge.tsx — echarts-for-react inits with the `theme` prop
// in componentDidMount, which can fire before an effect-time registration).
registerF1Theme()

/** Axis NAME style ("Lap Number", "Lap Time"), reusing the mode-aware theme's
 *  axis-label color/font so the names read consistently with the tick labels
 *  in both light and dark, without duplicating the theme's color values here. */
function buildAxisNameStyle(mode: 'dark' | 'light') {
  const theme = buildEchartsTheme(mode)
  return {
    color: theme.valueAxis.axisLabel.color,
    fontFamily: theme.valueAxis.axisLabel.fontFamily,
  }
}

/** One plotted point: `[lapNumber, lapTime]`, with `compound` carried
 *  alongside so the tooltip can show tyre info without a second lookup.
 *  `symbolSize`/`itemStyle` are per-point overrides — only set on the
 *  driver's currently-selected lap, to draw it as a visible ring (see
 *  `SELECTED_LAP_SYMBOL_SIZE`). ECharts merges a per-data `itemStyle` on top
 *  of the series-level one, so the ring keeps the driver's fill colour and
 *  only adds the border. */
interface LapPoint {
  value: [number, number]
  compound: string
  symbolSize?: number
  itemStyle?: { borderColor: string; borderWidth: number }
}

// Selected-lap ring: bigger symbol + white border, independent of the driver
// colour underneath — a white ring reads on every team colour on the dark UI.
const SELECTED_LAP_SYMBOL_SIZE = 11
const SELECTED_LAP_RING_STYLE = { borderColor: '#fff', borderWidth: 2 }

// Nearest-point click picking (item 1) — see the module docblock.
const NEAREST_POINT_RADIUS_PX = 20
// A real drag (pan/box-zoom, item 5) must not also register as a lap pick.
const DRAG_CLICK_GUARD_PX = 4

/** A single driver's series — kept as our own shape (not `echarts`'
 *  `LineSeriesOption`) so the extra `compound` field on each point never
 *  gets excess-property-checked against the library's stricter data type;
 *  it is still structurally assignable into `EChartsOption.series`. */
interface DriverSeriesOption {
  name: string
  type: 'line'
  symbolSize: number
  lineStyle: { color: string; width: number }
  itemStyle: { color: string }
  emphasis: { scale: number }
  data: LapPoint[]
}

/** One legend entry, team-coloured via `textStyle` — a bare string legend
 *  entry shares ONE colour for every driver, so each entry needs its own
 *  `DataItem` object instead (icon/size stay on the shared `legend` option). */
interface LegendEntry {
  name: string
  textStyle: { color: string }
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

/** One lap turned into a plotted point; the driver's currently-selected lap
 *  (loaded telemetry) gets the ring override so it's visible on the chart
 *  itself, not just in the footer caption below. */
function buildLapPoint(lap: LapTime, selectedLap: number | undefined): LapPoint {
  const isSelected = lap.lap_number === selectedLap
  return {
    value: [lap.lap_number, lap.lap_time],
    compound: lap.compound,
    ...(isSelected
      ? { symbolSize: SELECTED_LAP_SYMBOL_SIZE, itemStyle: SELECTED_LAP_RING_STYLE }
      : {}),
  }
}

/** Build one driver's line+marker series, coloured by TEAM colour. Markers
 *  stay small (`symbolSize: 5`) and the line thin (`width: 1.5`) so a dense
 *  multi-driver plot doesn't bead into a wall of dots; `emphasis.scale` grows
 *  the hovered point back up so it's still an obvious click target. The hit
 *  target for clicking, though, is decoupled from this visual size — see
 *  `findNearestPoint`. */
function buildDriverSeries(
  driver: string,
  laps: LapTime[],
  color: string,
  selectedLap: number | undefined,
): DriverSeriesOption {
  return {
    name: driver,
    type: 'line',
    symbolSize: 5,
    lineStyle: { color, width: 1.5 },
    itemStyle: { color },
    emphasis: { scale: 1.6 },
    data: laps.map((lap) => buildLapPoint(lap, selectedLap)),
  }
}

/** Legend entries, each carrying its own driver-team text colour (the shared
 *  `legend.icon`/`itemWidth`/`itemHeight` options keep every swatch the same
 *  shape/size — only the colour differs per driver). */
function buildLegendData(
  seriesList: DriverSeriesOption[],
  year: number | undefined,
): LegendEntry[] {
  return seriesList.map((series) => ({
    name: series.name,
    textStyle: { color: getDriverTextColor(series.name, year) },
  }))
}

/** 8px rounded compound-colour swatch for the tooltip, replacing the old emoji
 *  marker. An unknown compound gets a neutral grey — NOT the medium yellow,
 *  which would falsely read as a real tyre. */
function compoundDotHtml(compound: string): string {
  const variant = compoundVariant(compound)
  const hex = variant ? tireColors[variant] : '#6b7280'
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${hex};margin-right:4px;"></span>`
}

/** Tooltip HTML: team-coloured driver name — Lap N — M:SS.mmm — compound dot + label. */
function formatLapTooltip(year: number | undefined) {
  return (raw: unknown): string => {
    if (!raw || typeof raw !== 'object') return ''
    const { seriesName, data } = raw as { seriesName?: string; data?: unknown }
    if (!isLapPoint(data)) return ''
    const [lapNumber, lapTime] = data.value
    const driverName = seriesName ?? ''
    const driverHtml = seriesName
      ? `<b style="color:${getDriverTextColor(seriesName, year)}">${driverName}</b>`
      : `<b>${driverName}</b>`
    return `${driverHtml} — Lap ${lapNumber} — ${formatLapTime(lapTime)} — ${compoundDotHtml(data.compound)}${compoundLabel(data.compound)}`
  }
}

/** Build the full chart option from the per-driver series list. */
function buildLapChartOption(
  seriesList: DriverSeriesOption[],
  year: number | undefined,
  axisNameStyle: { color: string; fontFamily: string },
): EChartsOption {
  return {
    // Entrance paint animation on (ECharts default). The old double-paint was
    // React StrictMode double-mounting in dev, not the animation — dropped in
    // main.tsx, so the line-draw now plays exactly once.
    tooltip: { trigger: 'item', formatter: formatLapTooltip(year) },
    legend: {
      data: buildLegendData(seriesList, year),
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 3,
      top: 0,
    },
    grid: { top: 44, left: 56, right: 24, bottom: 44, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap Number',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: axisNameStyle,
      scale: true,
    },
    yAxis: {
      type: 'value',
      name: 'Lap Time',
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: axisNameStyle,
      axisLabel: { formatter: formatLapTimeAxis },
      // Autorange around the lap times (~78-95 s) instead of forcing a 0:00
      // baseline, which would squash every line into the top of the plot.
      scale: true,
    },
    series: seriesList,
    // Drag-to-zoom (item 5): inside = click-drag pan + Shift+wheel zoom;
    // plain wheel stays page scroll. `filterMode: 'none'` keeps zoom/pan from
    // rescaling the y-axis. `x = lap number` here (unlike the telemetry
    // charts' `x = distance`), so this chart is NOT joined to their
    // `echarts.connect` crosshair group — its zoom stays independent.
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
    // Toolbox box-zoom (Plotly-style, x-only via `yAxisIndex: 'none'`) + a
    // reset button — the discoverable alternative to the shift-drag gesture.
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

/** One driver's plotted points, exactly as handed to its ECharts series —
 *  `seriesIndex` in the picker below is this array's index, since it's built
 *  in lockstep with `option.series`. */
interface PickerSeries {
  driver: string
  points: LapPoint[]
}

/** What the zrender click handler reads on every click: the currently
 *  plotted series (post-filter, so a filtered-out lap can't be picked) and
 *  the latest `onLapClick` callback. Mirrored into a ref (see `LapChart`)
 *  because the handler itself is bound once, in `onChartReady`. */
interface PickerRefValue {
  series: PickerSeries[]
  onLapClick: (driver: string, lapNumber: number) => void
}

/** Minimal shape read off zrender's raw pointer events — the real event
 *  (`ElementEvent`) carries plenty more, this is all the picker needs. */
interface ZrPointerEvent {
  offsetX: number
  offsetY: number
}

/** One plotted point, resolved to its on-screen pixel position. */
interface PixelPoint {
  driver: string
  lapNumber: number
  px: number
  py: number
}

/** Every plotted point across all series, converted once to pixel space via
 *  `convertToPixel` — cheap even for a full ~80-lap x 3-driver grid (max
 *  ~240 points per click). */
function toPixelPoints(chart: ECharts, series: PickerSeries[]): PixelPoint[] {
  const pixelPoints: PixelPoint[] = []
  series.forEach((driverSeries, seriesIndex) => {
    for (const point of driverSeries.points) {
      const [px, py] = chart.convertToPixel({ seriesIndex }, point.value)
      pixelPoints.push({ driver: driverSeries.driver, lapNumber: point.value[0], px, py })
    }
  })
  return pixelPoints
}

function squaredPixelDistance(point: PixelPoint, clickX: number, clickY: number): number {
  return (point.px - clickX) ** 2 + (point.py - clickY) ** 2
}

/** Nearest plotted point to a click, in PIXEL space (not data space) — pixel
 *  distance is what a viewer actually judges as "the closest dot", which can
 *  differ from data-space nearest when the y-axis spans wildly different lap
 *  times (e.g. a rain-affected race). Returns null when nothing plotted is
 *  within `NEAREST_POINT_RADIUS_PX`, so legend/axis-adjacent clicks stay
 *  inert instead of snapping to a far-away point. */
function findNearestPoint(
  chart: ECharts,
  series: PickerSeries[],
  clickX: number,
  clickY: number,
): { driver: string; lapNumber: number } | null {
  let nearest: PixelPoint | null = null
  let nearestDistanceSq = Infinity

  for (const point of toPixelPoints(chart, series)) {
    const distanceSq = squaredPixelDistance(point, clickX, clickY)
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq
      nearest = point
    }
  }

  if (!nearest || nearestDistanceSq > NEAREST_POINT_RADIUS_PX ** 2) return null
  return { driver: nearest.driver, lapNumber: nearest.lapNumber }
}

/** Registers the nearest-point click picker directly on zrender, once per
 *  chart instance (called from `onChartReady`, which — unlike `onEvents` —
 *  only fires on mount, so this never double-binds across the option
 *  rebuilds `notMerge` triggers on every data change).
 *
 *  Three guards, in order: (1) a real mousedown→click drag (pan or the
 *  toolbox box-zoom, item 5) is ignored via the pixel-delta check, so
 *  dragging never fires a phantom lap pick; (2) `containPixel` rejects
 *  clicks outside the plot area (legend, axis, toolbox icons); (3)
 *  `findNearestPoint`'s radius rejects clicks too far from any plotted dot. */
function bindNearestPointClick(chart: ECharts, pickerRef: { current: PickerRefValue }): void {
  const zr = chart.getZr()
  let downPoint: { x: number; y: number } | null = null

  zr.on('mousedown', (e: ZrPointerEvent) => {
    downPoint = { x: e.offsetX, y: e.offsetY }
  })

  zr.on('click', (e: ZrPointerEvent) => {
    const dragged =
      downPoint != null &&
      Math.hypot(e.offsetX - downPoint.x, e.offsetY - downPoint.y) >= DRAG_CLICK_GUARD_PX
    downPoint = null
    if (dragged) return
    if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return

    const { series, onLapClick } = pickerRef.current
    const nearest = findNearestPoint(chart, series, e.offsetX, e.offsetY)
    if (nearest) onLapClick(nearest.driver, nearest.lapNumber)
  })
}

export interface LapChartProps {
  /** Laps already passed through `applyLapFilters` (the visible set). */
  laps: LapTime[]
  /** Selection order — controls series/legend order (Streamlit parity). */
  drivers: string[]
  year: number | undefined
  onLapClick: (driver: string, lapNumber: number) => void
  /** driver code -> the lap number whose telemetry is currently loaded, so
   *  that lap's point can be drawn as a visible ring on the chart. */
  selectedLaps: Record<string, number>
}

/** Lap-time chart: one coloured-by-driver line per selected driver, with
 *  click-to-load (nearest-point picking) and a compound-aware tooltip. */
export function LapChart({ laps, drivers, year, onLapClick, selectedLaps }: LapChartProps) {
  const chartTheme = useChartTheme()
  // Fill the maximized overlay instead of the fixed 400px grid height, and fold
  // `maximized` into the chart key so it remounts at the new size (keeps the
  // nearest-point click picking + hover aligned — see ChartCard's context).
  const maximized = useContext(ChartMaximizedContext)
  const { option, pickerSeries } = useMemo(() => {
    const byDriver = groupByDriver(laps)
    const seriesList = drivers
      .filter((driver) => byDriver.has(driver))
      .map((driver) =>
        buildDriverSeries(
          driver,
          byDriver.get(driver) ?? [],
          getDriverColor(driver, year),
          selectedLaps[driver],
        ),
      )
    const mode = chartTheme === F1_LIGHT_THEME ? 'light' : 'dark'
    return {
      option: buildLapChartOption(seriesList, year, buildAxisNameStyle(mode)),
      pickerSeries: seriesList.map((series) => ({ driver: series.name, points: series.data })),
    }
  }, [laps, drivers, year, selectedLaps, chartTheme])

  // Latest-ref mirror: the zrender click handler is registered once (see
  // `handleChartReady` below) and reads through this ref on every click, so
  // it always sees the current laps/onLapClick without re-binding.
  const pickerRef = useRef<PickerRefValue>({ series: pickerSeries, onLapClick })
  pickerRef.current = { series: pickerSeries, onLapClick }

  const handleChartReady = useCallback((chart: ECharts) => {
    bindNearestPointClick(chart, pickerRef)
  }, [])

  return (
    <div
      role="img"
      aria-label="Lap times by lap, per driver"
      className={maximized ? 'h-full' : undefined}
    >
      <ReactECharts
        theme={chartTheme}
        key={`${chartTheme}-${maximized}`}
        option={option}
        style={{ height: maximized ? '100%' : 400 }}
        notMerge
        onChartReady={handleChartReady}
      />
    </div>
  )
}
