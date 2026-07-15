// Channel configs for the TELEMETRY grid (issue #34, §6.1). Seven of the
// eight charts (everything but Delta) are pure "plot this array against
// distance" jobs and share the generic `ChannelChart` component — this file
// is that shared data. Delta is cross-driver (it diffs every loaded lap
// against a reference lap's interpolated time, not a single telemetry
// array) so it gets its own `DeltaChart` component in ChannelChart.tsx
// instead of an entry here; `DELTA_TITLE` is exported so its ChartCard
// heading still lives next to the other seven.
//
// Streamlit parity: frontend/components/telemetry/{speed,throttle,brake,rpm,
// gear,drs}_graph.py. `transform` mirrors each module's data-prep step (only
// DRS transforms its raw values; the rest plot the FastF1 array as-is).
// `accel` (round 2, issue #34 follow-up) has no Streamlit precedent — it's
// derived client-side from `speed`/`time`, added to fill the grid's lonely
// last-row DRS slot with a real race-engineering channel instead of dead
// space.

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
  key: 'speed' | 'throttle' | 'brake' | 'rpm' | 'gear' | 'accel' | 'drs'
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

const GRAVITY_MS2 = 9.81
const KMH_PER_MS = 3.6

/**
 * Longitudinal acceleration in g, derived from the `speed`/`time` arrays
 * already present on every `lap-telemetry` response — no new backend field.
 * Central difference over the interior samples (`a[i] = ((v[i+1]-v[i-1]) /
 * 3.6) / (t[i+1]-t[i-1]) / 9.81`, km/h -> m/s -> g), one-sided at the two
 * endpoints (nothing to average with past the edge), then a 3-point moving
 * average (`movingAverage3`) to tame FastF1's ~4-5 Hz sampling noise:
 * differentiating a sampled-and-quantized speed signal amplifies its own
 * noise, so the raw central difference would jitter point-to-point instead
 * of tracing the clean braking/traction zones this channel exists to show.
 *
 * A repeated timestamp (`dt === 0`, seen in FastF1's telemetry
 * interpolation) would otherwise divide by zero; that sample instead
 * carries the previous point's value forward so the trace stays finite
 * (no NaN/Infinity) rather than poisoning the whole line.
 */
export function longitudinalAccelG(telemetry: LapTelemetry): number[] {
  const { speed, time } = telemetry
  const sampleCount = speed.length
  if (sampleCount === 0) return []

  const raw: number[] = new Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const lo = i === 0 ? 0 : i - 1
    const hi = i === sampleCount - 1 ? sampleCount - 1 : i + 1
    const dt = time[hi] - time[lo]
    if (dt === 0) {
      raw[i] = i === 0 ? 0 : raw[i - 1]
      continue
    }
    const deltaSpeedMs = (speed[hi] - speed[lo]) / KMH_PER_MS
    raw[i] = deltaSpeedMs / dt / GRAVITY_MS2
  }

  return movingAverage3(raw)
}

/**
 * Boundary-aware 3-point moving average: a 2-point average at the two
 * endpoints (no data past the edge to average with), a 3-point average
 * everywhere else. Used to smooth `longitudinalAccelG`'s central-difference
 * noise without losing the endpoint samples.
 */
function movingAverage3(values: number[]): number[] {
  const n = values.length
  return values.map((_, i) => {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(n - 1, i + 1)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += values[j]
    return sum / (hi - lo + 1)
  })
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
    key: 'accel',
    title: 'Longitudinal Accel',
    yName: 'Long. Accel (g)',
    // No explicit yAxis: `scale: true` (baseOption's default) autoranges
    // around the data, same as Speed/RPM/Delta.
    transform: longitudinalAccelG,
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
