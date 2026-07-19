// Sticky context bar for the Comparison tab: "[2024▾][Monaco GP▾][Q▾][VER✕
// LEC✕ ▾(max 2)]  [⚑ fastest laps]  [COMPARE▸]". Same cascading Year → GP →
// Session → Drivers grammar as the Dashboard's
// `SelectorsToolbar`, capped at MAX_DRIVERS=2, plus the "fastest laps only"
// info chip and the explicit COMPARE action that gates the (expensive) fetch.
//
// Dumb renderer: it only reads `value`/`comparing` and fires patches/onCompare
// — the page owns the URL, applies the cascade reset (`applyComparisonPatch`)
// and runs the fetch (`useComparison`, gated by `compare=1`).

import type { ReactNode } from 'react'
import { Flag, GitCompareArrows, Loader2 } from 'lucide-react'
import { type ComparisonSearch, MAX_DRIVERS, isComparable } from '../search'
import { useGps, useSessions, useDrivers } from '../queries'
import { getDriverColor } from '@/lib/drivers'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/Combobox'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'

export interface ComparisonToolbarProps {
  value: ComparisonSearch
  /** Patch the URL search (page merges + navigates + applies the cascade reset). */
  onChange: (patch: Partial<ComparisonSearch>) => void
  /** Fires the (expensive) compare fetch — only reachable once isComparable(value). */
  onCompare: () => void
  /** True while the compare fetch is in flight — disables + spins the button. */
  comparing: boolean
}

// Streamlit hardcodes this same list — no `/years` endpoint exists (Dashboard parity).
const YEAR_OPTIONS: ComboboxOption[] = [2025, 2024, 2023].map((year) => ({
  value: String(year),
  label: String(year),
}))

const EYEBROW_CLASSNAME = 'text-center text-xs font-medium uppercase tracking-widest text-fg-3'

/** A labelled selector cell, matching `SelectorsToolbar`'s centered-eyebrow
 *  style so the Dashboard and Comparison toolbars read as one grammar. `width`
 *  sizes the cell on the ≥lg single-row layout the spec mock draws; below
 *  that it falls back to the responsive grid the parent lays out. */
function SelectorField({
  label,
  width,
  children,
}: {
  label: string
  width: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', width)}>
      <span className={EYEBROW_CLASSNAME}>{label}</span>
      {children}
    </div>
  )
}

/** "Only fastest laps compared" info chip (spec row 4) — states context
 *  inline rather than as a dismissible banner, since it is always true for
 *  this tab, not a conditional warning. */
function FastestLapsChip() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-3">
      <Flag className="size-3.5 shrink-0" aria-hidden="true" />
      Only fastest laps compared
    </span>
  )
}

/**
 * Sticky comparison context bar: the 4 cascading selectors (capped at 2
 * drivers), the fastest-laps chip, and the COMPARE button. The page wraps
 * this in the acrylic sticky positioning; this component only lays out its
 * own row.
 */
export function ComparisonToolbar({
  value,
  onChange,
  onCompare,
  comparing,
}: ComparisonToolbarProps) {
  const gpsQuery = useGps(value.year)
  const sessionsQuery = useSessions(value.year, value.gp)
  const driversQuery = useDrivers(value.year, value.gp, value.session)

  const gpOptions: ComboboxOption[] = (gpsQuery.data ?? []).map((gp) => ({ value: gp, label: gp }))
  const sessionOptions: ComboboxOption[] = (sessionsQuery.data ?? []).map((session) => ({
    value: session,
    label: session,
  }))
  const driverOptions: ComboboxOption[] = (driversQuery.data ?? []).map((driver) => ({
    value: driver.code,
    label: driver.code,
  }))

  const canCompare = isComparable(value) && !comparing

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
      <div
        className={cn(
          'grid grid-cols-2 gap-3',
          'sm:grid-cols-4',
          'lg:flex lg:flex-1 lg:flex-wrap lg:items-end lg:gap-4',
        )}
      >
        <SelectorField label="Year" width="lg:w-24">
          <Combobox
            ariaLabel="Year"
            options={YEAR_OPTIONS}
            value={value.year != null ? String(value.year) : undefined}
            onChange={(year) => onChange({ year: Number(year) })}
            placeholder="Select year"
          />
        </SelectorField>

        <SelectorField label="GP" width="lg:w-56">
          <Combobox
            ariaLabel="Grand Prix"
            options={gpOptions}
            value={value.gp}
            onChange={(gp) => onChange({ gp })}
            placeholder="Select GP"
            disabled={value.year == null}
            loading={gpsQuery.isLoading}
          />
        </SelectorField>

        <SelectorField label="Session" width="lg:w-28">
          <Combobox
            ariaLabel="Session"
            options={sessionOptions}
            value={value.session}
            onChange={(session) => onChange({ session })}
            placeholder="Select session"
            disabled={!value.gp}
            loading={sessionsQuery.isLoading}
          />
        </SelectorField>

        <SelectorField label="Drivers" width="lg:w-64">
          <MultiCombobox
            ariaLabel="Drivers (max 2)"
            options={driverOptions}
            value={value.drivers}
            onChange={(drivers) => onChange({ drivers })}
            placeholder={
              driversQuery.isLoading
                ? 'Loading drivers…'
                : driversQuery.isError
                  ? "Couldn't load drivers — reselect the session"
                  : 'Select drivers (max 2)'
            }
            disabled={!value.session}
            loading={driversQuery.isLoading}
            max={MAX_DRIVERS}
            getOptionAccent={(code) => getDriverColor(code, value.year)}
          />
        </SelectorField>
      </div>

      <div className="flex items-center gap-4">
        <FastestLapsChip />
        <Button variant="primary" onClick={onCompare} disabled={!canCompare} aria-busy={comparing}>
          {comparing ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <GitCompareArrows className="size-4 shrink-0" aria-hidden="true" />
          )}
          {comparing ? 'Comparing…' : 'Compare'}
        </Button>
      </div>
    </div>
  )
}
