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

/** Above this many drivers, one 3-StatCard tile per driver becomes dozens of
 *  near-identical tiles (20 drivers = 60 tiles, ~7 screens tall) — switch to
 *  a compact sortable leaderboard instead. At or below it, the full field
 *  fits comfortably and the richer per-driver card treatment stays. */
const MAX_FULL_CARD_DRIVERS = 3

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
      {perDriver.length > MAX_FULL_CARD_DRIVERS ? (
        <StrategicWindowLeaderboard perDriver={perDriver} highlight={highlight} onToggle={toggle} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {perDriver.map((entry) => (
            <DriverWindowGroup
              key={entry.driver}
              entry={entry}
              highlight={highlight}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
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
              hint={clickable ? undefined : 'None this race'}
              role="button"
              tabIndex={clickable ? 0 : -1}
              aria-pressed={active}
              aria-disabled={!clickable}
              onClick={activate}
              onKeyDown={onKeyDown}
              className={cn(
                'p-3 transition-colors',
                clickable
                  ? 'cursor-pointer hover:ring-1 hover:ring-purple-400/70'
                  : 'cursor-not-allowed opacity-60',
                active && 'ring-2 ring-purple-400',
              )}
            />
          )
        })}
      </div>
    </Card>
  )
}

/** Compact alternative to the per-driver card grid for a full field: one row
 *  per driver, one native `<button>` per opportunity count. A native button
 *  gets keyboard activation (Enter/Space) and focus styling for free, so
 *  unlike `DriverWindowGroup` above it needs no manual role/tabIndex/keydown
 *  wiring. Sorted by undercut count descending — the metric most drivers
 *  care about surfaces first. */
function StrategicWindowLeaderboard({
  perDriver,
  highlight,
  onToggle,
}: {
  perDriver: DriverWindowCounts[]
  highlight?: GapHighlight
  onToggle: (driver: string, kind: GapHighlightKind, laps: number[]) => void
}) {
  const sorted = [...perDriver].sort((a, b) => b.laps.undercut.length - a.laps.undercut.length)

  return (
    <Card elevation="resting" className="overflow-x-auto">
      <table className="w-full min-w-md border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-fg-3 uppercase">
              Driver
            </th>
            {WINDOW_KINDS.map((kind) => (
              <th
                key={kind}
                className="px-3 py-2 text-right text-xs font-medium tracking-wide text-fg-3 uppercase"
              >
                {CARD_LABEL[kind]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <LeaderboardRow
              key={entry.driver}
              entry={entry}
              highlight={highlight}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function LeaderboardRow({
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
    <tr className="border-b border-hairline last:border-b-0">
      <td className="px-3 py-2">
        <span
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: driverColor }}
        >
          {entry.driver}
        </span>
      </td>
      {WINDOW_KINDS.map((kind) => {
        const laps = entry.laps[kind]
        const active = highlight?.driver === entry.driver && highlight.kind === kind
        const clickable = laps.length > 0
        return (
          <td key={kind} className="px-3 py-1 text-right">
            <button
              type="button"
              disabled={!clickable}
              aria-pressed={active}
              onClick={() => onToggle(entry.driver, kind, laps)}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-sm tabular-nums transition-colors',
                TONE_TEXT_CLASS[kind],
                clickable
                  ? 'cursor-pointer hover:ring-1 hover:ring-purple-400/70'
                  : 'cursor-not-allowed opacity-40',
                active && 'ring-2 ring-purple-400',
              )}
            >
              {laps.length}
            </button>
          </td>
        )
      })}
    </tr>
  )
}
