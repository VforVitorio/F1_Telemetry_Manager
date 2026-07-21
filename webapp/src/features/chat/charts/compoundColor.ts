// Shared compound-to-colour lookup for the two chart builders that draw pit
// markers (lap times and race data) — both need to tint a dashed vline by
// the tyre compound fitted after the stop, so it lives once here rather than
// twice.

import { tireColors } from '@/charts/echartsTheme'

const INTERMEDIATE_ALIAS = 'INT'
// Violet accent, matching the Streamlit original's fallback for an unknown or
// missing compound label (chart_builders.py's `_COMPOUND_FALLBACK`).
const FALLBACK_COLOR = '#a78bfa'

/**
 * Resolve an already-uppercased compound label to its themed hex colour,
 * folding the `INT` shorthand FastF1 payloads sometimes ship into
 * `INTERMEDIATE` first. Anything else unrecognised falls back to a violet
 * accent so a pit marker never renders with an undefined colour.
 */
export function compoundColor(compound: string): string {
  const key = compound === INTERMEDIATE_ALIAS ? 'INTERMEDIATE' : compound
  return tireColors[key] ?? FALLBACK_COLOR
}
