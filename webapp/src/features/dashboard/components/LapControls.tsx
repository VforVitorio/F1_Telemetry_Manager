// Lap-chart control row. Streamlit parity:
// `frontend/components/dashboard/lap_graph.py::render_control_buttons` /
// `_display_filter_status`.
//
// Pure presentational + one pure computation (fastest lap per driver); all
// store writes happen in the caller (`LapChartSection`) so this component
// never touches Zustand directly.

import { Button } from '@/components/Button'
import type { LapTime } from '@/lib/api/telemetry'

/** Each driver's fastest lap (by `lap_time`), computed from the FULL
 *  (unfiltered) lap times — the outlier/invalid toggles must not hide a
 *  driver's genuine fastest lap from this shortcut. */
function fastestLapPerDriver(lapTimes: LapTime[], drivers: string[]): Record<string, number> {
  const fastest: Record<string, number> = {}
  for (const driver of drivers) {
    const driverLaps = lapTimes.filter((lap) => lap.driver === driver)
    if (driverLaps.length === 0) continue
    const quickest = driverLaps.reduce((best, lap) => (lap.lap_time < best.lap_time ? lap : best))
    fastest[driver] = quickest.lap_number
  }
  return fastest
}

/** "Showing/Hiding N outlier laps | Hiding N invalid laps" status line,
 *  matching `_display_filter_status`'s message assembly exactly. */
function buildFilterStatus(
  outlierCount: number,
  invalidCount: number,
  showOutliers: boolean,
  showInvalidLaps: boolean,
): string {
  const parts: string[] = []
  if (outlierCount > 0) {
    parts.push(
      showOutliers
        ? `📊 Showing ${outlierCount} outlier laps`
        : `🚫 Hiding ${outlierCount} outlier laps`,
    )
  }
  if (invalidCount > 0 && !showInvalidLaps) {
    parts.push(`🚫 Hiding ${invalidCount} invalid laps`)
  }
  return parts.join(' | ')
}

export interface LapControlsProps {
  /** FULL (unfiltered) lap times — fastest-lap selection ignores the toggles. */
  lapTimes: LapTime[]
  drivers: string[]
  showOutliers: boolean
  showInvalidLaps: boolean
  outlierCount: number
  invalidCount: number
  onSelectFastestLaps: (laps: Record<string, number>) => void
  onToggleOutliers: () => void
  onToggleInvalidLaps: () => void
}

/** Fastest-laps shortcut + outlier/invalid visibility toggles, plus the
 *  resulting filter-status line. */
export function LapControls({
  lapTimes,
  drivers,
  showOutliers,
  showInvalidLaps,
  outlierCount,
  invalidCount,
  onSelectFastestLaps,
  onToggleOutliers,
  onToggleInvalidLaps,
}: LapControlsProps) {
  const filterStatus = buildFilterStatus(outlierCount, invalidCount, showOutliers, showInvalidLaps)

  /** Load each driver's fastest lap — no-op when there are no laps yet, so the
   *  button can't wipe the current selection with an empty map. */
  const handleSelectFastest = () => {
    const fastest = fastestLapPerDriver(lapTimes, drivers)
    if (Object.keys(fastest).length > 0) onSelectFastestLaps(fastest)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button variant="ghost" onClick={handleSelectFastest}>
          🏁 SELECT FASTEST LAPS
        </Button>
        <Button variant="ghost" onClick={onToggleOutliers}>
          {showOutliers ? 'HIDE OUTLIERS' : 'SHOW OUTLIERS'}
        </Button>
        <Button variant="ghost" onClick={onToggleInvalidLaps}>
          {showInvalidLaps ? 'HIDE INVALID LAPS' : 'SHOW INVALID LAPS'}
        </Button>
      </div>
      {filterStatus ? <p className="text-sm text-fg-3">{filterStatus}</p> : null}
    </div>
  )
}
