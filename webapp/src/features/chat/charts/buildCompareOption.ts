// Pure ECharts option builder for the `compare_drivers` chat tool. Ported
// from the Streamlit original's `build_compare_drivers_figure`
// (chart_builders.py) — a speed overlay over a delta curve for two drivers.

import type { EChartsOption, LineSeriesOption } from 'echarts'
import { getDriverColor } from '@/lib/drivers'
import { alignDeltaX } from '@/lib/lapMarks'
import { asNumberArray, asNumberOrNull, asRecord, asString } from './payloadGuards'

interface PilotPayload {
  name: string
  color: string | null
  lapTime: number | null
  distance: number[]
  speed: number[]
}

interface ComparePayload {
  pilot1: PilotPayload
  pilot2: PilotPayload
  delta: number[]
}

const DELTA_COLOR = '#a78bfa'
const DELTA_FILL = 'rgba(167, 139, 250, 0.15)'
const ZERO_LINE_COLOR = 'rgba(148, 163, 184, 0.6)'

function parsePilot(raw: unknown, fallbackName: string): PilotPayload | null {
  const root = asRecord(raw)
  if (!root) return null
  return {
    name: asString(root.name, fallbackName),
    color: typeof root.color === 'string' && root.color !== '' ? root.color : null,
    lapTime: asNumberOrNull(root.lap_time),
    distance: asNumberArray(root.distance),
    speed: asNumberArray(root.speed),
  }
}

function parseComparePayload(data: unknown): ComparePayload | null {
  const root = asRecord(data)
  if (!root) return null
  const pilot1 = parsePilot(root.pilot1, 'Driver 1')
  const pilot2 = parsePilot(root.pilot2, 'Driver 2')
  if (!pilot1 || !pilot2) return null
  return { pilot1, pilot2, delta: asNumberArray(root.delta) }
}

function formatLapTime(lapTime: number | null): string {
  return lapTime != null ? `${lapTime.toFixed(3)}s` : '—'
}

/** "{name1} {time1} vs {name2} {time2}" header, mirroring the Python
 *  original's dynamic figure title — the one piece of this chart's context
 *  that can't be a static per-tool label, since it names the two actual
 *  drivers. Falls back to a generic label when the payload didn't parse. */
export function compareTitle(data: unknown): string {
  const payload = parseComparePayload(data)
  if (!payload) return 'Driver comparison'
  const { pilot1, pilot2 } = payload
  return `${pilot1.name} ${formatLapTime(pilot1.lapTime)} vs ${pilot2.name} ${formatLapTime(pilot2.lapTime)}`
}

/** The payload's own team colour first, `getDriverColor` only as a fallback
 *  for a missing/empty value — team colours come from the tool result, never
 *  re-derived when the backend already sent one. */
function pilotColor(pilot: PilotPayload): string {
  return pilot.color ?? getDriverColor(pilot.name)
}

function zip(xs: number[], ys: number[]): Array<[number, number]> {
  const length = Math.min(xs.length, ys.length)
  const points: Array<[number, number]> = new Array(length)
  for (let i = 0; i < length; i++) points[i] = [xs[i], ys[i]]
  return points
}

function buildSpeedSeries(pilot: PilotPayload, color: string): LineSeriesOption {
  return {
    name: pilot.name,
    type: 'line',
    xAxisIndex: 0,
    yAxisIndex: 0,
    showSymbol: false,
    lineStyle: { color, width: 1.8 },
    itemStyle: { color },
    data: zip(pilot.distance, pilot.speed),
  }
}

function buildDeltaSeries(deltaX: number[], delta: number[], name: string): LineSeriesOption {
  return {
    name,
    type: 'line',
    xAxisIndex: 1,
    yAxisIndex: 1,
    showSymbol: false,
    lineStyle: { color: DELTA_COLOR, width: 1.6 },
    itemStyle: { color: DELTA_COLOR },
    areaStyle: { color: DELTA_FILL, origin: 0 },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: ZERO_LINE_COLOR, type: 'dashed' },
      data: [{ yAxis: 0 }],
    },
    data: zip(deltaX, delta),
  }
}

/**
 * Speed overlay (top) + delta curve (bottom) for a two-driver comparison.
 * The delta trace keeps the Python original's single violet fill rather than
 * the fuller Comparison replay's winner-oriented two-tone treatment: this
 * payload ships one ready-made `delta` array (pilot1 minus pilot2) with no
 * "who is faster" signal to orient a two-tone fill around, so a neutral
 * single-colour fill is the honest rendering of what the tool actually
 * returned. Returns null when either pilot is missing from the payload.
 */
export function buildCompareOption(data: unknown): EChartsOption | null {
  const payload = parseComparePayload(data)
  if (!payload) return null
  const { pilot1, pilot2, delta } = payload

  const color1 = pilotColor(pilot1)
  const color2 = pilotColor(pilot2)
  const deltaX = alignDeltaX(pilot1.distance.length > 0 ? pilot1.distance : undefined, delta.length)

  return {
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (raw) => (typeof raw === 'number' ? raw.toFixed(3) : String(raw ?? '')),
    },
    legend: { top: 0, data: [pilot1.name, pilot2.name], textStyle: { fontSize: 10 } },
    grid: [
      { top: '10%', height: '46%', left: 8, right: 16, containLabel: true },
      { top: '66%', height: '28%', left: 8, right: 16, containLabel: true },
    ],
    xAxis: [
      { gridIndex: 0, type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
      {
        gridIndex: 1,
        type: 'value',
        name: 'Distance (m)',
        nameLocation: 'middle',
        nameGap: 24,
        splitLine: { show: false },
      },
    ],
    yAxis: [
      { gridIndex: 0, type: 'value', name: 'km/h', scale: true, nameTextStyle: { fontSize: 10 } },
      {
        gridIndex: 1,
        type: 'value',
        name: `${pilot1.name} − ${pilot2.name} (s)`,
        nameTextStyle: { fontSize: 9 },
        scale: true,
      },
    ],
    series: [
      buildSpeedSeries(pilot1, color1),
      buildSpeedSeries(pilot2, color2),
      buildDeltaSeries(deltaX, delta, `${pilot1.name} − ${pilot2.name}`),
    ],
  }
}
