// Lap-chart control row. Streamlit parity:
// `frontend/components/dashboard/lap_graph.py::render_control_buttons` /
// `_display_filter_status`.
//
// Pure presentational; the fastest-lap computation is the shared
// `../lib/fastestLap` helper (also used by the page's auto-load effect). All
// store writes happen in the caller (`LapChartSection`) so this component
// never touches Zustand directly.

import { Eye, EyeOff, Timer } from 'lucide-react'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'
import type { LapTime } from '@/lib/api/telemetry'
import { fastestLapPerDriver } from '../lib/fastestLap'

/** Pressed/unpressed toggle chip for a lap-visibility filter, with the
 *  affected lap count embedded in the label — replaces the old standalone
 *  filter-status line, which duplicated these same counts as plain text. */
function FilterChip({
  label,
  count,
  pressed,
  onToggle,
}: {
  label: string
  count: number
  pressed: boolean
  onToggle: () => void
}) {
  const Icon = pressed ? Eye : EyeOff
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        pressed ? 'bg-bg-4 text-fg-1' : 'text-fg-3 hover:bg-bg-4 hover:text-fg-2',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label} · {count}
    </button>
  )
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

/** Fastest-laps shortcut + outlier/invalid visibility toggle chips, in a
 *  left-aligned auto-width row (not a full-width grid — these are compact
 *  controls, not equal-weight destinations). */
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
  /** Load each driver's fastest lap — no-op when there are no laps yet, so the
   *  button can't wipe the current selection with an empty map. */
  const handleSelectFastest = () => {
    const fastest = fastestLapPerDriver(lapTimes, drivers)
    if (Object.keys(fastest).length > 0) onSelectFastestLaps(fastest)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleSelectFastest}>
        <Timer className="size-4" aria-hidden="true" />
        Select fastest laps
      </Button>
      <FilterChip
        label="Outliers"
        count={outlierCount}
        pressed={showOutliers}
        onToggle={onToggleOutliers}
      />
      <FilterChip
        label="Invalid"
        count={invalidCount}
        pressed={showInvalidLaps}
        onToggle={onToggleInvalidLaps}
      />
    </div>
  )
}
