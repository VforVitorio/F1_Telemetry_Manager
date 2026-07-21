// Pure derivations the chat charts need that the tool payloads themselves do
// not carry: where a pit stop happened, which lap times are pit-lap outliers
// that would otherwise wreck a chart's y-axis, and how to align a ready-made
// delta series onto a reference distance array of possibly different length.
// Ported 1:1 from the Streamlit original's chart_builders.py
// (`_detect_pit_laps`, `_mask_pit_lap_outliers`, the `delta_x` slicing in
// `build_compare_drivers_figure`) so a chat chart never silently drifts from
// what the equivalent Streamlit chart already draws — see lapMarks.test.ts
// for fixtures pinning the exact edge cases the Python original handles.

/** One driver-lap row as `detectPitLaps` needs it — already normalised by the
 *  caller from whichever payload shape it read (`lap_number`/`compound` for
 *  lap-times, `LapNumber`/`Stint`/`Compound` for race-data), so this module
 *  stays payload-agnostic. */
export interface PitLapInput {
  lap: number | null | undefined
  /** Stint index, when the payload carries one. `null`/`undefined` triggers
   *  the compound-change fallback signal below. */
  stint?: number | null
  /** Tyre compound label, any case — normalised to uppercase internally. */
  compound?: string | null
}

/** One detected pit stop: the first lap of the new stint, the compound fitted
 *  for it, and the driver code the caller passed in (carried through so a
 *  chart combining several drivers' events can still tell them apart). */
export interface PitEvent {
  lap: number
  compound: string
  driver: string
}

/**
 * Walk a driver's laps (already sorted by lap ascending) and return the laps
 * where a pit stop happened, using two signals in order of reliability:
 *
 * 1. The `stint` field incrementing — race-data payloads carry it and it
 *    ticks up once per stop regardless of compound choice.
 * 2. A `compound` change between consecutive laps — the fallback for
 *    lap-times payloads that carry no stint, where a compound switch is the
 *    only observable pit-stop boundary.
 *
 * A row whose `lap` is missing is skipped entirely, including for the
 * purpose of updating the running "previous stint/compound" state — the
 * Python original's `continue` has the same effect, so a gap in the data
 * cannot itself manufacture a spurious pit event once real rows resume.
 */
export function detectPitLaps(rows: PitLapInput[], driver = ''): PitEvent[] {
  const events: PitEvent[] = []
  let prevStint: number | null = null
  let prevCompound = ''

  for (const row of rows) {
    if (row.lap == null) continue
    const stint = row.stint ?? null
    const compound = (row.compound ?? '').toUpperCase()

    const stintIncremented = stint !== null && prevStint !== null && stint > prevStint
    const compoundChangedNoStint =
      stint === null && prevCompound !== '' && compound !== '' && compound !== prevCompound

    if ((stintIncremented || compoundChangedNoStint) && compound !== '') {
      events.push({ lap: row.lap, compound, driver })
    }

    if (stint !== null) prevStint = stint
    if (compound !== '') prevCompound = compound
  }

  return events
}

const DEFAULT_OUTLIER_RATIO = 1.15
const MIN_SAMPLES_TO_MASK = 3

/** Middle value of a numeric array (average of the two middle values on an
 *  even-length array), matching Python's `statistics.median`. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Replace pit-lap spikes with `null` so a chart draws a gap instead of
 * squashing every racing lap into a sliver near the x-axis. A pit lap runs
 * ~20s slower than a racing lap; any lap exceeding the driver's own median by
 * more than `thresholdRatio` is treated as non-racing and masked. Below
 * `MIN_SAMPLES_TO_MASK` valid samples the median itself would be unreliable,
 * so the input is returned unchanged.
 */
export function maskPitLapOutliers(
  lapTimes: Array<number | null | undefined>,
  thresholdRatio = DEFAULT_OUTLIER_RATIO,
): Array<number | null | undefined> {
  const valid = lapTimes.filter((t): t is number => typeof t === 'number')
  if (valid.length < MIN_SAMPLES_TO_MASK) return lapTimes

  const cutoff = median(valid) * thresholdRatio
  return lapTimes.map((t) => (typeof t === 'number' && t > cutoff ? null : t))
}

/**
 * Align a delta series (e.g. pilot1 minus pilot2 lap time) onto an x-axis,
 * borrowing the reference driver's own distance samples when present. Mirrors
 * the Python original's `p1.get("distance", list(range(len(delta))))[:
 * len(delta)]`: the range fallback only applies when `distance` is truly
 * absent (`undefined`), never merely empty, and the result is never padded —
 * a `distance` shorter than `delta` yields an x-axis shorter than the delta
 * series itself, exactly as the Python slice does.
 */
export function alignDeltaX(distance: number[] | undefined, deltaLength: number): number[] {
  const base = distance !== undefined ? distance : Array.from({ length: deltaLength }, (_, i) => i)
  return base.slice(0, deltaLength)
}
