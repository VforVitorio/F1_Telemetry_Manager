import { Wrench } from 'lucide-react'
import { Pill } from '@/components/Pill'
import { cn } from '@/lib/cn'

export type ToolBadgeStatus = 'running' | 'done' | 'error'

export interface ToolBadgeProps {
  toolName: string
  status: ToolBadgeStatus
}

const STATUS_TONE: Record<ToolBadgeStatus, 'purple' | 'success' | 'danger'> = {
  running: 'purple',
  done: 'success',
  error: 'danger',
}

/** "predict_pace" -> "Predict pace". Tool names are already readable
 *  snake_case; this borrows the same sentence-case rendering the stage-label
 *  fallback uses (`../stageLabels.ts`) so a badge and its ticker line never
 *  disagree in tone. */
function humanize(toolName: string): string {
  const words = toolName.split('_').join(' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

/**
 * A small chip narrating which tool is running / just finished / just failed
 * during a turn. Deliberately generic — one icon for every tool family — so a
 * later sprint can specialise per-tool icons without changing this
 * component's contract (`display_type` renderers already carry their own
 * iconography once C2 lands).
 */
export function ToolBadge({ toolName, status }: ToolBadgeProps) {
  return (
    <Pill
      tone={STATUS_TONE[status]}
      className={cn(
        'inline-flex items-center gap-1.5',
        status === 'running' && 'motion-safe:animate-pulse',
      )}
    >
      <Wrench className="size-3" aria-hidden="true" />
      {humanize(toolName)}
      <span className="sr-only"> ({status})</span>
    </Pill>
  )
}
