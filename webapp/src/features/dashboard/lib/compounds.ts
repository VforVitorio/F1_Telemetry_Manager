// Tyre-compound presentation helpers, matching the Streamlit dashboard:
// compounds are shown in the lap-chart HOVER (emoji + capitalised name) and in
// the compound legend (per-driver lap counts). Points/lines themselves are
// coloured by DRIVER, never by compound (see LapChart).
//
// FastF1 returns compound lowercase ('soft'|'medium'|'hard'|'intermediate'|
// 'inter'|'wet'|'unknown'). `inter` is an alias of `intermediate`.

/** Canonical Pill `compound` variant values (uppercase), for the legend pills. */
export type CompoundVariant = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'

const EMOJI: Record<string, string> = {
  soft: '🔴',
  medium: '🟡',
  hard: '⚪',
  intermediate: '🟢',
  inter: '🟢',
  wet: '🔵',
}
const UNKNOWN_EMOJI = '⚫'

// Display order used by the legend (Streamlit: soft→medium→hard→inter→wet).
export const COMPOUND_ORDER = ['soft', 'medium', 'hard', 'intermediate', 'inter', 'wet']

/** Emoji marker for a compound (hover text). */
export function compoundEmoji(compound: string): string {
  return EMOJI[compound.toLowerCase()] ?? UNKNOWN_EMOJI
}

/** Human label, capitalised (e.g. 'medium' → 'Medium'). */
export function compoundLabel(compound: string): string {
  if (!compound) return 'Unknown'
  const lower = compound.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Map a raw FastF1 compound to the Pill `compound` variant, or null when it
 * has no branded colour (unknown). `inter` folds into INTERMEDIATE.
 */
export function compoundVariant(compound: string): CompoundVariant | null {
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
