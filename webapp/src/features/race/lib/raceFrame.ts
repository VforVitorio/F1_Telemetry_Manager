// Pure ports of frontend/utils/race_processing.py — the derived race-frame maths
// the Race Analysis tab needs. Two of the three (LapNumber, gap consistency) run
// ONLY on uploaded frames (the backend `/race-data` already provides them);
// strategic windows are always derived client-side.
//
// IMPORTANT null semantics: the Python relied on pandas treating `NaN < 2.0` as
// False. In TS a bare `null < 2` coerces null→0 and returns TRUE, so every gap
// comparison here guards `gap != null` first. Missing this is the classic port
// bug ([[reference_echarts_gotchas]] neighbour — verify ports against the source).

import type { RaceRecord } from '@/lib/api/race'

const UNDERCUT_MAX = 2.0
const OVERCUT_MAX = 3.5
const DEFENSIVE_MAX = 2.0
const CONSISTENCY_MIN = 3

// ── LapNumber from stint lengths (upload-only) ───────────────────────────────

/**
 * Reconstruct the real race LapNumber = (sum of previous stint lengths) +
 * current TyreAge, per driver. A stint's length is the max TyreAge seen in it.
 * Uploaded parquet/CSV frames often lack LapNumber; the backend feed already has
 * it, so this runs only on uploads.
 */
export function addRaceLapColumn(rows: RaceRecord[]): RaceRecord[] {
  // max TyreAge per (driver, stint) = that stint's length.
  const stintLength = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.DriverNumber}|${row.Stint}`
    const age = row.TyreAge ?? 0
    stintLength.set(key, Math.max(stintLength.get(key) ?? 0, age))
  }

  // cumulative offset per (driver, stint), walking stints in ascending order.
  const offset = new Map<string, number>()
  const stintsByDriver = new Map<number | null, number[]>()
  for (const [key] of stintLength) {
    const [driverStr, stintStr] = key.split('|')
    const driver = driverStr === 'null' ? null : Number(driverStr)
    const stint = Number(stintStr)
    const list = stintsByDriver.get(driver) ?? []
    list.push(stint)
    stintsByDriver.set(driver, list)
  }
  for (const [driver, stints] of stintsByDriver) {
    let acc = 0
    for (const stint of [...stints].sort((a, b) => a - b)) {
      offset.set(`${driver}|${stint}`, acc)
      acc += stintLength.get(`${driver}|${stint}`) ?? 0
    }
  }

  return rows.map((row) => {
    const base = offset.get(`${row.DriverNumber}|${row.Stint}`) ?? 0
    return { ...row, LapNumber: base + (row.TyreAge ?? 0) }
  })
}

// ── Gap-window consistency (upload-only) ─────────────────────────────────────

export type AheadWindow = 'unknown' | 'undercut_window' | 'overcut_window' | 'out_of_range'
export type BehindWindow = 'unknown' | 'defensive_window' | 'safe_window'

export function aheadWindow(gap: number | null): AheadWindow {
  if (gap == null) return 'unknown'
  if (gap < UNDERCUT_MAX) return 'undercut_window'
  if (gap < OVERCUT_MAX) return 'overcut_window'
  return 'out_of_range'
}
export function behindWindow(gap: number | null): BehindWindow {
  if (gap == null) return 'unknown'
  if (gap < DEFENSIVE_MAX) return 'defensive_window'
  return 'safe_window'
}

/**
 * Count consecutive laps a driver stays in the same ahead/behind gap window,
 * filling `consistent_gap_ahead_laps` / `consistent_gap_behind_laps` (run-length,
 * min 1). Per driver, ordered by LapNumber. Runs only on uploads — the backend
 * already ships these columns.
 */
export function calculateGapConsistency(rows: RaceRecord[]): RaceRecord[] {
  const out = rows.map((row) => ({ ...row }))
  const byDriver = new Map<number | null, RaceRecord[]>()
  for (const row of out) {
    const list = byDriver.get(row.DriverNumber) ?? []
    list.push(row)
    byDriver.set(row.DriverNumber, list)
  }
  for (const driverRows of byDriver.values()) {
    driverRows.sort((a, b) => (a.LapNumber ?? 0) - (b.LapNumber ?? 0))
    let aheadRun = 1
    let behindRun = 1
    let prevAhead: AheadWindow | null = null
    let prevBehind: BehindWindow | null = null
    for (const row of driverRows) {
      const a = aheadWindow(row.GapToCarAhead)
      const b = behindWindow(row.GapToCarBehind)
      aheadRun = prevAhead != null && a === prevAhead ? aheadRun + 1 : 1
      behindRun = prevBehind != null && b === prevBehind ? behindRun + 1 : 1
      row.consistent_gap_ahead_laps = aheadRun
      row.consistent_gap_behind_laps = behindRun
      prevAhead = a
      prevBehind = b
    }
  }
  return out
}

// ── Strategic windows (always client-side) ───────────────────────────────────

export type StintPhase = 'early' | 'mid' | 'late' | null

/** Per-lap strategic flags, aligned 1:1 with the input rows. */
export interface RaceStrategicWindow {
  driverNumber: number | null
  driver: string
  lapNumber: number | null
  undercutOpportunity: boolean
  overcutOpportunity: boolean
  defensiveNeeded: boolean
  stintPhase: StintPhase
}

/**
 * Flag undercut / overcut / defensive opportunities per lap, plus the stint
 * phase (early/mid/late by thirds of the race). Requires the gap-consistency
 * columns (from the backend or `calculateGapConsistency`). Returns a parallel
 * array (same order as `rows`) so the caller can count per driver and highlight
 * the qualifying laps.
 */
export function calculateStrategicWindows(rows: RaceRecord[]): RaceStrategicWindow[] {
  let maxLap = 0
  for (const row of rows) {
    if (row.LapNumber != null && row.LapNumber > maxLap) maxLap = row.LapNumber
  }
  const early = Math.floor(maxLap / 3)
  const mid = early * 2

  const phaseOf = (lap: number | null): StintPhase => {
    if (lap == null || maxLap === 0) return null
    if (lap <= early) return 'early'
    if (lap <= mid) return 'mid'
    return 'late'
  }

  return rows.map((row) => {
    const ahead = row.GapToCarAhead
    const behind = row.GapToCarBehind
    const consAhead = row.consistent_gap_ahead_laps ?? 0
    const consBehind = row.consistent_gap_behind_laps ?? 0
    return {
      driverNumber: row.DriverNumber,
      driver: row.Driver,
      lapNumber: row.LapNumber,
      undercutOpportunity: ahead != null && ahead < UNDERCUT_MAX && consAhead >= CONSISTENCY_MIN,
      overcutOpportunity:
        ahead != null && ahead >= UNDERCUT_MAX && ahead < OVERCUT_MAX && consAhead >= CONSISTENCY_MIN,
      defensiveNeeded: behind != null && behind < DEFENSIVE_MAX && consBehind >= CONSISTENCY_MIN,
      stintPhase: phaseOf(row.LapNumber),
    }
  })
}
