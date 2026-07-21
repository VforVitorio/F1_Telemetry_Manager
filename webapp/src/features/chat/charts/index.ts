// Dispatcher for the 4 chart-shaped chat tools. `InlineChart` is the only
// caller — it needs one option array + one title per tool result, and
// everything upstream of that (payload validation, the actual builders) is
// this folder's private detail.

import type { EChartsOption } from 'echarts'
import { buildCompareOption, compareTitle } from './buildCompareOption'
import { buildLapTimesOption } from './buildLapTimesOption'
import { buildRaceDataOptions, RACE_DATA_TITLES } from './buildRaceDataOptions'
import { buildTelemetryOption, telemetryTitle } from './buildTelemetryOption'

const LAP_TIMES_TITLE = 'Lap times'

/**
 * Dispatches a chat tool result to its chart-option builder(s). Each of the
 * four chart-shaped tools (`get_lap_times`, `get_telemetry`,
 * `compare_drivers`, `get_race_data`) maps to one builder above; any other
 * tool name, or a builder that rejects its own payload shape, returns null so
 * `InlineChart` can fall back to its "chart unavailable" note instead of
 * rendering nothing or crashing.
 */
export function buildToolChartOptions(toolName: string, data: unknown): EChartsOption[] | null {
  switch (toolName) {
    case 'get_lap_times': {
      const option = buildLapTimesOption(data)
      return option ? [option] : null
    }
    case 'get_telemetry': {
      const option = buildTelemetryOption(data)
      return option ? [option] : null
    }
    case 'compare_drivers': {
      const option = buildCompareOption(data)
      return option ? [option] : null
    }
    case 'get_race_data':
      return buildRaceDataOptions(data)
    default:
      return null
  }
}

/**
 * Chart title(s) for the given tool, one per option `buildToolChartOptions`
 * returns for it. Static per tool except `compare_drivers` (and, once it
 * ships, `get_telemetry`'s driver/lap label), whose title names the actual
 * data in the turn rather than the tool that produced it.
 */
export function getChartTitles(toolName: string, data: unknown): string[] {
  switch (toolName) {
    case 'get_lap_times':
      return [LAP_TIMES_TITLE]
    case 'get_telemetry':
      return [telemetryTitle(data)]
    case 'compare_drivers':
      return [compareTitle(data)]
    case 'get_race_data':
      return [...RACE_DATA_TITLES]
    default:
      return []
  }
}
