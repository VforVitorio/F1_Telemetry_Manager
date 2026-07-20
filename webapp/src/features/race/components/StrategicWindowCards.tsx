// Strategic-window summary — per-driver StatCards counting undercut / overcut
// / defensive opportunities. Faithful port of gap_charts.py's
// `_render_windows_summary`, split per driver instead of one field-wide total
// (the Python page only ever showed one driver or the whole field blurred
// together). Clicking a card highlights that driver's qualifying laps on the
// gap-evolution chart — the highlight state is lifted to GapsPanel so both
// this component and GapCharts can read/set it.

import type { KeyboardEvent } from 'react'
import { Card } from '@/components/Card'
import { StatCard } from '@/components/StatCard'
import { Pill } from '@/components/Pill'
import { getDriverTextColor } from '@/lib/drivers'
import { cn } from '@/lib/cn'
import type { RaceRecord } from '@/lib/api/race'
import { calculateStrategicWindows, type RaceStrategicWindow } from '../lib/raceFrame'
import { RACE_YEAR } from '../search'
import type { GapHighlight, GapHighlightKind } from '../lib/gapSeries'

const TONE_TEXT_CLASS: Record<GapHighlightKind, string> = {
  undercut: 'text-success',
  overcut: 'text-warning',
  defensive: 'text-danger',
}

const CARD_LABEL: Record<GapHighlightKind, string> = {
  undercut: 'Undercut opps',
  overcut: 'Overcut opps',
  defensive: 'Defensive needed',
}

const WINDOW_KINDS: GapHighlightKind[] = ['undercut', 'overcut', 'defensive']

interface DriverWindowCounts {
  driver: string
  laps: Record<GapHighlightKind, number[]>
}

/** True when a window flag is set for a given kind — the one place that maps
 *  `RaceStrategicWindow`'s three boolean fields onto the `GapHighlightKind`
 *  union, so the grouping loop below can stay a single generic pass. */
function flagFor(window: RaceStrategicWindow, kind: GapHighlightKind): boolean {
  if (kind === 'undercut') return window.undercutOpportunity
  if (kind === 'overcut') return window.overcutOpportunity
  return window.defensiveNeeded
}

/** Groups the per-lap strategic-window flags by driver, collecting the
 *  qualifying lap numbers per kind (the counts are just those laps' lengths —
 *  computed inline where each card renders, so there's one source of truth
 *  instead of a count and a lap list drifting apart). */
function groupByDriver(windows: RaceStrategicWindow[]): DriverWindowCounts[] {
  const byDriver = new Map<string, DriverWindowCounts>()
  for (const window of windows) {
    if (!window.driver || window.lapNumber == null) continue
    const entry = byDriver.get(window.driver) ?? {
      driver: window.driver,
      laps: { undercut: [], overcut: [], defensive: [] },
    }
    for (const kind of WINDOW_KINDS) {
      if (flagFor(window, kind)) entry.laps[kind].push(window.lapNumber)
    }
    byDriver.set(window.driver, entry)
  }
  return [...byDriver.values()].sort((a, b) => a.driver.localeCompare(b.driver))
}

export interface StrategicWindowCardsProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
  /** The currently active highlight (a previously clicked card), if any. */
  highlight?: GapHighlight
  /** Set (or clear, passing `undefined`) the active highlight. */
  onHighlight: (highlight: GapHighlight | undefined) => void
}

/** Per-driver undercut/overcut/defensive opportunity counts. Each count is a
 *  clickable StatCard: clicking pins that driver's qualifying laps on the
 *  evolution chart above; clicking the same card again clears it. */
export function StrategicWindowCards({ rows, highlight, onHighlight }: StrategicWindowCardsProps) {
  const perDriver = groupByDriver(calculateStrategicWindows(rows))
  if (perDriver.length === 0) return null

  const toggle = (driver: string, kind: GapHighlightKind, laps: number[]) => {
    const isActive = highlight?.driver === driver && highlight.kind === kind
    onHighlight(isActive ? undefined : { driver, kind, laps })
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-sm font-medium text-fg-1">Strategic windows summary</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {perDriver.map((entry) => (
          <DriverWindowGroup key={entry.driver} entry={entry} highlight={highlight} onToggle={toggle} />
        ))}
      </div>
    </div>
  )
}

function DriverWindowGroup({
  entry,
  highlight,
  onToggle,
}: {
  entry: DriverWindowCounts
  highlight?: GapHighlight
  onToggle: (driver: string, kind: GapHighlightKind, laps: number[]) => void
}) {
  const driverColor = getDriverTextColor(entry.driver, RACE_YEAR)

  return (
    <Card className="flex flex-col gap-2 p-3">
      <Pill tone="neutral" style={{ color: driverColor }} className="w-fit tracking-widest">
        {entry.driver}
      </Pill>
      <div className="grid grid-cols-3 gap-2">
        {WINDOW_KINDS.map((kind) => {
          const laps = entry.laps[kind]
          const active = highlight?.driver === entry.driver && highlight.kind === kind
          const clickable = laps.length > 0
          const activate = () => clickable && onToggle(entry.driver, kind, laps)
          const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            activate()
          }
          return (
            <StatCard
              key={kind}
              eyebrow={CARD_LABEL[kind]}
              value={<span className={TONE_TEXT_CLASS[kind]}>{laps.length}</span>}
              hint={clickable ? 'Click to highlight' : 'None this race'}
              role="button"
              tabIndex={clickable ? 0 : -1}
              aria-pressed={active}
              aria-disabled={!clickable}
              onClick={activate}
              onKeyDown={onKeyDown}
              className={cn(
                'p-3 transition-colors',
                clickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                active && 'ring-2 ring-purple-400',
              )}
            />
          )
        })}
      </div>
    </Card>
  )
}
