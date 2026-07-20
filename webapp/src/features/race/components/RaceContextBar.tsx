// Context row for Race Analysis: the GP selector + a driver multiselect (cap
// 3, options come from the loaded frame). No year/session (Race is always the
// 2025 featured parquet), and no explicit load gate: picking a GP auto-fetches.
// A small "radio" badge on a GP option flags team-radio availability.
//
// This is the only part meant to stay pinned under the page header. The
// loaded-frame summary and the local-data drop zone live in the separate
// `RaceContextExtras` below, rendered in normal (non-sticky) flow so scrolling
// a chart never pins a quarter of the viewport as chrome.

import { useState } from 'react'
import { ChevronRight, CircleDot, Database, Mic, X } from 'lucide-react'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/Combobox'
import { FileDrop } from '@/components/FileDrop'
import { Pill } from '@/components/Pill'
import { useToast } from '@/components/Toast'
import { getDriverColor } from '@/lib/drivers'
import { parseUploadedFile } from '../lib/uploadParse'
import { useRaceGps, useRadioAvailableGps } from '../queries'
import { RACE_YEAR, type RaceSearch } from '../search'
import { useRaceStore } from '../store'

/** Summary of the loaded frame for `RaceContextExtras`. */
export interface RaceLoadedInfo {
  rows: number
  drivers: number
  laps: number
  compounds: string[]
}

export interface RaceContextBarProps {
  value: RaceSearch
  onChange: (patch: Partial<RaceSearch>) => void
  /** Driver codes present in the loaded frame, the multiselect options. */
  driverOptions: string[]
  loading: boolean
}

const EYEBROW = 'text-xs font-medium uppercase tracking-widest text-fg-3'

export function RaceContextBar({ value, onChange, driverOptions, loading }: RaceContextBarProps) {
  const gpsQuery = useRaceGps()
  const radioGpsQuery = useRadioAvailableGps()
  const radioGps = new Set(radioGpsQuery.data ?? [])

  const gpOptions: ComboboxOption[] = (gpsQuery.data ?? []).map((gp) => ({
    value: gp,
    label: gp,
  }))
  const driverComboOptions: ComboboxOption[] = driverOptions.map((code) => ({
    value: code,
    label: code,
  }))

  const upload = useRaceStore((s) => s.upload)
  const clearUpload = useRaceStore((s) => s.clearUpload)

  return (
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
          getOptionHint={(gp) =>
            radioGps.has(gp) ? (
              <span className="flex items-center gap-1 text-xs text-fg-3">
                <Mic className="size-3" aria-hidden="true" />
                radio
              </span>
            ) : null
          }
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
            !value.gp ? 'Load a race first' : loading ? 'Loading race…' : 'Filter drivers (max 3)'
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

      {upload ? (
        <Pill tone="purple" className="gap-1.5">
          <Database className="size-3" aria-hidden="true" />
          Local dataset
          <button
            type="button"
            onClick={clearUpload}
            aria-label="Clear local dataset"
            className="rounded-full hover:text-fg-1"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Pill>
      ) : null}
    </div>
  )
}

export interface RaceContextExtrasProps {
  /** The loaded-frame summary, or null before a race is loaded. */
  loaded: RaceLoadedInfo | null
}

/** Below-the-fold row: the loaded-frame summary on the left, a compact
 *  "Local data" disclosure on the right so an offline CSV/parquet can stand in
 *  for the backend fetch entirely (see RacePage: an active upload takes
 *  precedence over `search.gp`'s query). Rendered in normal page flow, never
 *  inside the sticky context bar. */
export function RaceContextExtras({ loaded }: RaceContextExtrasProps) {
  const upload = useRaceStore((s) => s.upload)
  const setUpload = useRaceStore((s) => s.setUpload)
  const { toast } = useToast()
  const [isParsing, setIsParsing] = useState(false)

  /** Parse a dropped file client-side and stash it as the active upload. A
   *  parse failure (malformed CSV, non-parquet binary, …) never touches the
   *  store, so the previous upload (if any) stays active. */
  async function handleFile(file: File) {
    setIsParsing(true)
    try {
      const rows = await parseUploadedFile(file)
      setUpload({ name: file.name, rows })
      toast({
        title: 'Local dataset loaded',
        description: `${file.name} · ${rows.length.toLocaleString()} rows`,
        tone: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not parse file',
        description: error instanceof Error ? error.message : 'Unknown parsing error.',
        tone: 'danger',
      })
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {loaded ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
          <span className="font-mono text-fg-2">{loaded.laps} laps</span>
          <span className="font-mono">{loaded.drivers} drivers</span>
          <span className="font-mono">{loaded.rows.toLocaleString()} rows</span>
          {loaded.compounds.length > 0 ? (
            <span className="font-mono">
              {loaded.compounds.map((c) => c.charAt(0)).join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}

      <details className="group ml-auto w-fit rounded-lg border border-hairline open:bg-bg-4/60">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-fg-3 transition-colors hover:text-fg-2 [&::-webkit-details-marker]:hidden">
          <Database className="size-3.5 shrink-0" aria-hidden="true" />
          Local data
          <ChevronRight
            aria-hidden="true"
            className="size-3 shrink-0 transition-transform duration-200 group-open:rotate-90"
          />
        </summary>
        <div className="flex flex-col gap-2 border-t border-hairline px-3 py-3 sm:w-80">
          <FileDrop
            accept=".csv,.parquet"
            onFile={(file) => void handleFile(file)}
            label={isParsing ? 'Parsing…' : 'Drop a CSV or parquet file, or click to browse'}
            disabled={isParsing}
          />
          {upload ? (
            <p className="font-mono text-xs text-fg-3">
              {upload.name} · {upload.rows.length.toLocaleString()} rows
            </p>
          ) : null}
        </div>
      </details>
    </div>
  )
}
