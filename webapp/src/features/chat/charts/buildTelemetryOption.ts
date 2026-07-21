// Pure ECharts option builder for the `get_telemetry` chat tool. Ported from
// the Streamlit original's `build_telemetry_figure` (chart_builders.py) — a
// 3-panel stack (speed / throttle / brake) over one lap's distance, one
// driver at a time. Speed keeps the driver's team colour; throttle/brake use
// the fixed green/red convention cockpit telemetry displays use everywhere,
// same as the Python original. The distance-axis km-compaction below mirrors
// the dashboard telemetry grid's own axis formatter (channels.ts / dashboard
// ChannelChart.tsx), so a chat telemetry chart reads the same as the
// full-page one.

import type {
  EChartsOption,
  LineSeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from 'echarts'
import { getDriverColor } from '@/lib/drivers'
import { asNumberArray, asNumberOrNull, asRecord, asString } from './payloadGuards'

interface TelemetryPayload {
  driver: string
  lapNumber: number | null
  distance: number[]
  speed: number[]
  throttle: number[]
  brake: number[]
}

const THROTTLE_COLOR = '#10b981'
const BRAKE_COLOR = '#ef4444'
const THROTTLE_FILL = 'rgba(16, 185, 129, 0.2)'
const BRAKE_FILL = 'rgba(239, 68, 68, 0.25)'
const PANEL_COUNT = 3
const PANEL_HEIGHT_PCT = 24
const PANEL_TOP_START_PCT = 6
const PANEL_GAP_PCT = 34

function parseTelemetryPayload(data: unknown): TelemetryPayload | null {
  const root = asRecord(data)
  if (!root) return null
  const distance = asNumberArray(root.distance)
  if (distance.length === 0) return null
  return {
    driver: asString(root.driver, '?').toUpperCase(),
    lapNumber: asNumberOrNull(root.lap_number),
    distance,
    speed: asNumberArray(root.speed),
    throttle: asNumberArray(root.throttle),
    brake: asNumberArray(root.brake),
  }
}

/** "VER - lap 34 telemetry", or a generic fallback when the payload didn't
 *  parse — the dynamic per-turn label InlineChart shows as the chart's title,
 *  mirroring the Python original's in-figure title. */
export function telemetryTitle(data: unknown): string {
  const payload = parseTelemetryPayload(data)
  if (!payload) return 'Telemetry'
  const lap = payload.lapNumber != null ? payload.lapNumber : '?'
  return `${payload.driver} - lap ${lap} telemetry`
}

/** Compacts large metre values to "1.2k" — same formatter the Comparison
 *  replay's channel panes use, so a chat telemetry chart's axis reads the
 *  same as the rest of the app once distances run into the thousands. */
function distanceAxisLabel(value: string | number): string {
  const n = Number(value)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

function zip(distance: number[], values: number[]): Array<[number, number]> {
  const length = Math.min(distance.length, values.length)
  const points: Array<[number, number]> = new Array(length)
  for (let i = 0; i < length; i++) points[i] = [distance[i], values[i]]
  return points
}

interface Panel {
  name: string
  values: number[]
  color: string
  fill?: string
}

function buildGrids(): NonNullable<EChartsOption['grid']> {
  return Array.from({ length: PANEL_COUNT }, (_, i) => ({
    top: `${PANEL_TOP_START_PCT + i * PANEL_GAP_PCT}%`,
    height: `${PANEL_HEIGHT_PCT}%`,
    left: 8,
    right: 16,
    containLabel: true,
  }))
}

function buildXAxes(): XAXisComponentOption[] {
  const lastIndex = PANEL_COUNT - 1
  return Array.from({ length: PANEL_COUNT }, (_, i) => ({
    gridIndex: i,
    type: 'value',
    splitLine: { show: false },
    axisLabel: i === lastIndex ? { formatter: distanceAxisLabel, fontSize: 10 } : { show: false },
    axisTick: i === lastIndex ? undefined : { show: false },
    name: i === lastIndex ? 'Distance (m)' : undefined,
    nameLocation: 'middle',
    nameGap: 24,
  }))
}

function buildYAxes(panels: Panel[]): YAXisComponentOption[] {
  return panels.map((panel, i) => ({
    gridIndex: i,
    type: 'value',
    scale: true,
    name: panel.name,
    nameTextStyle: { fontSize: 10 },
    axisLabel: { fontSize: 10 },
  }))
}

function buildPanelSeries(panels: Panel[], distance: number[]): LineSeriesOption[] {
  return panels.map((panel, i) => ({
    name: panel.name,
    type: 'line',
    gridIndex: i,
    xAxisIndex: i,
    yAxisIndex: i,
    showSymbol: false,
    lineStyle: { color: panel.color, width: 1.8 },
    itemStyle: { color: panel.color },
    areaStyle: panel.fill ? { color: panel.fill } : undefined,
    data: zip(distance, panel.values),
  }))
}

/**
 * 3-panel telemetry stack (speed / throttle / brake) vs distance for one
 * driver's lap. Returns null when the payload doesn't carry a usable
 * `distance` array.
 */
export function buildTelemetryOption(data: unknown): EChartsOption | null {
  const payload = parseTelemetryPayload(data)
  if (!payload) return null

  const panels: Panel[] = [
    { name: 'Speed (km/h)', values: payload.speed, color: getDriverColor(payload.driver) },
    { name: 'Throttle (%)', values: payload.throttle, color: THROTTLE_COLOR, fill: THROTTLE_FILL },
    { name: 'Brake (%)', values: payload.brake, color: BRAKE_COLOR, fill: BRAKE_FILL },
  ]

  return {
    // Links the vertical crosshair across all 3 stacked grids, mirroring the
    // Python original's `shared_xaxes` subplot hover behaviour.
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (raw) => (typeof raw === 'number' ? raw.toFixed(1) : String(raw ?? '')),
    },
    grid: buildGrids(),
    xAxis: buildXAxes(),
    yAxis: buildYAxes(panels),
    series: buildPanelSeries(panels, payload.distance),
  }
}
