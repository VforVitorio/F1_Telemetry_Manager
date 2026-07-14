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
import { getDriverTextColor } from '../lib/drivers'
import { SectionHeader } from './SectionHeader'

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

/** Drivers who ran this compound with their lap counts, in selection order
 *  (skips drivers who ran zero laps on it). */
function driversWithCounts(
  driverCounts: Map<string, number>,
  drivers: string[],
): { driver: string; count: number }[] {
  return drivers
    .map((driver) => ({ driver, count: driverCounts.get(driver) ?? 0 }))
    .filter(({ count }) => count > 0)
}

export interface CompoundLegendProps {
  /** FULL (unfiltered) lap times. */
  lapTimes: LapTime[]
  drivers: string[]
  /** Season year — team colours changed lineups across seasons (`getDriverTextColor`). */
  year?: number
}

/** Per-compound Pill row with each driver's lap count on that tyre, the
 *  driver code team-coloured. Renders nothing when no laps are loaded yet
 *  (matches the Streamlit early-return). */
export function CompoundLegend({ lapTimes, drivers, year }: CompoundLegendProps) {
  const counts = countLapsByCompound(lapTimes)
  const compounds = orderedCompounds(counts)

  if (compounds.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Tyre compounds" />
      <div className="flex flex-wrap gap-4">
        {compounds.map((compound) => {
          const variant = compoundVariant(compound)
          const driverCounts = driversWithCounts(counts.get(compound) ?? new Map(), drivers)
          return (
            <div key={compound} className="flex flex-col items-start gap-1">
              {variant ? (
                <Pill compound={variant}>{compoundLabel(compound)}</Pill>
              ) : (
                <Pill tone="neutral">{compoundLabel(compound)}</Pill>
              )}
              {driverCounts.length > 0 ? (
                <span className="text-xs text-fg-3">
                  {driverCounts.map(({ driver, count }, index) => (
                    <span key={driver}>
                      {index > 0 ? ' · ' : ''}
                      <span
                        className="font-mono tabular-nums"
                        style={{ color: getDriverTextColor(driver, year) }}
                      >
                        {driver}
                      </span>{' '}
                      {count}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
