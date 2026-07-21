// Pure ECharts option builder for the `get_lap_times` chat tool. Ported from
// the Streamlit original's `build_lap_times_figure` (chart_builders.py) — one
// line per driver, invalid laps rendered as hollow dots, dashed pit markers
// inferred from compound changes (this payload carries no Stint column, so
// only the compound-change signal ever fires).

import type {
  EChartsOption,
  LineSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { getDriverColor } from '@/lib/drivers'
import { detectPitLaps, type PitEvent } from '@/lib/lapMarks'
import { compoundColor } from './compoundColor'
import { asArray, asBoolean, asNumberOrNull, asRecord, asString } from './payloadGuards'

interface LapTimeRecord {
  driver: string
  lapNumber: number
  lapTime: number | null
  isValid: boolean
  compound: string
}

function parseLapTimeRecords(data: unknown): LapTimeRecord[] | null {
  const root = asRecord(data)
  const rows = root ? asArray(root.lap_times) : null
  if (!rows) return null

  const records: LapTimeRecord[] = []
  for (const raw of rows) {
    const row = asRecord(raw)
    const lapNumber = row ? asNumberOrNull(row.lap_number) : null
    if (!row || lapNumber == null) continue
    records.push({
      driver: asString(row.driver, '?').toUpperCase(),
      lapNumber,
      lapTime: asNumberOrNull(row.lap_time),
      isValid: asBoolean(row.is_valid, true),
      compound: asString(row.compound, '').toUpperCase() || 'UNK',
    })
  }
  return records
}

function groupByDriver(records: LapTimeRecord[]): Map<string, LapTimeRecord[]> {
  const byDriver = new Map<string, LapTimeRecord[]>()
  for (const record of records) {
    const list = byDriver.get(record.driver) ?? []
    list.push(record)
    byDriver.set(record.driver, list)
  }
  for (const list of byDriver.values()) list.sort((a, b) => a.lapNumber - b.lapNumber)
  return byDriver
}

/** One line per driver. Laps FastF1 flagged unrepresentative (`is_valid:
 *  false` — an in/out lap, a red-flag lap) render as a hollow, team-bordered
 *  dot instead of a filled one, so a strategist can spot which points not to
 *  read as pace evidence. `transparent` (rather than the Streamlit original's
 *  hardcoded dark-purple background) keeps the knockout effect correct on
 *  either theme's card colour. */
function buildDriverLineSeries(driver: string, rows: LapTimeRecord[]): LineSeriesOption {
  const color = getDriverColor(driver)
  return {
    name: driver,
    type: 'line',
    showSymbol: true,
    symbolSize: 6,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    data: rows.map((row) => ({
      value: [row.lapNumber, row.lapTime] as [number, number | null],
      itemStyle: row.isValid
        ? undefined
        : { color: 'transparent', borderColor: color, borderWidth: 1.5 },
    })),
  }
}

/** Ghost series hosting one dashed vertical marker per detected pit stop,
 *  coloured by the compound fitted after the stop and labelled with the
 *  driver code so overlapping pits stay distinguishable. */
function buildPitMarkLineSeries(pitEvents: PitEvent[]): LineSeriesOption {
  return {
    name: 'pit-stops',
    type: 'line',
    data: [],
    silent: true,
    symbol: 'none',
    tooltip: { show: false },
    markLine: {
      silent: true,
      symbol: 'none',
      data: pitEvents.map((event) => ({
        xAxis: event.lap,
        lineStyle: { color: compoundColor(event.compound), width: 1, type: 'dashed' as const },
        label: {
          show: true,
          formatter: `${event.driver} - ${event.compound.slice(0, 3)}`,
          position: 'insideEndTop' as const,
          fontSize: 9,
          color: compoundColor(event.compound),
        },
      })),
    },
  }
}

function buildTooltipFormatter() {
  return (params: TooltipComponentFormatterCallbackParams): string => {
    const items = Array.isArray(params) ? params : [params]
    // `axisValue` is present at runtime on an axis-triggered tooltip's first
    // item but isn't part of the strict callback-params type — same cast
    // gapSeries.ts's own axis tooltip formatter uses.
    const lap = (items[0] as { axisValue?: number | string } | undefined)?.axisValue
    const rows = items
      .filter((item) => item.seriesName && item.seriesName !== 'pit-stops')
      .map((item) => {
        const value = Array.isArray(item.value) ? item.value : []
        const time = typeof value[1] === 'number' ? `${value[1].toFixed(3)}s` : '—'
        return `<div style="display:flex;justify-content:space-between;gap:16px;">
  <span>${item.seriesName}</span>
  <span style="font-family:'JetBrains Mono Variable',monospace">${time}</span>
</div>`
      })
    return `<div style="margin-bottom:4px;opacity:0.7">Lap ${lap ?? '—'}</div>${rows.join('')}`
  }
}

/**
 * Lap-time-vs-lap-number line chart, one trace per driver. Returns null when
 * the payload doesn't carry a usable `lap_times` array.
 */
export function buildLapTimesOption(data: unknown): EChartsOption | null {
  const records = parseLapTimeRecords(data)
  if (!records || records.length === 0) return null

  const byDriver = groupByDriver(records)
  const series: LineSeriesOption[] = []
  const pitEvents: PitEvent[] = []

  for (const [driver, rows] of byDriver) {
    series.push(buildDriverLineSeries(driver, rows))
    pitEvents.push(
      ...detectPitLaps(
        rows.map((row) => ({ lap: row.lapNumber, compound: row.compound })),
        driver,
      ),
    )
  }
  series.push(buildPitMarkLineSeries(pitEvents))

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, formatter: buildTooltipFormatter() },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    grid: { top: 40, left: 8, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap',
      nameLocation: 'middle',
      nameGap: 24,
      splitLine: { show: false },
    },
    yAxis: { type: 'value', scale: true },
    series,
  }
}
