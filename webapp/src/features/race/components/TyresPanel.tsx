// Tyres tab — stint gantt + the 5 tyre-degradation views (switcher + show-all),
// compound filter. Built in the Tyres worker pass; this stub fixes the prop
// contract RacePage wires.

import { EmptyState } from '@/components/EmptyState'
import type { RaceRecord } from '@/lib/api/race'

export interface TyresPanelProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** Active compound filter (URL-bound), if any. */
  compound?: string
  onCompound: (compound: string | undefined) => void
}

export function TyresPanel({ rows }: TyresPanelProps) {
  return (
    <EmptyState
      title="Tyres — coming in this build"
      description={`${rows.length.toLocaleString()} laps ready to chart.`}
    />
  )
}
