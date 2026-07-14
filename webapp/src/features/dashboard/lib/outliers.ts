// Client-side lap filtering, ported 1:1 from the Streamlit dashboard
// (`components/dashboard/lap_graph.py`). Both toggles are pure transforms over
// the already-fetched laps — no refetch (parity requirement F1-5 / P4-3).
//
// PARITY NOTES (faithful to the original, quirks included):
//  - Outlier IQR uses INDEX-based quartiles (n//4, 3n//4) on the sorted times,
//    NOT linear-interpolation quartiles; multiplier 1.5; drivers with <4 laps
//    are skipped (never flagged).
//  - "Invalid" = `not is_accurate or is_pit_out_lap`. The /lap-times response
//    does not currently include these fields, so with safe defaults every lap
//    counts as valid → the toggle is effectively a no-op today, exactly as in
//    Streamlit. Reading the optional fields keeps it correct if the backend
//    later starts sending them.

import type { LapTime } from '@/lib/api/telemetry'

/** Lap with the (currently unsent) accuracy flags the invalid filter would use. */
type LapWithFlags = LapTime & { is_accurate?: boolean; is_pit_out_lap?: boolean }

/** Integer floor division, matching Python's `//`. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

/**
 * Indices (into `laps`) flagged as lap-time outliers, computed per driver via
 * the 1.5×IQR rule with index-based quartiles. Drivers with <4 laps are skipped.
 */
export function detectOutlierIndices(laps: LapTime[]): Set<number> {
  const byDriver = new Map<string, number[]>()
  laps.forEach((lap, idx) => {
    const list = byDriver.get(lap.driver) ?? []
    list.push(idx)
    byDriver.set(lap.driver, list)
  })

  const outliers = new Set<number>()
  for (const indices of byDriver.values()) {
    if (indices.length < 4) continue
    const times = indices.map((i) => laps[i].lap_time)
    const sorted = [...times].sort((a, b) => a - b)
    const n = sorted.length
    const q1 = sorted[floorDiv(n, 4)]
    const q3 = sorted[floorDiv(3 * n, 4)]
    const iqr = q3 - q1
    const lower = q1 - 1.5 * iqr
    const upper = q3 + 1.5 * iqr
    for (const i of indices) {
      const t = laps[i].lap_time
      if (t < lower || t > upper) outliers.add(i)
    }
  }
  return outliers
}

/** Whether a lap is "invalid" per the Streamlit rule (see parity note). */
function isInvalid(lap: LapTime): boolean {
  const flagged = lap as LapWithFlags
  const accurate = flagged.is_accurate ?? true
  const pitOut = flagged.is_pit_out_lap ?? false
  return !accurate || pitOut
}

export interface LapFilterResult {
  visible: LapTime[]
  outlierCount: number // total outliers detected (regardless of toggle)
  invalidCount: number // total invalid laps detected (regardless of toggle)
}

/**
 * Apply the outlier + invalid toggles in place (no refetch).
 * Hides outliers when `showOutliers` is false; hides invalid when
 * `showInvalidLaps` is false. Returns the visible laps plus the total counts so
 * the caller can render the "Hiding/Showing N …" status line.
 */
export function applyLapFilters(
  laps: LapTime[],
  showOutliers: boolean,
  showInvalidLaps: boolean,
): LapFilterResult {
  const outlierIdx = detectOutlierIndices(laps)
  let invalidCount = 0
  const visible: LapTime[] = []

  laps.forEach((lap, idx) => {
    const outlier = outlierIdx.has(idx)
    const invalid = isInvalid(lap)
    if (invalid) invalidCount += 1
    if (!showOutliers && outlier) return
    if (!showInvalidLaps && invalid) return
    visible.push(lap)
  })

  return { visible, outlierCount: outlierIdx.size, invalidCount }
}
