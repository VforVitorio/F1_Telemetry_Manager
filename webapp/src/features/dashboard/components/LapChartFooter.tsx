// Lap Chart card footer: a compact "timing-strip" — telemetry-selection status
// (left) + tyre-compound legend (right), folded into the ChartCard footer slot
// (round-2 #3, see docs/migration/design-specs/dashboard-round2.md#3). One row,
// everything `text-xs` on a single baseline; hierarchy is carried by the fg
// ramp (loaded lap = fg-1, code = fg-2, eyebrow = fg-3, hint = fg-4), not by
// size. Team colour rides on a swatch DOT, never the code text: a filled dot
// has no contrast floor, so it survives the light theme's white card where a
// near-white team colour as text would be illegible — and the dot doubles as
// the chart's line-colour key. `LapChartSection` renders this once `lapTimes`
// is non-empty.

import type { LapTime } from '@/lib/api/telemetry'
import { getDriverColor } from '@/lib/drivers'
import { CompoundLegend } from './CompoundLegend'

const EYEBROW_CLASSNAME = 'font-medium uppercase tracking-widest text-fg-3'

/** `{ driver, lap }` pairs for the status cluster, in the store map's insertion
 *  order (click order / fastest-laps batch order). */
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

/** Footer strip. Left cluster = "what you're looking at now" (a `Telemetry`
 *  eyebrow + one dot·code·lap chip per loaded driver + a quiet click hint).
 *  Right cluster = the stint reference (compound legend). Both clusters always
 *  render, so a single-driver load never pins the legend to a lonely right
 *  edge, and the hint is loudest exactly when nothing is loaded yet. */
export function LapChartFooter({
  selectedLapsPerDriver,
  lapTimes,
  drivers,
  year,
}: LapChartFooterProps) {
  const captionParts = telemetryCaptionParts(selectedLapsPerDriver)
  const hasSelection = captionParts.length > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={EYEBROW_CLASSNAME}>Telemetry</span>
        {captionParts.map(({ driver, lap }) => (
          <span
            key={driver}
            className="flex items-center gap-1.5"
            title={`${driver} — Lap ${lap} telemetry loaded`}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full ring-1 ring-inset ring-hairline"
              style={{ backgroundColor: getDriverColor(driver, year) }}
            />
            <span className="font-mono font-medium text-fg-2">{driver}</span>
            <span className="font-mono tabular-nums text-fg-1">
              L{lap}
              <span className="sr-only"> (lap {lap})</span>
            </span>
          </span>
        ))}
        <span aria-hidden="true" className="hidden h-3 w-px bg-hairline sm:inline-block" />
        <span className="hidden text-fg-4 sm:inline">
          {hasSelection ? 'Click a point to switch lap' : 'Click a point to load telemetry'}
        </span>
      </div>
      <CompoundLegend lapTimes={lapTimes} drivers={drivers} />
    </div>
  )
}
