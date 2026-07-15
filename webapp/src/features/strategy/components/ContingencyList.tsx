import { ActionBadge } from '@/components/ActionBadge'
import type { Contingency, ContingencyPriority } from '@/lib/api/strategy'

// The IF-THEN playbook: conditional branches the orchestrator's LLM synthesis
// step planned for laps ahead of the current one (e.g. "IF the gap drops
// under 1s -> UNDERCUT"). A no-LLM / degraded `/recommend` run returns an
// empty array, so this list renders nothing rather than an empty "Playbook"
// panel — the caller (DecisionCard) decides whether its own section heading
// is worth showing at all when there's nothing to plan for.

/** Cap rows so a verbose LLM run can't push the Decision Card off-screen. */
const MAX_ROWS = 4

const PRIORITY_DOT_TONE: Record<ContingencyPriority, string> = {
  HIGH: 'bg-danger',
  MEDIUM: 'bg-warning',
  LOW: 'bg-fg-4',
}

/** Map a contingency's priority to its status-dot colour. Filled tonal
 *  `Pill`s are reserved for the action badge — priority renders as a neutral
 *  outline chip with a coloured dot instead, so the two don't visually
 *  compete for the same "important" signal. */
function priorityDotTone(priority: ContingencyPriority): string {
  return PRIORITY_DOT_TONE[priority] ?? 'bg-fg-4'
}

export interface ContingencyListProps {
  contingencies: Contingency[]
}

/**
 * Render up to 4 "IF trigger -> switch_to" playbook rows, each tagged with its
 * priority and rationale. Returns `null` when there are no contingencies, so
 * a sparse/no-LLM run never shows an empty list.
 */
export function ContingencyList({ contingencies }: ContingencyListProps) {
  if (contingencies.length === 0) return null

  const rows = contingencies.slice(0, MAX_ROWS)

  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {rows.map((contingency, index) => (
        <li
          key={`${contingency.trigger}-${index}`}
          className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs uppercase tracking-wide text-fg-4">IF</span>
            <span className="text-fg-2">{contingency.trigger}</span>
            <span aria-hidden="true" className="text-fg-4">
              →
            </span>
            <ActionBadge action={contingency.switch_to} size="sm" />
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 font-mono text-xs text-fg-3">
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${priorityDotTone(contingency.priority)}`}
              />
              {contingency.priority}
            </span>
          </div>
          <p className="text-xs text-fg-3">{contingency.rationale}</p>
        </li>
      ))}
    </ul>
  )
}
