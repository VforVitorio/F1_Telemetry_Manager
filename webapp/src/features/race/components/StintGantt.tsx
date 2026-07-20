// Per-driver stint timeline: one row per driver, one coloured block per
// stint. Fill colour carries the compound directly (the intuitive read for a
// block); the strip legend above also shows each compound's DASH pattern, so
// this reads together with the five degradation charts below — those already
// spend colour on the driver, so they show compound as a dash instead.

import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { getDriverTextColor } from '@/lib/drivers'
import { COMPOUND_ORDER, compoundVariant, type CompoundVariant } from '@/lib/compounds'
import { tireColors } from '@/charts/echartsTheme'
import type { RaceRecord } from '@/lib/api/race'
import { buildGanttModel, COMPOUND_DASH_PREVIEW, type GanttStint } from '../lib/tyreSeries'

const ROW_HEIGHT = 10
const STAGGER_MS = 40
const REVEAL_MS = 500
const FALLBACK_BLOCK_COLOR = '#6b7280'
const GRIDLINE_STEP_LAPS = 10

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

/** Orders the compounds present soft→wet using the catalogue's own shared
 *  `COMPOUND_ORDER`, so this legend always matches TyresPanel's compound
 *  filter chips directly above it in the Tyres tab, instead of drifting into
 *  whatever order the compounds first appear in the lap data. */
function orderCompounds(variants: CompoundVariant[]): CompoundVariant[] {
  return [...variants].sort(
    (a, b) => COMPOUND_ORDER.indexOf(a.toLowerCase()) - COMPOUND_ORDER.indexOf(b.toLowerCase()),
  )
}

/** Lap positions for the axis labels and the per-row background gridlines:
 *  every 10 laps, plus the final lap so a partial last interval still gets a
 *  boundary marker. */
function axisTicks(maxLap: number): number[] {
  const ticks: number[] = []
  for (let lap = 0; lap <= maxLap; lap += GRIDLINE_STEP_LAPS) ticks.push(lap)
  if (ticks[ticks.length - 1] !== maxLap) ticks.push(maxLap)
  return ticks
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

/** One driver's row: an SVG whose viewBox spans the lap axis, a hairline
 *  gridline at each axis tick (drawn first so stints paint over them), then
 *  one `<rect>` per stint. Rects scale in from zero width once `revealed`
 *  flips true (skipped when reduced motion is on, since `revealed` starts
 *  `true` then) so the plan reads as drawn rather than popped in.
 *
 *  No `rx` on the stint rects: `preserveAspectRatio="none"` scales the x and
 *  y axes independently (the viewBox is `maxLap` wide but a fixed
 *  `ROW_HEIGHT` tall), which would stretch a rounded corner into an
 *  uneven ellipse — a plain rectangle stays crisp under that distortion.
 *  `vectorEffect="non-scaling-stroke"` keeps the hairline stroke itself a
 *  constant on-screen width for the same reason. */
function DriverRow({
  driver,
  stints,
  maxLap,
  ticks,
  revealed,
}: {
  driver: string
  stints: GanttStint[]
  maxLap: number
  ticks: number[]
  revealed: boolean
}) {
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
        {ticks.map((lap) => (
          <line
            key={lap}
            x1={lap}
            x2={lap}
            y1={0}
            y2={ROW_HEIGHT}
            className="stroke-hairline"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {stints.map((stint, index) => (
          <rect
            key={stint.stint}
            x={Math.max(stint.startLap - 1, 0)}
            y={0}
            width={Math.max(stint.endLap - stint.startLap + 1, 1)}
            height={ROW_HEIGHT}
            fill={blockColor(stint.compound)}
            className="stroke-hairline"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
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
          <span
            className="size-2.5 rounded-sm border border-hairline"
            style={{ backgroundColor: tireColors[variant] }}
            aria-hidden="true"
          />
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

/** Shared lap-number axis rendered once beneath every driver row. Mirrors
 *  each row's own layout (an empty `w-10` gutter matching the driver-code
 *  column, then a full-width lane) so a tick's percentage position lands
 *  exactly under its lap on every SVG row above — plain HTML text instead of
 *  SVG, since text drawn inside a `preserveAspectRatio="none"` viewBox would
 *  suffer the same non-uniform stretch the stint rects avoid by dropping `rx`. */
function LapAxis({ ticks, maxLap }: { ticks: number[]; maxLap: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0" aria-hidden="true" />
      <div className="relative h-3 w-full flex-1 font-mono text-[11px] text-fg-3">
        {ticks.map((lap) => (
          <span
            key={lap}
            className="absolute top-0"
            style={{
              left: `${(lap / maxLap) * 100}%`,
              transform: lap === 0 ? 'none' : lap === maxLap ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {lap}
          </span>
        ))}
      </div>
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
  const compoundsPresent = orderCompounds([
    ...new Set(stints.map((stint) => compoundVariant(stint.compound)).filter((c): c is CompoundVariant => c != null)),
  ])
  const ticks = axisTicks(maxLap)

  return (
    <Card elevation="resting" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-medium text-fg-1">Stint plan</h3>
        <CompoundLegend compounds={compoundsPresent} />
      </div>
      <div className="flex flex-col gap-2">
        {groupByDriver(stints).map(([driver, driverStints]) => (
          <DriverRow
            key={driver}
            driver={driver}
            stints={driverStints}
            maxLap={maxLap}
            ticks={ticks}
            revealed={revealed}
          />
        ))}
      </div>
      <LapAxis ticks={ticks} maxLap={maxLap} />
    </Card>
  )
}
