import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Small rounded label for statuses, sentiment, intent flags and entity chips
// (`tone`), or an F1 tire compound (`compound`). Tire hues are a fixed brand
// identity (not themeable, see tokens.css), so compound chips always use the
// non-themeable `--tire-ink` dark text for contrast instead of the tinted-text
// treatment tone pills use. When both are passed, `compound` wins — it is the
// more specific signal.

type Tone = 'neutral' | 'purple' | 'success' | 'warning' | 'danger' | 'info'
type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-bg-4 text-fg-2',
  purple: 'bg-purple-600/15 text-purple-300',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
}

const COMPOUND_STYLES: Record<Compound, string> = {
  SOFT: 'bg-tire-soft text-[color:var(--tire-ink)] border border-hairline',
  MEDIUM: 'bg-tire-medium text-[color:var(--tire-ink)] border border-hairline',
  HARD: 'bg-tire-hard text-[color:var(--tire-ink)] border border-hairline',
  INTERMEDIATE: 'bg-tire-inter text-[color:var(--tire-ink)] border border-hairline',
  WET: 'bg-tire-wet text-[color:var(--tire-ink)] border border-hairline',
}

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  compound?: Compound
}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = 'neutral', compound, className, children, ...props },
  ref,
) {
  const styles = compound ? COMPOUND_STYLES[compound] : TONE_STYLES[tone]
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-medium',
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
})

/** Alias for call sites that think in "badge" vocabulary (status/count chips)
 *  rather than "pill" (compound/sentiment/intent chips). Same component. */
export const Badge = Pill
