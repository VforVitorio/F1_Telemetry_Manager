// Tyres tab: a compound filter row, the stint gantt, and the 5-view
// degradation chart switcher. The compound filter only narrows the Speed
// view — the one Streamlit chart that looks at a single compound at a time;
// the other four already show every compound at once via the dash encoding
// (see tyreSeries.ts).

import { EmptyState } from '@/components/EmptyState'
import { CompoundPill } from '@/components/CompoundPill'
import { cn } from '@/lib/cn'
import type { RaceRecord } from '@/lib/api/race'
import { compoundVariant, type CompoundVariant } from '@/lib/compounds'
import { StintGantt } from './StintGantt'
import { TyreChartSwitcher } from './TyreChartSwitcher'
import { PodiumQuickPick } from './PodiumQuickPick'

const COMPOUND_ORDER: CompoundVariant[] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']

/** Compounds present in the loaded frame, soft→wet — only these earn a
 *  filter chip (no point offering one nobody ran this race). */
function compoundsInFrame(rows: RaceRecord[]): CompoundVariant[] {
  const present = new Set(
    rows.map((row) => compoundVariant(row.Compound)).filter((c): c is CompoundVariant => c != null),
  )
  return COMPOUND_ORDER.filter((c) => present.has(c))
}

/** One clickable compound chip. Clicking the already-active chip clears the
 *  filter back to "every compound" instead of leaving it stuck selected. */
function CompoundFilterChip({
  compound,
  active,
  onClick,
}: {
  compound: CompoundVariant
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        active
          ? 'opacity-100 ring-2 ring-purple-400 ring-offset-2 ring-offset-bg-0'
          : 'opacity-60 hover:opacity-90',
      )}
    >
      <CompoundPill compound={compound} />
    </button>
  )
}

export interface TyresPanelProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** Active compound filter (URL-bound), if any. */
  compound?: string
  onCompound: (compound: string | undefined) => void
  /** Whether the user has picked any drivers. With none, the line chart would be
   *  20-car spaghetti, so we show a quick-pick instead (the gantt stays). */
  hasSelection: boolean
  /** Top 3 by final position, for the quick-pick. */
  podium: string[]
  onPick: (drivers: string[]) => void
}

export function TyresPanel({
  rows,
  compound,
  onCompound,
  hasSelection,
  podium,
  onPick,
}: TyresPanelProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No laps for this selection"
        description="Pick a different driver, or clear the compound filter."
      />
    )
  }

  const compounds = compoundsInFrame(rows)

  return (
    <div className="flex flex-col gap-6">
      <StintGantt rows={rows} />

      {hasSelection ? (
        <>
          {compounds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-widest text-fg-3">
                Compound
              </span>
              {compounds.map((c) => (
                <CompoundFilterChip
                  key={c}
                  compound={c}
                  active={compound === c}
                  onClick={() => onCompound(compound === c ? undefined : c)}
                />
              ))}
            </div>
          ) : null}
          <TyreChartSwitcher rows={rows} compound={compound} />
        </>
      ) : (
        <PodiumQuickPick podium={podium} onPick={onPick} />
      )}
    </div>
  )
}
