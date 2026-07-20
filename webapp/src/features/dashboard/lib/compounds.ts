// Compound helpers moved to the shared `@/lib/compounds` (now used by Race
// Analysis too). Re-exported here so the Dashboard's existing imports keep
// resolving without churn.
export {
  type CompoundVariant,
  COMPOUND_ORDER,
  compoundEmoji,
  compoundLabel,
  compoundVariant,
} from '@/lib/compounds'
