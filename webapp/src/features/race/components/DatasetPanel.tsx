// Dataset tab — the full featured frame in a virtualized table with column-group
// presets + an All/Selected scope toggle + CSV export. Built in the Dataset
// worker pass; this stub fixes the prop contract.

import { EmptyState } from '@/components/EmptyState'
import type { RaceRecord } from '@/lib/api/race'

export interface DatasetPanelProps {
  /** The whole loaded frame (the panel applies its own All/Selected scope). */
  rows: RaceRecord[]
  /** Driver codes currently selected in the context bar. */
  selectedDrivers: string[]
}

export function DatasetPanel({ rows }: DatasetPanelProps) {
  return (
    <EmptyState
      title="Dataset — coming in this build"
      description={`${rows.length.toLocaleString()} rows × 26 columns ready.`}
    />
  )
}
