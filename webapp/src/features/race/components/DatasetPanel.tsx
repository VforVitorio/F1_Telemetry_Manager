// Dataset tab — the full featured frame in a virtualized table with
// column-group presets (fewer than the whole 26+ columns at once) plus an
// All/Selected scope toggle and CSV export. `DataTable` already renders
// numeric cells in tabular mono figures; this panel is only responsible for
// choosing which columns show per preset and dressing up cell content
// (compound branding, boolean pills, null formatting, right-aligned numbers)
// on top of that.

import { useMemo, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CompoundPill } from '@/components/CompoundPill'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { Pill } from '@/components/Pill'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import type { RaceRecord } from '@/lib/api/race'
import { DATASET_PRESETS, useRaceStore, type DatasetPreset, type DatasetScope } from '../store'

export interface DatasetPanelProps {
  /** The whole loaded frame (the panel applies its own All/Selected scope). */
  rows: RaceRecord[]
  /** Driver codes currently selected in the context bar. */
  selectedDrivers: string[]
}

const DASH = '—'
const TABLE_HEIGHT_PX = 560

// ── Column catalogue ─────────────────────────────────────────────────────────
// One entry per RaceRecord field the Dataset tab can show: its display label
// and how its cell renders. Presets below just pick which keys to show, in
// which order — the label/kind live here once so they never drift apart.

type ColumnKind = 'text' | 'number' | 'compound' | 'boolean'
type ColumnKey = keyof RaceRecord

interface ColumnSpec {
  label: string
  kind: ColumnKind
}

const COLUMN_SPECS: Record<ColumnKey, ColumnSpec> = {
  Driver: { label: 'Driver', kind: 'text' },
  DriverNumber: { label: 'Car #', kind: 'number' },
  LapNumber: { label: 'Lap', kind: 'number' },
  Stint: { label: 'Stint', kind: 'number' },
  SpeedI1: { label: 'Speed I1', kind: 'number' },
  SpeedI2: { label: 'Speed I2', kind: 'number' },
  SpeedFL: { label: 'Speed FL', kind: 'number' },
  SpeedST: { label: 'Speed Trap', kind: 'number' },
  Compound: { label: 'Compound', kind: 'compound' },
  TyreLife: { label: 'Tyre Life', kind: 'number' },
  TyreAge: { label: 'Tyre Age', kind: 'number' },
  FreshTyre: { label: 'Fresh', kind: 'boolean' },
  Team: { label: 'Team', kind: 'text' },
  Position: { label: 'Pos', kind: 'number' },
  CompoundID: { label: 'Compound ID', kind: 'number' },
  LapTime_s: { label: 'Lap Time (s)', kind: 'number' },
  FuelLoad: { label: 'Fuel Load (kg)', kind: 'number' },
  FuelAdjustedLapTime: { label: 'Fuel-Adj. Lap Time (s)', kind: 'number' },
  FuelAdjustedDegAbsolute: { label: 'Fuel-Adj. Deg (abs)', kind: 'number' },
  FuelAdjustedDegPercent: { label: 'Fuel-Adj. Deg (%)', kind: 'number' },
  DegradationRate: { label: 'Deg. Rate (s/lap)', kind: 'number' },
  AirTemp: { label: 'Air Temp (°C)', kind: 'number' },
  TrackTemp: { label: 'Track Temp (°C)', kind: 'number' },
  GP_Name: { label: 'Grand Prix', kind: 'text' },
  GapToCarAhead: { label: 'Gap Ahead (s)', kind: 'number' },
  GapToCarBehind: { label: 'Gap Behind (s)', kind: 'number' },
  consistent_gap_ahead_laps: { label: 'Consistent Ahead (laps)', kind: 'number' },
  consistent_gap_behind_laps: { label: 'Consistent Behind (laps)', kind: 'number' },
}

const COLUMN_WIDTH: Record<ColumnKind, number> = {
  text: 140,
  number: 110,
  compound: 120,
  boolean: 90,
}

const PRESET_LABELS: Record<DatasetPreset, string> = {
  timing: 'Timing',
  tyres: 'Tyres',
  speeds: 'Speeds',
  gaps: 'Gaps',
  weather: 'Weather',
  all: 'All',
}

/** Column keys shown per preset, Driver always first. `all` reuses the
 *  catalogue's own key order (Driver is its first entry too) rather than
 *  repeating the full 26-column list a second time. */
const PRESET_COLUMNS: Record<DatasetPreset, ColumnKey[]> = {
  timing: ['Driver', 'LapNumber', 'Stint', 'Position', 'LapTime_s', 'FuelAdjustedLapTime'],
  tyres: [
    'Driver',
    'Compound',
    'TyreLife',
    'TyreAge',
    'FreshTyre',
    'CompoundID',
    'DegradationRate',
    'FuelAdjustedDegAbsolute',
    'FuelAdjustedDegPercent',
  ],
  speeds: ['Driver', 'LapNumber', 'SpeedI1', 'SpeedI2', 'SpeedFL', 'SpeedST'],
  gaps: [
    'Driver',
    'LapNumber',
    'GapToCarAhead',
    'GapToCarBehind',
    'consistent_gap_ahead_laps',
    'consistent_gap_behind_laps',
  ],
  weather: ['Driver', 'LapNumber', 'AirTemp', 'TrackTemp'],
  all: Object.keys(COLUMN_SPECS) as ColumnKey[],
}

/** Round a display number to 3dp; whole numbers (lap counts, positions) stay
 *  bare so "Lap 12" doesn't read as "Lap 12.000". */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

/** Render one cell's content per its column kind. Null/blank always collapses
 *  to an em dash rather than a raw "null"/empty cell — the guard runs first
 *  so it applies uniformly across every kind, including `false` booleans
 *  which must NOT be caught by it (`false == null` is false, so they aren't). */
function renderCell(kind: ColumnKind, value: unknown): ReactNode {
  if (value == null || value === '') return <span className="text-fg-3">{DASH}</span>
  switch (kind) {
    case 'compound':
      return typeof value === 'string' ? <CompoundPill compound={value} /> : DASH
    case 'boolean':
      return <Pill tone={value ? 'success' : 'neutral'}>{value ? 'Fresh' : 'Used'}</Pill>
    case 'number':
      return typeof value === 'number' ? (
        <div className="text-right font-mono tabular-nums">{formatNumber(value)}</div>
      ) : (
        DASH
      )
    default:
      return String(value)
  }
}

/** Build the react-table column defs for one preset. `accessorKey` keeps
 *  `cell.getValue()` returning the raw field value, so DataTable's CSV export
 *  (which reads `getValue()`, not the rendered `cell`) still exports real
 *  numbers/booleans rather than the display strings. */
function buildColumns(preset: DatasetPreset): ColumnDef<RaceRecord, unknown>[] {
  return PRESET_COLUMNS[preset].map((key): ColumnDef<RaceRecord, unknown> => {
    const spec = COLUMN_SPECS[key]
    return {
      id: key,
      accessorKey: key,
      header: spec.label,
      size: COLUMN_WIDTH[spec.kind],
      cell: (info) => renderCell(spec.kind, info.getValue()),
    }
  })
}

export function DatasetPanel({ rows, selectedDrivers }: DatasetPanelProps) {
  const preset = useRaceStore((s) => s.datasetPreset)
  const setPreset = useRaceStore((s) => s.setDatasetPreset)
  const scope = useRaceStore((s) => s.datasetScope)
  const setScope = useRaceStore((s) => s.setDatasetScope)

  const scopedRows = useMemo(() => {
    if (scope === 'selected' && selectedDrivers.length > 0) {
      return rows.filter((row) => selectedDrivers.includes(row.Driver))
    }
    return rows
  }, [rows, scope, selectedDrivers])

  const columns = useMemo(() => buildColumns(preset), [preset])

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No dataset loaded"
        description="Load a race or drop a local CSV/parquet file to explore its full dataset."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={preset} onValueChange={(value) => setPreset(value as DatasetPreset)}>
          <TabsList variant="segmented">
            {DATASET_PRESETS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {PRESET_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs value={scope} onValueChange={(value) => setScope(value as DatasetScope)}>
          <TabsList variant="segmented">
            <TabsTrigger value="all">All drivers</TabsTrigger>
            <TabsTrigger value="selected">Selected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <p className="font-mono text-xs text-fg-3">
        {scopedRows.length.toLocaleString()} rows · {columns.length} columns
      </p>

      <DataTable
        columns={columns}
        data={scopedRows}
        height={TABLE_HEIGHT_PX}
        csvFilename="race-dataset.csv"
      />
    </div>
  )
}
