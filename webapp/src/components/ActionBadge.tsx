import {
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { StrategyAction } from '@/lib/api/strategy'

// The strategy action vocabulary as a badge, at two sizes: `hero` for the
// Decision Card headline, `sm` for inline use (contingency playbook rows). Each
// v2 action gets an icon + tone; ALERT pulses (motion-safe) to read as urgent.
// An unknown action string falls back to a neutral badge, so a schema drift or
// a sparse response never renders a blank or crashes.

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

interface ActionConfig {
  label: string
  icon: LucideIcon
  tone: Tone
  pulse?: boolean
}

const ACTIONS: Record<StrategyAction, ActionConfig> = {
  STAY_OUT: { label: 'STAY OUT', icon: CircleCheck, tone: 'success' },
  PIT_NOW: { label: 'PIT NOW', icon: Wrench, tone: 'danger' },
  UNDERCUT: { label: 'UNDERCUT', icon: ArrowDownRight, tone: 'warning' },
  OVERCUT: { label: 'OVERCUT', icon: ArrowUpRight, tone: 'info' },
  ALERT: { label: 'ALERT', icon: TriangleAlert, tone: 'danger', pulse: true },
}

const UNKNOWN: ActionConfig = { label: 'UNKNOWN', icon: CircleHelp, tone: 'neutral' }

const TONE_STYLES: Record<Tone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  info: 'bg-info/15 text-info border-info/30',
  neutral: 'bg-bg-4 text-fg-2 border-hairline',
}

export interface ActionBadgeProps {
  action: string
  size?: 'hero' | 'sm'
  className?: string
}

/** Render a strategy action as an icon + label badge, tone-coded by action. */
export function ActionBadge({ action, size = 'sm', className }: ActionBadgeProps) {
  const config = (ACTIONS as Record<string, ActionConfig>)[action] ?? UNKNOWN
  const Icon = config.icon
  const isHero = size === 'hero'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-wide',
        isHero ? 'gap-2.5 px-5 py-2 text-2xl' : 'gap-1.5 px-2.5 py-0.5 text-xs',
        TONE_STYLES[config.tone],
        className,
      )}
    >
      <Icon
        className={cn(isHero ? 'size-6' : 'size-3.5', config.pulse && 'motion-safe:animate-pulse')}
        aria-hidden="true"
      />
      {config.label}
    </span>
  )
}
