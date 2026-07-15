// Lap Chart card footer strip: telemetry-selection status (left) + tyre
// compound legend (right), folded into the `ChartCard`'s `footer` slot so the
// card reads as one unit — chart, controls, status — instead of a stack of
// loose blocks below it (round-2 fix #3, see
// `docs/migration/design-specs/dashboard-round2.md#3`). `LapChartSection`
// only renders this once `lapTimes` is non-empty; both clusters are cheap to
// compute off data it already has in hand.

import { Activity } from 'lucide-react'
import type { LapTime } from '@/lib/api/telemetry'
import { getDriverTextColor } from '../lib/drivers'
import { CompoundLegend } from './CompoundLegend'

/** `{ driver, lap }` pairs for the telemetry-status caption, in the store
 *  map's insertion order (click order / fastest-laps batch order). */
function telemetryCaptionParts(selectedLapsPerDriver: Record<string, number>) {
  return Object.entries(selectedLapsPerDriver).map(([driver, lap]) => ({ driver, lap }))
}

export interface LapChartFooterProps {
  /** driver code -> the lap number whose telemetry is currently loaded. */
  selectedLapsPerDriver: Record<string, number>
  /** FULL (unfiltered) lap times — the compound legend's counts ignore the
   *  outlier/invalid toggles, matching `LapControls`. */
  lapTimes: LapTime[]
  drivers: string[]
  year: number | undefined
}

/** Left cluster: which lap's telemetry is loaded per driver, plus the
 *  click-to-switch hint (demoted here from its old standalone tip line).
 *  Right cluster: the inline tyre-compound legend. `flex-wrap` lets narrow
 *  cards stack the two clusters instead of overflowing. */
export function LapChartFooter({
  selectedLapsPerDriver,
  lapTimes,
  drivers,
  year,
}: LapChartFooterProps) {
  const captionParts = telemetryCaptionParts(selectedLapsPerDriver)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      {captionParts.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-fg-2">
          <Activity className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
          <span>
            Showing telemetry:{' '}
            {captionParts.map((part, index) => (
              <span key={part.driver}>
                {index > 0 ? ', ' : ''}
                <strong
                  className="font-semibold"
                  style={{ color: getDriverTextColor(part.driver, year) }}
                >
                  {part.driver}
                </strong>{' '}
                (Lap <span className="font-mono tabular-nums">{part.lap}</span>)
              </span>
            ))}
            <span className="text-fg-3"> · click any point to switch lap</span>
          </span>
        </p>
      ) : null}
      <CompoundLegend lapTimes={lapTimes} drivers={drivers} year={year} />
    </div>
  )
}
