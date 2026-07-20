// Shown in the Tyres/Gaps CHART slot when no drivers are picked: a full 20-car
// field turns every line chart into unreadable spaghetti, so we ask for a
// selection first (the stint gantt + strategic-window cards next to it still
// read the whole field). The podium (top 3 by final position) is the one-click
// starting point.

import { Users } from 'lucide-react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { getDriverColor } from '@/lib/drivers'
import { RACE_YEAR } from '../search'

export interface PodiumQuickPickProps {
  /** Top 3 drivers by final-lap position, in order. May be empty. */
  podium: string[]
  onPick: (drivers: string[]) => void
}

export function PodiumQuickPick({ podium, onPick }: PodiumQuickPickProps) {
  return (
    <EmptyState
      icon={<Users className="size-6" />}
      title="Pick drivers to chart"
      description="The whole field is 20 cars — too many lines to read at once. Choose up to 3 (the gantt and strategy cards already cover the full field)."
      action={
        podium.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {podium.map((code, i) => (
              <button
                key={code}
                type="button"
                onClick={() => onPick([code])}
                className="flex items-center gap-1.5 rounded-full border border-hairline bg-bg-4 px-2.5 py-1 font-mono text-xs text-fg-1 transition-colors hover:bg-bg-5"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: getDriverColor(code, RACE_YEAR) }}
                />
                P{i + 1} {code}
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => onPick(podium)}>
              Load podium
            </Button>
          </div>
        ) : undefined
      }
    />
  )
}
