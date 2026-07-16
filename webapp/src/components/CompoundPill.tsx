import { Pill } from '@/components/Pill'

// A tyre-compound chip in its branded colour. Wraps Pill's `compound` variant
// but accepts a raw compound string in ANY case — the orchestrator returns
// uppercase ('SOFT'|'MEDIUM'|'HARD'), while lap_state / FastF1 returns lowercase
// ('soft'|'intermediate'|'inter'|'wet'). Normalises both so call sites (decision
// pit plan, situation strip, agent tabs) don't each re-derive the variant.
// Unknown compounds fall back to a neutral pill with the raw text.

type CompoundVariant = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'

function toVariant(compound: string): CompoundVariant | null {
  switch (compound.toLowerCase()) {
    case 'soft':
      return 'SOFT'
    case 'medium':
      return 'MEDIUM'
    case 'hard':
      return 'HARD'
    case 'intermediate':
    case 'inter':
      return 'INTERMEDIATE'
    case 'wet':
      return 'WET'
    default:
      return null
  }
}

function label(compound: string): string {
  const lower = compound.toLowerCase()
  if (!lower) return 'Unknown'
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export interface CompoundPillProps {
  compound: string
  className?: string
}

/** Branded tyre-compound chip; neutral fallback for an unknown compound. */
export function CompoundPill({ compound, className }: CompoundPillProps) {
  const variant = toVariant(compound)
  if (!variant) {
    return (
      <Pill tone="neutral" className={className}>
        {label(compound)}
      </Pill>
    )
  }
  return (
    <Pill compound={variant} className={className}>
      {label(compound)}
    </Pill>
  )
}
