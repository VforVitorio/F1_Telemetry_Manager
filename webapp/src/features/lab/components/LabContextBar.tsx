// The bench context bar: GP + driver selectors and the ONE lap control the
// active model uses (a window for Pace, a single lap for the per-lap models,
// nothing extra for Radio, which owns its own picker below). A lap-state chip
// previews the compound / tyre age / position for the chosen lap before any run.

import { useEffect, useRef } from 'react'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { CompoundPill } from '@/components/CompoundPill'
import { DualRangeSlider, Slider } from '@/components/Slider'
import { MetricRow } from '@/components/StatCard'
import { useLabDrivers, useLabGps, useLabRange, useLabState } from '../queries'
import { LAB_YEAR, type LabSearch } from '../search'
import type { LabControl } from '../models/types'

const EYEBROW = 'text-xs font-medium uppercase tracking-widest text-fg-3'

export interface LabContextBarProps {
  search: LabSearch
  onPatch: (patch: Partial<LabSearch>) => void
  control: LabControl
}

export function LabContextBar({ search, onPatch, control }: LabContextBarProps) {
  const gpsQuery = useLabGps()
  const driversQuery = useLabDrivers(search.gp)
  const rangeQuery = useLabRange(search.gp, search.driver)
  const range = rangeQuery.data
  const lapStateQuery = useLabState(
    search.gp,
    search.driver,
    control === 'lap' ? search.lap : undefined,
  )
  const lapState = lapStateQuery.data

  // Seed the lap control once a driver's lap range lands, so a freshly picked
  // driver can Run immediately instead of first hunting for a valid lap. Depends
  // on PRIMITIVES only: `search.laps` is a fresh array every render, so using it
  // as a dep would re-fire this effect forever (an infinite navigate loop).
  const driver = search.driver
  const hasLap = search.lap != null
  const hasLaps = search.laps != null
  const minLap = range?.min_lap
  const maxLap = range?.max_lap
  // Seed at most once per (driver, control): the ref key is claimed BEFORE the
  // patch so the effect re-firing before the URL reflects the new lap can't seed
  // twice (which would be an infinite navigate loop).
  const seedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (minLap == null || maxLap == null || !driver) return
    const key = `${driver}:${control}`
    if (seedKeyRef.current === key) return
    seedKeyRef.current = key
    if (control === 'lap' && !hasLap) onPatch({ lap: maxLap })
    else if (control === 'window' && !hasLaps) onPatch({ laps: [minLap, maxLap] })
  }, [minLap, maxLap, driver, control, hasLap, hasLaps, onPatch])

  const gpOptions: ComboboxOption[] = (gpsQuery.data ?? []).map((gp) => ({ value: gp, label: gp }))
  const driverOptions: ComboboxOption[] = (driversQuery.data ?? []).map((d) => ({
    value: d,
    label: d,
  }))

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <span className="hidden shrink-0 items-center rounded-full border border-hairline bg-bg-4 px-2 py-1 font-mono text-xs text-fg-3 sm:inline-flex">
        {LAB_YEAR} season
      </span>

      <div className="flex flex-col gap-1.5 sm:w-56">
        <span className={EYEBROW}>Grand Prix</span>
        <Combobox
          ariaLabel="Grand Prix"
          options={gpOptions}
          value={search.gp}
          onChange={(gp) => onPatch({ gp })}
          placeholder="Select a Grand Prix"
          loading={gpsQuery.isLoading}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:w-40">
        <span className={EYEBROW}>Driver</span>
        <Combobox
          ariaLabel="Driver"
          options={driverOptions}
          value={search.driver}
          onChange={(driver) => onPatch({ driver })}
          placeholder={!search.gp ? 'Pick a GP first' : 'Driver'}
          disabled={!search.gp}
          loading={driversQuery.isLoading}
        />
      </div>

      {control === 'window' && range ? (
        <div className="flex flex-col gap-1.5 sm:min-w-72 sm:flex-1">
          <span className={EYEBROW}>Lap window</span>
          <DualRangeSlider
            min={range.min_lap}
            max={range.max_lap}
            value={search.laps ?? [range.min_lap, range.max_lap]}
            onValueChange={(laps) => onPatch({ laps })}
            formatValue={(v) => `L${v}`}
          />
        </div>
      ) : null}

      {control === 'lap' && range ? (
        <div className="flex flex-col gap-1.5 sm:min-w-56 sm:flex-1">
          <span className={EYEBROW}>Lap</span>
          <Slider
            min={range.min_lap}
            max={range.max_lap}
            value={search.lap ?? range.max_lap}
            onValueChange={(lap) => onPatch({ lap })}
            formatValue={(v) => `L${v}`}
          />
          {lapState ? (
            <div className="flex items-center gap-2">
              <CompoundPill compound={lapState.driver.compound} />
              <MetricRow
                items={[
                  { label: 'age', value: `${lapState.driver.tyre_life}` },
                  { label: 'pos', value: `P${lapState.driver.position}` },
                  { label: 'stint', value: `${lapState.driver.stint}` },
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {control === 'radio' ? (
        <span className="flex items-end pb-2 text-xs text-fg-4">
          Pick a message or type free text in the bench below.
        </span>
      ) : null}
    </div>
  )
}
