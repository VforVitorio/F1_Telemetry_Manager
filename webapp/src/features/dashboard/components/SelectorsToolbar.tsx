// Cascading Year → GP → Session → Drivers toolbar (Streamlit parity, see
// `frontend/components/dashboard/data_selectors.py`). This component is a
// dumb renderer: it only reads `value` and fires single-key patches via
// `onChange`. The page (`DashboardPage`) owns the URL and applies the
// cascading reset when an upstream selector changes.
import type { ReactNode } from 'react'
import type { DashboardSearch } from '../search'
import { MAX_DRIVERS } from '../search'
import { useGps, useSessions, useDrivers } from '../queries'
import { getDriverColor } from '@/lib/drivers'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/Combobox'
import { cn } from '@/lib/cn'

export interface SelectorsToolbarProps {
  value: DashboardSearch
  /** Patch the URL search (page merges + navigates). Passing a key resets its dependents. */
  onChange: (patch: Partial<DashboardSearch>) => void
}

// Streamlit hardcodes this same list — no `/years` endpoint exists.
const YEAR_OPTIONS: ComboboxOption[] = [2025, 2024, 2023].map((year) => ({
  value: String(year),
  label: String(year),
}))

const EYEBROW_CLASSNAME = 'text-center text-xs font-medium uppercase tracking-widest text-fg-3'

/** A labelled selector cell: the small uppercase eyebrow centered over its
 *  control, matching `StatCard`'s eyebrow styling so the toolbar reads as one
 *  system. Centered (not left) so each label sits over the middle of its wide
 *  field instead of orphaned in the top-left corner of it. */
function SelectorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={EYEBROW_CLASSNAME}>{label}</span>
      {children}
    </div>
  )
}

/**
 * Horizontal toolbar of the 4 cascading dashboard selectors. Each selector is
 * disabled until its upstream dependency is chosen, and options come from the
 * live telemetry API (`useGps`/`useSessions`/`useDrivers`) rather than a
 * hardcoded roster, so the driver list always matches who actually ran.
 */
export function SelectorsToolbar({ value, onChange }: SelectorsToolbarProps) {
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

  return (
    <div className={cn('grid grid-cols-1 gap-4', 'sm:grid-cols-2', 'lg:grid-cols-4')}>
      <SelectorField label="Year">
        <Combobox
          ariaLabel="Year"
          options={YEAR_OPTIONS}
          value={value.year != null ? String(value.year) : undefined}
          onChange={(year) => onChange({ year: Number(year) })}
          placeholder="Select year"
        />
      </SelectorField>

      <SelectorField label="GP">
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

      <SelectorField label="Session">
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

      <SelectorField label="Drivers">
        <MultiCombobox
          ariaLabel="Drivers (max 3)"
          options={driverOptions}
          value={value.drivers}
          onChange={(drivers) => onChange({ drivers })}
          placeholder={
            driversQuery.isLoading
              ? 'Loading drivers…'
              : driversQuery.isError
                ? "Couldn't load drivers — reselect the session"
                : 'Select drivers (max 3)'
          }
          disabled={!value.session}
          loading={driversQuery.isLoading}
          max={MAX_DRIVERS}
          getOptionAccent={(code) => getDriverColor(code, value.year)}
        />
      </SelectorField>
    </div>
  )
}
