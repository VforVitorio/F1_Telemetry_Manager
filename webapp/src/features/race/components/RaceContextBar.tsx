// Sticky context bar for Race Analysis: the GP selector + a driver multiselect
// (cap 3, options come from the loaded frame) + a "what's loaded" strip. No
// year/session (Race is always the 2025 featured parquet) and no explicit load
// gate — picking a GP auto-fetches. A dot on a GP option flags radio availability.

import { CircleDot } from 'lucide-react'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/Combobox'
import { CompoundPill } from '@/components/CompoundPill'
import { getDriverColor } from '@/lib/drivers'
import { cn } from '@/lib/cn'
import { RACE_YEAR, type RaceSearch } from '../search'
import { useRaceGps, useRadioAvailableGps } from '../queries'

/** Summary of the loaded frame for the strip. */
export interface RaceLoadedInfo {
  rows: number
  drivers: number
  laps: number
  compounds: string[]
}

export interface RaceContextBarProps {
  value: RaceSearch
  onChange: (patch: Partial<RaceSearch>) => void
  /** Driver codes present in the loaded frame — the multiselect options. */
  driverOptions: string[]
  /** The loaded-frame summary, or null before a race is loaded. */
  loaded: RaceLoadedInfo | null
  loading: boolean
}

const EYEBROW = 'text-xs font-medium uppercase tracking-widest text-fg-3'

export function RaceContextBar({
  value,
  onChange,
  driverOptions,
  loaded,
  loading,
}: RaceContextBarProps) {
  const gpsQuery = useRaceGps()
  const radioGpsQuery = useRadioAvailableGps()
  const radioGps = new Set(radioGpsQuery.data ?? [])

  const gpOptions: ComboboxOption[] = (gpsQuery.data ?? []).map((gp) => ({
    value: gp,
    label: radioGps.has(gp) ? `${gp}  ●` : gp,
  }))
  const driverComboOptions: ComboboxOption[] = driverOptions.map((code) => ({
    value: code,
    label: code,
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <span className="hidden shrink-0 items-center rounded-full border border-hairline bg-bg-4 px-2 py-1 font-mono text-xs text-fg-3 sm:inline-flex">
          {RACE_YEAR} season
        </span>

        <div className="flex flex-col gap-1.5 sm:w-64">
          <span className={EYEBROW}>Grand Prix</span>
          <Combobox
            ariaLabel="Grand Prix"
            options={gpOptions}
            value={value.gp}
            onChange={(gp) => onChange({ gp })}
            placeholder="Select a Grand Prix"
            loading={gpsQuery.isLoading}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-72">
          <span className={EYEBROW}>Drivers</span>
          <MultiCombobox
            ariaLabel="Drivers (max 3)"
            options={driverComboOptions}
            value={value.drivers}
            onChange={(drivers) => onChange({ drivers })}
            placeholder={
              !value.gp
                ? 'Load a race first'
                : loading
                  ? 'Loading race…'
                  : 'Filter drivers (max 3)'
            }
            disabled={!value.gp || loading || driverOptions.length === 0}
            max={3}
            getOptionAccent={(code) => getDriverColor(code, RACE_YEAR)}
          />
        </div>

        {radioGps.has(value.gp ?? '') ? (
          <span className="flex items-center gap-1 text-xs text-fg-3">
            <CircleDot className="size-3 text-success" aria-hidden="true" />
            radio available
          </span>
        ) : null}
      </div>

      {loaded ? (
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3')}>
          <span className="font-mono text-fg-2">{loaded.rows.toLocaleString()} rows</span>
          <span className="font-mono">{loaded.drivers} drivers</span>
          <span className="font-mono">{loaded.laps} laps</span>
          {loaded.compounds.length > 0 ? (
            <span className="flex items-center gap-1">
              {loaded.compounds.map((c) => (
                <CompoundPill key={c} compound={c} />
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
