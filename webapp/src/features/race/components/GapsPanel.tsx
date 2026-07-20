// Gaps tab — gap-evolution + undercut/overcut zones (GapCharts) + per-driver
// strategic-window cards (StrategicWindowCards). The "highlight" selection
// (which card was last clicked) is owned here, not in either child, since a
// StrategicWindowCards click needs to reach the chart living next to it.

import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import type { RaceRecord } from '@/lib/api/race'
import { GapCharts } from './GapCharts'
import { StrategicWindowCards } from './StrategicWindowCards'
import { PodiumQuickPick } from './PodiumQuickPick'
import type { GapHighlight } from '../lib/gapSeries'

export interface GapsPanelProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** Whether the user has picked drivers. With none, the gap chart would be
   *  40-line spaghetti, so we show a quick-pick; the strategy cards stay. */
  hasSelection: boolean
  /** Top 3 by final position, for the quick-pick. */
  podium: string[]
  onPick: (drivers: string[]) => void
}

export function GapsPanel({ rows, hasSelection, podium, onPick }: GapsPanelProps) {
  const [highlight, setHighlight] = useState<GapHighlight | undefined>(undefined)

  if (rows.length === 0) {
    return <EmptyState title="No gap data" description="This selection has no laps to chart." />
  }

  return (
    <div className="flex flex-col gap-6">
      {hasSelection ? (
        <GapCharts rows={rows} highlight={highlight} />
      ) : (
        <PodiumQuickPick podium={podium} onPick={onPick} />
      )}
      <StrategicWindowCards rows={rows} highlight={highlight} onHighlight={setHighlight} />
    </div>
  )
}
