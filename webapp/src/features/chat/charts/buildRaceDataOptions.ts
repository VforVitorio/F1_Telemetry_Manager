// Pure ECharts option builder for the `get_race_data` chat tool. Ported from
// the Streamlit original's `build_race_data_figure` (chart_builders.py) —
// TWO independent charts (positions, lap times with pit laps masked) rather
// than one stacked pair, so the lap-time panel doesn't get cramped once 10+
// drivers share a legend.

import type { EChartsOption, LineSeriesOption } from 'echarts'
import { getDriverColor } from '@/lib/drivers'
import { detectPitLaps, maskPitLapOutliers, type PitEvent } from '@/lib/lapMarks'
import { compoundColor } from './compoundColor'
import { asArray, asNumberOrNull, asRecord, asString } from './payloadGuards'

interface RaceDataRow {
  driver: string
  lapNumber: number
  position: number | null
  lapTime: number | null
  compound: string
  /** Raw stint index, kept nullable — `detectPitLaps` treats a missing stint
   *  as "fall back to the compound-change signal", so this must not be
   *  coerced to 0 before reaching it. */
  stint: number | null
}

export const RACE_DATA_TITLES = ['Race positions', 'Lap times (pit laps masked)'] as const

function parseRaceDataRows(data: unknown): RaceDataRow[] | null {
  const root = asRecord(data)
  const rows = root ? asArray(root.race_data) : null
  if (!rows) return null

  const records: RaceDataRow[] = []
  for (const raw of rows) {
    const row = asRecord(raw)
    const lapNumber = row ? asNumberOrNull(row.LapNumber) : null
    if (!row || lapNumber == null) continue
    records.push({
      driver: asString(row.Driver, '?').toUpperCase(),
      lapNumber,
      position: asNumberOrNull(row.Position),
      lapTime: asNumberOrNull(row.LapTime_s),
      compound: asString(row.Compound, '').toUpperCase() || 'UNK',
      stint: asNumberOrNull(row.Stint),
    })
  }
  return records
}

function groupByDriver(rows: RaceDataRow[]): Map<string, RaceDataRow[]> {
  const byDriver = new Map<string, RaceDataRow[]>()
  for (const row of rows) {
    const list = byDriver.get(row.driver) ?? []
    list.push(row)
    byDriver.set(row.driver, list)
  }
  for (const list of byDriver.values()) list.sort((a, b) => a.lapNumber - b.lapNumber)
  return byDriver
}

/** Ghost series hosting one dashed vertical marker per detected pit stop,
 *  coloured by the compound fitted after the stop — shared shape between the
 *  positions and lap-times charts so both draw the exact same pit lines. */
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

function buildPositionsOption(
  byDriver: Map<string, RaceDataRow[]>,
  pitEvents: PitEvent[],
): EChartsOption {
  const series: LineSeriesOption[] = [...byDriver.entries()].map(([driver, rows]) => {
    const color = getDriverColor(driver)
    return {
      name: driver,
      type: 'line',
      showSymbol: true,
      symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      data: rows.map((row): [number, number | null] => [row.lapNumber, row.position]),
    }
  })
  series.push(buildPitMarkLineSeries(pitEvents))

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    grid: { top: 40, left: 8, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Lap',
      nameLocation: 'middle',
      nameGap: 24,
      splitLine: { show: false },
    },
    yAxis: { type: 'value', name: 'Position', inverse: true, nameTextStyle: { fontSize: 10 } },
    series,
  }
}

function buildMaskedLapTimesOption(
  byDriver: Map<string, RaceDataRow[]>,
  pitEvents: PitEvent[],
): EChartsOption {
  const series: LineSeriesOption[] = [...byDriver.entries()].map(([driver, rows]) => {
    const color = getDriverColor(driver)
    const masked = maskPitLapOutliers(rows.map((row) => row.lapTime))
    return {
      name: driver,
      type: 'line',
      showSymbol: true,
      symbolSize: 4,
      lineStyle: { color, width: 1.6 },
      itemStyle: { color },
      data: rows.map((row, i): [number, number | null | undefined] => [row.lapNumber, masked[i]]),
    }
  })
  series.push(buildPitMarkLineSeries(pitEvents))

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (raw) => (typeof raw === 'number' ? `${raw.toFixed(3)}s` : String(raw ?? '')),
    },
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

/**
 * Two independent charts — race positions and lap times with pit-lap
 * outliers masked to a gap — for the full field or whichever drivers the
 * tool scoped its payload to. Returns null when the payload doesn't carry a
 * usable `race_data` array.
 */
export function buildRaceDataOptions(data: unknown): EChartsOption[] | null {
  const rows = parseRaceDataRows(data)
  if (!rows || rows.length === 0) return null

  const byDriver = groupByDriver(rows)
  const pitEvents: PitEvent[] = []
  for (const [driver, driverRows] of byDriver) {
    pitEvents.push(
      ...detectPitLaps(
        driverRows.map((row) => ({ lap: row.lapNumber, stint: row.stint, compound: row.compound })),
        driver,
      ),
    )
  }

  return [buildPositionsOption(byDriver, pitEvents), buildMaskedLapTimesOption(byDriver, pitEvents)]
}
