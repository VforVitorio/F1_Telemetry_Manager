// Channel configs for the TELEMETRY grid (issue #34, §6.1). Six of the seven
// charts (everything but Delta) are pure "plot this array against distance"
// jobs and share the generic `ChannelChart` component — this file is that
// shared data. Delta is cross-driver (it diffs every loaded lap against a
// reference lap's interpolated time, not a single telemetry array) so it
// gets its own `DeltaChart` component in ChannelChart.tsx instead of an
// entry here; `DELTA_TITLE` is exported so its ChartCard heading still lives
// next to the other six.
//
// Streamlit parity: frontend/components/telemetry/{speed,throttle,brake,rpm,
// gear,drs}_graph.py. `transform` mirrors each module's data-prep step (only
// DRS transforms its raw values; the rest plot the FastF1 array as-is).

import type { LapTelemetry } from '@/lib/api/telemetry'

export const DELTA_TITLE = 'Delta'

export interface ChannelYAxis {
  min?: number
  max?: number
  interval?: number
  /** Custom tick label, e.g. DRS's 0/1 -> "Disabled"/"Enabled". */
  formatter?: (value: number) => string
}

export interface ChannelConfig {
  key: 'speed' | 'throttle' | 'brake' | 'rpm' | 'gear' | 'drs'
  /** ChartCard header + chart title. */
  title: string
  /** Y-axis name shown on the chart. */
  yName: string
  /** 'end' draws a stairstep line instead of interpolating between samples —
   *  gear and DRS are discrete states (gear_graph.py / drs_graph.py both use
   *  a step shape for this reason), not continuous quantities. */
  stepped?: boolean
  /** Renders as a filled state band (shorter chart, ~35%-opacity area under
   *  the line) instead of the standard telemetry line — DRS is really an
   *  on/off state, not a quantity to trace, so a band reads more like
   *  "engaged" than a thin 0/1 line does. */
  band?: boolean
  yAxis?: ChannelYAxis
  /** Extracts the plotted series from a driver's telemetry. */
  transform: (telemetry: LapTelemetry) => number[]
}

/**
 * DRS reads "open" only once actively deployed. FastF1 values 10/12/14 mean
 * on; 0-1 is off and 2-8 covers intermediate/eligible-but-not-open states.
 * Mirrors drs_graph.py's `_process_drs_data`.
 */
function binarizeDrs(telemetry: LapTelemetry): number[] {
  return telemetry.drs.map((value) => (value >= 10 ? 1 : 0))
}

const DRS_TICKS: Record<number, string> = { 0: 'Disabled', 1: 'Enabled' }

export const CHANNELS: ChannelConfig[] = [
  { key: 'speed', title: 'Speed', yName: 'Speed (km/h)', transform: (t) => t.speed },
  {
    key: 'throttle',
    title: 'Throttle',
    yName: 'Throttle (%)',
    yAxis: { min: 0, max: 100 },
    transform: (t) => t.throttle,
  },
  { key: 'brake', title: 'Brake', yName: 'Brake', transform: (t) => t.brake },
  { key: 'rpm', title: 'RPM', yName: 'RPM', transform: (t) => t.rpm },
  {
    key: 'gear',
    title: 'Gear',
    yName: 'Gear',
    stepped: true,
    // min 0 so neutral (nGear=0, seen at launch / in the pits) isn't clipped.
    yAxis: { min: 0, max: 8, interval: 1 },
    transform: (t) => t.gear,
  },
  {
    key: 'drs',
    title: 'DRS',
    yName: 'DRS',
    stepped: true,
    band: true,
    yAxis: {
      min: 0,
      max: 1,
      interval: 1,
      formatter: (value) => DRS_TICKS[value] ?? String(value),
    },
    transform: binarizeDrs,
  },
]
