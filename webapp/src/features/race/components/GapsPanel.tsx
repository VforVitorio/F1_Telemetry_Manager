// Gaps tab — gap-evolution + undercut/overcut zones (GapCharts) + per-driver
// strategic-window cards (StrategicWindowCards). The "highlight" selection
// (which card was last clicked) is owned here, not in either child, since a
// StrategicWindowCards click needs to reach the chart living next to it.

import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import type { RaceRecord } from '@/lib/api/race'
import { GapCharts } from './GapCharts'
import { StrategicWindowCards } from './StrategicWindowCards'
import type { GapHighlight } from '../lib/gapSeries'

export interface GapsPanelProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
}

export function GapsPanel({ rows }: GapsPanelProps) {
  const [highlight, setHighlight] = useState<GapHighlight | undefined>(undefined)

  if (rows.length === 0) {
    return (
      <EmptyState title="No gap data" description="This selection has no laps to chart." />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <GapCharts rows={rows} highlight={highlight} />
      <StrategicWindowCards rows={rows} highlight={highlight} onHighlight={setHighlight} />
    </div>
  )
}
