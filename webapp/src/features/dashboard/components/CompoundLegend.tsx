// Tyre compound legend. Streamlit parity:
// `frontend/components/dashboard/lap_graph.py::_render_tyre_compound_legend`.
//
// One Pill per compound actually used, in SOFT→MEDIUM→HARD→INTER→WET order,
// each annotated with per-driver lap counts. Counts always come from the
// FULL (unfiltered) lap times — the outlier/invalid toggles only affect the
// chart, not "how many laps did each driver run on this tyre".

import { Pill } from '@/components/Pill'
import type { LapTime } from '@/lib/api/telemetry'
import { COMPOUND_ORDER, compoundLabel, compoundVariant } from '../lib/compounds'

/** compound (lowercase) -> driver -> lap count. Mirrors the Streamlit source,
 *  which excludes the 'unknown' compound from the legend entirely. */
function countLapsByCompound(lapTimes: LapTime[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>()
  for (const lap of lapTimes) {
    if (lap.compound.toLowerCase() === 'unknown') continue
    const driverCounts = counts.get(lap.compound) ?? new Map<string, number>()
    driverCounts.set(lap.driver, (driverCounts.get(lap.driver) ?? 0) + 1)
    counts.set(lap.compound, driverCounts)
  }
  return counts
}

/** Compounds present, ordered per `COMPOUND_ORDER`; anything not in that
 *  list (should not happen once 'unknown' is excluded) sorts last. */
function orderedCompounds(counts: Map<string, Map<string, number>>): string[] {
  return [...counts.keys()].sort((a, b) => {
    const indexA = COMPOUND_ORDER.indexOf(a.toLowerCase())
    const indexB = COMPOUND_ORDER.indexOf(b.toLowerCase())
    return (
      (indexA === -1 ? COMPOUND_ORDER.length : indexA) -
      (indexB === -1 ? COMPOUND_ORDER.length : indexB)
    )
  })
}

/** "VER: 12 laps · LEC: 8 laps" for the drivers who ran this compound, in
 *  selection order, singular "lap" for a count of exactly one. */
function driverLapSummary(driverCounts: Map<string, number>, drivers: string[]): string {
  return drivers
    .map((driver) => ({ driver, count: driverCounts.get(driver) ?? 0 }))
    .filter(({ count }) => count > 0)
    .map(({ driver, count }) => `${driver}: ${count} lap${count === 1 ? '' : 's'}`)
    .join(' · ')
}

export interface CompoundLegendProps {
  /** FULL (unfiltered) lap times. */
  lapTimes: LapTime[]
  drivers: string[]
}

/** Per-compound Pill row with each driver's lap count on that tyre. Renders
 *  nothing when no laps are loaded yet (matches the Streamlit early-return). */
export function CompoundLegend({ lapTimes, drivers }: CompoundLegendProps) {
  const counts = countLapsByCompound(lapTimes)
  const compounds = orderedCompounds(counts)

  if (compounds.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-sm uppercase tracking-wide text-fg-2">
        🏎️ Tyre Compounds Used
      </h3>
      <div className="flex flex-wrap gap-4">
        {compounds.map((compound) => {
          const variant = compoundVariant(compound)
          const summary = driverLapSummary(counts.get(compound) ?? new Map(), drivers)
          return (
            <div key={compound} className="flex flex-col items-start gap-1">
              {variant ? (
                <Pill compound={variant}>{compoundLabel(compound)}</Pill>
              ) : (
                <Pill tone="neutral">{compoundLabel(compound)}</Pill>
              )}
              {summary ? <span className="text-xs text-fg-3">{summary}</span> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
