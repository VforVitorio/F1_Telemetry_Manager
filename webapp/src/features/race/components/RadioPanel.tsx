// Radio tab — a browser (driver rail → message list with transcript previews)
// feeding an NLP result card, plus a free-text composer. Built in the Radio
// worker pass; this stub fixes the prop contract RacePage wires.

import { EmptyState } from '@/components/EmptyState'

export interface RadioPanelProps {
  gp: string
  /** Driver codes selected in the context bar (seeds the browser). */
  drivers: string[]
  /** The selected radio message (URL-bound). */
  rdriver?: string
  rlap?: number
  onSelect: (rdriver: string | undefined, rlap: number | undefined) => void
}

export function RadioPanel({ gp }: RadioPanelProps) {
  return (
    <EmptyState
      title="Radio — coming in this build"
      description={`Team-radio analysis for ${gp}.`}
    />
  )
}
