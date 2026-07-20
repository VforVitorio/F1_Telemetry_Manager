// Per-driver stint timeline: one row per driver, one coloured block per
// stint. Fill colour carries the compound directly (the intuitive read for a
// block); the strip legend above also shows each compound's DASH pattern, so
// this reads together with the five degradation charts below — those already
// spend colour on the driver, so they show compound as a dash instead.

import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { getDriverTextColor } from '@/lib/drivers'
import { compoundVariant, type CompoundVariant } from '@/lib/compounds'
import { tireColors } from '@/charts/echartsTheme'
import type { RaceRecord } from '@/lib/api/race'
import { buildGanttModel, COMPOUND_DASH_PREVIEW, type GanttStint } from '../lib/tyreSeries'

const ROW_HEIGHT = 10
const STAGGER_MS = 40
const REVEAL_MS = 500
const FALLBACK_BLOCK_COLOR = '#6b7280'

/** True under `prefers-reduced-motion`, or when `matchMedia` isn't available —
 *  either way the safe default is to skip the reveal animation and paint the
 *  final state immediately (mirrors the same guard in ResultBanner.tsx). */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function blockColor(compound: string): string {
  const variant = compoundVariant(compound)
  return variant ? tireColors[variant] : FALLBACK_BLOCK_COLOR
}

/** Groups the flat, already-sorted stint list by driver, preserving the sort
 *  order `buildGanttModel` produced (driver, then stint). */
function groupByDriver(stints: GanttStint[]): Array<[string, GanttStint[]]> {
  const order: string[] = []
  const byDriver = new Map<string, GanttStint[]>()
  for (const stint of stints) {
    if (!byDriver.has(stint.driver)) {
      byDriver.set(stint.driver, [])
      order.push(stint.driver)
    }
    byDriver.get(stint.driver)?.push(stint)
  }
  return order.map((driver): [string, GanttStint[]] => [driver, byDriver.get(driver) ?? []])
}

/** One driver's row: an SVG whose viewBox spans the lap axis, one `<rect>`
 *  per stint. Rects scale in from zero width once `revealed` flips true
 *  (skipped when reduced motion is on, since `revealed` starts `true` then)
 *  so the plan reads as drawn rather than popped in. */
function DriverRow({ driver, stints, maxLap, revealed }: { driver: string; stints: GanttStint[]; maxLap: number; revealed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 font-mono text-xs font-semibold" style={{ color: getDriverTextColor(driver) }}>
        {driver}
      </span>
      <svg
        viewBox={`0 0 ${maxLap} ${ROW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-3 w-full flex-1"
        role="img"
        aria-label={`${driver} stint plan`}
      >
        {stints.map((stint, index) => (
          <rect
            key={stint.stint}
            x={Math.max(stint.startLap - 1, 0)}
            y={0}
            width={Math.max(stint.endLap - stint.startLap + 1, 1)}
            height={ROW_HEIGHT}
            rx={1}
            fill={blockColor(stint.compound)}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'left center',
              transform: revealed ? 'scaleX(1)' : 'scaleX(0)',
              transition: `transform ${REVEAL_MS}ms ease ${index * STAGGER_MS}ms`,
            }}
          >
            <title>
              {driver} · stint {stint.stint} · {stint.compound} · laps {stint.startLap}-{stint.endLap}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

/** Bridges the gantt's fill-colour compound encoding with the degradation
 *  charts' dash encoding, so the two views read as one system. */
function CompoundLegend({ compounds }: { compounds: CompoundVariant[] }) {
  if (compounds.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-4">
      {compounds.map((variant) => (
        <span key={variant} className="flex items-center gap-1.5 text-xs text-fg-3">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: tireColors[variant] }} aria-hidden="true" />
          <svg width="18" height="2" aria-hidden="true">
            <line
              x1="0"
              y1="1"
              x2="18"
              y2="1"
              stroke={tireColors[variant]}
              strokeWidth="2"
              strokeDasharray={COMPOUND_DASH_PREVIEW[variant]}
            />
          </svg>
          {variant.charAt(0) + variant.slice(1).toLowerCase()}
        </span>
      ))}
    </div>
  )
}

export interface StintGanttProps {
  /** Frame filtered to the selected drivers (or the whole field if none). */
  rows: RaceRecord[]
}

/** Stint-plan card: legend strip + one timeline row per driver. Doubles as
 *  the compound-dash legend for the five charts in TyreChartSwitcher. */
export function StintGantt({ rows }: StintGanttProps) {
  const [revealed, setRevealed] = useState<boolean>(() => prefersReducedMotion())

  useEffect(() => {
    if (prefersReducedMotion()) return
    // Two rAFs, not one: the first commits the initial `scaleX(0)` style to
    // the DOM, the second fires after the browser has had a chance to paint
    // it — flipping `revealed` any earlier can coalesce into the same frame
    // as the initial paint, and the transition never has a "from" state to
    // animate away from.
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setRevealed(true))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [])

  const stints = buildGanttModel(rows)
  if (stints.length === 0) {
    return <EmptyState title="No stint data" description="This selection has no lap-by-lap stint history." />
  }

  const maxLap = stints.reduce((max, stint) => Math.max(max, stint.endLap), 1)
  const compoundsPresent = [
    ...new Set(stints.map((stint) => compoundVariant(stint.compound)).filter((c): c is CompoundVariant => c != null)),
  ]

  return (
    <Card elevation="resting" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-medium text-fg-1">Stint plan</h3>
        <CompoundLegend compounds={compoundsPresent} />
      </div>
      <div className="flex flex-col gap-2">
        {groupByDriver(stints).map(([driver, driverStints]) => (
          <DriverRow key={driver} driver={driver} stints={driverStints} maxLap={maxLap} revealed={revealed} />
        ))}
      </div>
      <p className="text-right text-[11px] text-fg-3">Lap {maxLap}</p>
    </Card>
  )
}
