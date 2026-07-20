// Gaps tab — gap-evolution + undercut/overcut zones + per-driver strategic-window
// cards. Built in the Gaps worker pass; this stub fixes the prop contract.

import { EmptyState } from '@/components/EmptyState'
import type { RaceRecord } from '@/lib/api/race'

export interface GapsPanelProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
}

export function GapsPanel({ rows }: GapsPanelProps) {
  return (
    <EmptyState
      title="Gaps — coming in this build"
      description={`${rows.length.toLocaleString()} laps ready to chart.`}
    />
  )
}
