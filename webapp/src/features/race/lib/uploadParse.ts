// Client-side offline dataset import for the Race Analysis Dataset tab. Parses
// a dropped CSV or parquet file into RaceRecord[] entirely in the browser — no
// network round trip, so an engineer can explore a hand-edited or
// not-yet-published race frame. CSV goes through papaparse; parquet is read
// lazily via hyparquet so the parser only enters the bundle when a .parquet
// file is actually dropped.
//
// Raw file formats are less forgiving than the backend's `/telemetry/race-data`
// response: a parquet INT64 column with no null mask surfaces as a JS `bigint`,
// and a pandas `to_csv()` boolean is capitalised ("True"/"False", not
// papaparse's recognised "true"/"false") — the coercion below normalises both
// before the frame reaches the rest of the Race feature.

import Papa from 'papaparse'
import type { RaceRecord } from '@/lib/api/race'
import { addRaceLapColumn, calculateGapConsistency } from './raceFrame'

type RawRow = Record<string, unknown>

// ── Field coercion ────────────────────────────────────────────────────────────
// Mirrors lib/api/race.ts's toRaceRecord, but tolerant of the extra raw shapes
// a CSV/parquet parser produces that the backend never sends.

/** A parquet INT64 column with no null mask surfaces as `bigint`; a stray
 *  float NaN (a parquet file that stored missing data as literal NaN rather
 *  than a null definition level) must collapse to the same `null` a blank
 *  cell already produces. */
function numOrNull(value: unknown): number | null {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  return null
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

/** Papa's dynamicTyping only recognises lowercase/UPPERCASE "true"/"false" —
 *  pandas `to_csv()` writes booleans capitalised ("True"/"False"), which would
 *  otherwise survive as an untouched string. Parquet BOOLEAN columns already
 *  arrive as real JS booleans. */
function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return false
}

function toRaceRecord(raw: RawRow): RaceRecord {
  return {
    Driver: str(raw.Driver),
    DriverNumber: numOrNull(raw.DriverNumber),
    LapNumber: numOrNull(raw.LapNumber),
    Stint: numOrNull(raw.Stint),
    SpeedI1: numOrNull(raw.SpeedI1),
    SpeedI2: numOrNull(raw.SpeedI2),
    SpeedFL: numOrNull(raw.SpeedFL),
    SpeedST: numOrNull(raw.SpeedST),
    Compound: str(raw.Compound),
    TyreLife: numOrNull(raw.TyreLife),
    TyreAge: numOrNull(raw.TyreAge),
    FreshTyre: bool(raw.FreshTyre),
    Team: str(raw.Team),
    Position: numOrNull(raw.Position),
    CompoundID: numOrNull(raw.CompoundID),
    LapTime_s: numOrNull(raw.LapTime_s),
    FuelLoad: numOrNull(raw.FuelLoad),
    FuelAdjustedLapTime: numOrNull(raw.FuelAdjustedLapTime),
    FuelAdjustedDegAbsolute: numOrNull(raw.FuelAdjustedDegAbsolute),
    FuelAdjustedDegPercent: numOrNull(raw.FuelAdjustedDegPercent),
    DegradationRate: numOrNull(raw.DegradationRate),
    AirTemp: numOrNull(raw.AirTemp),
    TrackTemp: numOrNull(raw.TrackTemp),
    GP_Name: str(raw.GP_Name),
    GapToCarAhead: numOrNull(raw.GapToCarAhead),
    GapToCarBehind: numOrNull(raw.GapToCarBehind),
    consistent_gap_ahead_laps: numOrNull(raw.consistent_gap_ahead_laps),
    consistent_gap_behind_laps: numOrNull(raw.consistent_gap_behind_laps),
  }
}

// ── Raw parsing (CSV / parquet → plain row objects) ──────────────────────────

/** Parse a CSV File with papaparse: the header row becomes the object keys,
 *  dynamicTyping recovers numbers/booleans from strings (see the `bool()`
 *  caveat above for the one case it misses). */
function parseCsvRows(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    })
  })
}

/** Parse a parquet File with hyparquet, imported lazily so its parser never
 *  ships in the initial bundle for users who only ever load races from the
 *  backend. A plain `ArrayBuffer` satisfies hyparquet's `AsyncBuffer` duck
 *  type directly (it has `byteLength` plus a synchronous `slice()`), so no
 *  `asyncBufferFromFile` wrapper is needed for an in-memory browser File. */
async function parseParquetRows(file: File): Promise<RawRow[]> {
  const { parquetReadObjects } = await import('hyparquet')
  const buffer = await file.arrayBuffer()
  return parquetReadObjects({ file: buffer })
}

// ── Derived-column backfill (upload-only — the backend already ships these) ──

/** Is every row null for this column? An uploaded frame either carries real
 *  values throughout one of these two derived columns or none at all — there
 *  is no meaningful partial case, so "all null" is the "missing" signal. */
function columnIsMissing(rows: RaceRecord[], key: keyof RaceRecord): boolean {
  return rows.every((row) => row[key] == null)
}

/**
 * Parse a dropped CSV or parquet file into the Dataset tab's RaceRecord[],
 * entirely client-side. Backfills the two columns the backend derives
 * server-side (`LapNumber`, the gap-consistency run-lengths) when the
 * uploaded frame doesn't already carry them — see `lib/raceFrame.ts` for the
 * actual math (ported from `frontend/utils/race_processing.py`).
 */
export async function parseUploadedFile(file: File): Promise<RaceRecord[]> {
  const isParquet = file.name.toLowerCase().endsWith('.parquet')
  const rawRows = isParquet ? await parseParquetRows(file) : await parseCsvRows(file)
  const records = rawRows.map(toRaceRecord)

  const withLaps = columnIsMissing(records, 'LapNumber') ? addRaceLapColumn(records) : records
  const hasGapColumns =
    !columnIsMissing(withLaps, 'consistent_gap_ahead_laps') ||
    !columnIsMissing(withLaps, 'consistent_gap_behind_laps')
  return hasGapColumns ? withLaps : calculateGapConsistency(withLaps)
}
