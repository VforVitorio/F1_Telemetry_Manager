// Dataset tab — the full featured frame in a virtualized table with
// column-group presets (fewer than the whole 26+ columns at once) plus an
// All/Selected scope toggle and CSV export. `DataTable` already renders
// numeric cells in tabular mono figures; this panel is only responsible for
// choosing which columns show per preset and dressing up cell content
// (compound identity dot, boolean text, null formatting, right-aligned
// numbers) on top of that.

import { useMemo, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { tireColors } from '@/charts/echartsTheme'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import type { RaceRecord } from '@/lib/api/race'
import { compoundLabel, compoundVariant } from '@/lib/compounds'
import { DATASET_PRESETS, useRaceStore, type DatasetPreset, type DatasetScope } from '../store'

export interface DatasetPanelProps {
  /** The whole loaded frame (the panel applies its own All/Selected scope). */
  rows: RaceRecord[]
  /** Driver codes currently selected in the context bar. */
  selectedDrivers: string[]
}

const DASH = '—'
const TABLE_HEIGHT_PX = 560

// Presets at or under this many columns hug their own width instead of
// stretching across the card (see the `DataTable` wrapper below); the `all`
// preset sits far above it and keeps the full-width, scrollable layout.
const COMPACT_COLUMN_LIMIT = 9

const EYEBROW_CLASSNAME = 'mr-2 text-xs font-medium uppercase tracking-widest text-fg-3'

// ── Column catalogue ─────────────────────────────────────────────────────────
// One entry per RaceRecord field the Dataset tab can show: its display label
// and how its cell renders. Presets below just pick which keys to show, in
// which order — the label/kind live here once so they never drift apart.

type ColumnKind = 'text' | 'number' | 'compound' | 'boolean'
type ColumnKey = keyof RaceRecord

interface ColumnSpec {
  label: string
  kind: ColumnKind
  /** Decimal places to show for a `number` column. Omitted columns fall back
   *  to `DEFAULT_NUMBER_PRECISION` (3dp); coarse physical readings such as
   *  temperatures and fuel load look fake-precise at that default, so they
   *  override it to match the sensor's real resolution. */
  precision?: number
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
  FuelLoad: { label: 'Fuel Load (kg)', kind: 'number', precision: 2 },
  FuelAdjustedLapTime: { label: 'Fuel-Adj. Lap Time (s)', kind: 'number' },
  FuelAdjustedDegAbsolute: { label: 'Fuel-Adj. Deg (abs)', kind: 'number' },
  FuelAdjustedDegPercent: { label: 'Fuel-Adj. Deg (%)', kind: 'number' },
  DegradationRate: { label: 'Deg. Rate (s/lap)', kind: 'number' },
  AirTemp: { label: 'Air Temp (°C)', kind: 'number', precision: 1 },
  TrackTemp: { label: 'Track Temp (°C)', kind: 'number', precision: 1 },
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
  // `GP_Name` is dropped here: a loaded frame is always a single Grand Prix,
  // so the column would repeat one value for every row, and the context bar
  // above the table already names the GP.
  all: (Object.keys(COLUMN_SPECS) as ColumnKey[]).filter((key) => key !== 'GP_Name'),
}

const DEFAULT_NUMBER_PRECISION = 3

/** Round a display number to its column's precision (default 3dp); whole
 *  numbers (lap counts, positions) stay bare so "Lap 12" doesn't read as
 *  "Lap 12.000". */
function formatNumber(value: number, precision: number = DEFAULT_NUMBER_PRECISION): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(precision)
}

/** Render a compound value as a small identity dot plus its label, rather
 *  than a saturated pill — a table with hundreds of rows reads better quiet,
 *  and the driver's compound colour is already carried by the stint gantt and
 *  the compound legend above the table. An unrecognised compound string falls
 *  back to plain text with no dot, matching how `CompoundPill` treats it. */
function renderCompoundCell(value: string): ReactNode {
  const variant = compoundVariant(value)
  if (!variant) return compoundLabel(value)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: tireColors[variant] }} />
      {compoundLabel(value)}
    </span>
  )
}

/** Render one cell's content per its column kind. Null/blank always collapses
 *  to an em dash rather than a raw "null"/empty cell — the guard runs first
 *  so it applies uniformly across every kind, including `false` booleans
 *  which must NOT be caught by it (`false == null` is false, so they aren't). */
function renderCell(spec: ColumnSpec, value: unknown): ReactNode {
  if (value == null || value === '') return <span className="text-fg-3">{DASH}</span>
  switch (spec.kind) {
    case 'compound':
      return typeof value === 'string' ? renderCompoundCell(value) : DASH
    case 'boolean':
      // Plain text keeps this an information surface rather than a rail of
      // status pills; "Used" is dimmed since "Fresh" is the state worth
      // noticing at a glance.
      return value ? 'Fresh' : <span className="text-fg-3">Used</span>
    case 'number':
      // Alignment and mono/tabular-nums figures both come from the cell's
      // `<td>` in DataTable (via `meta.align` and its numeric-value check) —
      // this case only needs to return the formatted text.
      return typeof value === 'number' ? formatNumber(value, spec.precision) : DASH
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
      meta: spec.kind === 'number' ? { align: 'right' } : undefined,
      cell: (info) => renderCell(spec, info.getValue()),
    }
  })
}

export function DatasetPanel({ rows, selectedDrivers }: DatasetPanelProps) {
  const preset = useRaceStore((s) => s.datasetPreset)
  const setPreset = useRaceStore((s) => s.setDatasetPreset)
  const scope = useRaceStore((s) => s.datasetScope)
  const setScope = useRaceStore((s) => s.setDatasetScope)

  const noDriversSelected = selectedDrivers.length === 0

  const scopedRows = useMemo(() => {
    if (scope === 'selected' && selectedDrivers.length > 0) {
      return rows.filter((row) => selectedDrivers.includes(row.Driver))
    }
    return rows
  }, [rows, scope, selectedDrivers])

  // "Selected" showing active while nothing is picked would lie about what's
  // on screen (the table falls back to the whole field). Displaying "all" as
  // the active segment in that case keeps the toggle honest about what it's
  // actually showing, without discarding the user's stored preference.
  const displayedScope: DatasetScope = scope === 'selected' && noDriversSelected ? 'all' : scope

  const columns = useMemo(() => buildColumns(preset), [preset])
  const isCompactPreset = columns.length <= COMPACT_COLUMN_LIMIT

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
        <div className="flex flex-wrap items-center">
          <span className={EYEBROW_CLASSNAME}>Columns</span>
          <Tabs value={preset} onValueChange={(value) => setPreset(value as DatasetPreset)}>
            <TabsList variant="segmented">
              {DATASET_PRESETS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {PRESET_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Tabs value={displayedScope} onValueChange={(value) => setScope(value as DatasetScope)}>
          <TabsList variant="segmented">
            <TabsTrigger value="all">All drivers</TabsTrigger>
            <TabsTrigger
              value="selected"
              disabled={noDriversSelected}
              title={noDriversSelected ? 'Pick drivers first' : undefined}
            >
              Selected
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <p className="font-mono text-xs text-fg-3">
        {scopedRows.length.toLocaleString()} rows · {columns.length} columns
      </p>

      {/* A compact preset (a handful of columns) hugs its own width so values
          stay packed together; the wide `all` preset keeps the normal
          full-width, horizontally-scrollable layout. */}
      <DataTable
        columns={columns}
        data={scopedRows}
        height={TABLE_HEIGHT_PX}
        csvFilename="race-dataset.csv"
        fitContent={isCompactPreset}
      />
    </div>
  )
}
