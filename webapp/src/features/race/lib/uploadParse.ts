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

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const MAX_UPLOAD_ROWS = 25_000
export const MAX_UPLOAD_COLUMNS = 128
export const MAX_PARQUET_UNCOMPRESSED_BYTES = 64 * 1024 * 1024

const MAX_TEXT_CELL_CHARS = 512
const MAX_PARQUET_FOOTER_BYTES = 4 * 1024 * 1024
const MAX_PARQUET_COLLECTION_ITEMS = 25_000
const MAX_PARQUET_COMPACT_ITEMS = 100_000
const MAX_PARQUET_ROW_GROUPS = 256
const MAX_PARQUET_PAGE_HEADER_BYTES = 64 * 1024
const MAX_PARQUET_PAGES = 65_536
const TEXT_COLUMNS = ['Driver', 'Compound', 'Team', 'GP_Name'] as const

type ParquetSchemaNode = {
  children: ParquetSchemaNode[]
  path: string[]
}

type ParquetSchemaElement = { num_children?: number }

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

function rejectOversizedText(row: RawRow): string | null {
  for (const column of TEXT_COLUMNS) {
    const value = row[column]
    if (typeof value === 'string' && value.length > MAX_TEXT_CELL_CHARS) {
      return `The ${column} cell exceeds ${MAX_TEXT_CELL_CHARS} characters.`
    }
  }
  return null
}

function parquetLeafColumns(node: ParquetSchemaNode): string[] {
  if (node.children.length === 0) return node.path.length > 0 ? [node.path.join('.')] : []
  return node.children.flatMap(parquetLeafColumns)
}

function flatParquetColumnCount(schema: ParquetSchemaElement[]): number {
  if (
    !Array.isArray(schema) ||
    schema.length < 2 ||
    schema.length > MAX_UPLOAD_COLUMNS + 1 ||
    schema[0].num_children !== schema.length - 1 ||
    schema.slice(1).some((element) => (element.num_children ?? 0) !== 0)
  ) {
    throw new Error('The parquet schema must contain flat race-data columns.')
  }
  return schema.length - 1
}

export function validateParquetShape(
  rowCount: bigint,
  columnCount: number,
  uncompressedBytes: bigint,
): void {
  if (rowCount < 0n || uncompressedBytes < 0n || !Number.isSafeInteger(columnCount)) {
    throw new Error('The parquet file has invalid metadata.')
  }
  if (rowCount > BigInt(MAX_UPLOAD_ROWS)) {
    throw new Error(`The parquet file exceeds the ${MAX_UPLOAD_ROWS}-row limit.`)
  }
  if (columnCount > MAX_UPLOAD_COLUMNS) {
    throw new Error(`The parquet file exceeds the ${MAX_UPLOAD_COLUMNS}-column limit.`)
  }
  if (uncompressedBytes > BigInt(MAX_PARQUET_UNCOMPRESSED_BYTES)) {
    throw new Error(
      `The parquet file exceeds the ${MAX_PARQUET_UNCOMPRESSED_BYTES / 1024 / 1024} MB uncompressed-data limit.`,
    )
  }
}

type CompactLimits = {
  maxCollectionItems: number
  maxItems: number
  maxBinaryBytes: number
}

const FOOTER_LIMITS: CompactLimits = {
  maxCollectionItems: MAX_PARQUET_COLLECTION_ITEMS,
  maxItems: MAX_PARQUET_COMPACT_ITEMS,
  maxBinaryBytes: MAX_PARQUET_FOOTER_BYTES,
}
const PAGE_LIMITS: CompactLimits = {
  maxCollectionItems: 256,
  maxItems: 2_048,
  maxBinaryBytes: MAX_PARQUET_PAGE_HEADER_BYTES,
}

function preflightCompactStruct(
  view: DataView,
  start: number,
  end: number,
  limits: CompactLimits,
): number {
  const state = { offset: start, items: 0 }
  const readByte = (): number => {
    if (state.offset >= end) throw new Error('The parquet metadata is truncated.')
    return view.getUint8(state.offset++)
  }
  const readVarInt = (): bigint => {
    let value = 0n
    for (let index = 0; index < 10; index += 1) {
      const byte = readByte()
      value |= BigInt(byte & 0x7f) << BigInt(index * 7)
      if ((byte & 0x80) === 0) return value
    }
    throw new Error('The parquet metadata contains an invalid integer.')
  }
  const countItem = (count = 1): void => {
    state.items += count
    if (state.items > limits.maxItems) {
      throw new Error('The parquet metadata contains too many fields.')
    }
  }

  const skipStruct = (depth: number): void => {
    if (depth > 32) throw new Error('The parquet metadata is nested too deeply.')
    while (true) {
      const fieldHeader = readByte()
      const type = fieldHeader & 0x0f
      if (type === 0) return
      countItem()
      if (fieldHeader >>> 4 === 0) readVarInt()
      skipValue(type, depth)
    }
  }

  const skipValue = (type: number, depth: number): void => {
    switch (type) {
      case 1:
      case 2:
        return
      case 3:
        readByte()
        return
      case 4:
      case 5:
      case 6:
        readVarInt()
        return
      case 7:
        if (state.offset + 8 > end) throw new Error('The parquet metadata is truncated.')
        state.offset += 8
        return
      case 8: {
        const length = readVarInt()
        if (length > BigInt(limits.maxBinaryBytes) || length > BigInt(end - state.offset)) {
          throw new Error('The parquet metadata contains an oversized value.')
        }
        state.offset += Number(length)
        return
      }
      case 9:
      case 10: {
        const listHeader = readByte()
        const elementType = listHeader & 0x0f
        let length = BigInt(listHeader >>> 4)
        if (length === 15n) length = readVarInt()
        if (length > BigInt(limits.maxCollectionItems) || elementType === 0) {
          throw new Error('The parquet metadata contains an oversized collection.')
        }
        const count = Number(length)
        countItem(count)
        const valueType = elementType === 1 || elementType === 2 ? 3 : elementType
        for (let index = 0; index < count; index += 1) skipValue(valueType, depth + 1)
        return
      }
      case 11: {
        const length = readVarInt()
        if (length > BigInt(limits.maxCollectionItems)) {
          throw new Error('The parquet metadata contains an oversized collection.')
        }
        const count = Number(length)
        if (count === 0) return
        const mapTypes = readByte()
        const keyType = mapTypes >>> 4
        const valueType = mapTypes & 0x0f
        countItem(count * 2)
        for (let index = 0; index < count; index += 1) {
          skipValue(keyType, depth + 1)
          skipValue(valueType, depth + 1)
        }
        return
      }
      case 12:
        skipStruct(depth + 1)
        return
      default:
        throw new Error('The parquet metadata contains an unsupported field type.')
    }
  }

  skipStruct(0)
  return state.offset
}

export function preflightParquetFooter(buffer: ArrayBuffer): number {
  const view = new DataView(buffer)
  if (view.byteLength < 12 || view.getUint32(0, true) !== 0x31524150) {
    throw new Error('The parquet file has an invalid header.')
  }
  if (view.getUint32(view.byteLength - 4, true) !== 0x31524150) {
    throw new Error('The parquet file has an invalid footer.')
  }
  const footerLength = view.getUint32(view.byteLength - 8, true)
  if (footerLength > MAX_PARQUET_FOOTER_BYTES || footerLength > view.byteLength - 12) {
    throw new Error('The parquet footer exceeds the metadata limit.')
  }
  const footerStart = view.byteLength - 8 - footerLength
  const footerEnd = view.byteLength - 8
  if (preflightCompactStruct(view, footerStart, footerEnd, FOOTER_LIMITS) !== footerEnd) {
    throw new Error('The parquet footer contains trailing data.')
  }
  return footerStart
}

type ParquetPageDeserializer = (reader: { view: DataView; offset: number }) => Record<string, any>

type ParquetColumnMetadata = {
  data_page_offset?: bigint | number
  dictionary_page_offset?: bigint | number
  total_compressed_size?: bigint | number
}

type ParquetRowGroupMetadata = {
  num_rows?: bigint | number
  columns?: Array<{ file_path?: string | null; meta_data?: ParquetColumnMetadata }>
}

function nonNegativeInteger(value: bigint | number | undefined, name: string): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  throw new Error(`The parquet file has invalid ${name} metadata.`)
}

export function preflightParquetPages(
  buffer: ArrayBuffer,
  footerStart: number,
  rowCount: bigint,
  rowGroups: ParquetRowGroupMetadata[],
  columnCount: number,
  deserializeCompact: ParquetPageDeserializer,
): bigint {
  if (!Array.isArray(rowGroups) || rowGroups.length > MAX_PARQUET_ROW_GROUPS) {
    throw new Error('The parquet file contains too many row groups.')
  }
  const metadataRows = rowGroups.reduce(
    (total, group) => total + nonNegativeInteger(group.num_rows, 'row-group row-count'),
    0n,
  )
  if (metadataRows !== rowCount) throw new Error('The parquet row counts are inconsistent.')

  const view = new DataView(buffer)
  let totalUncompressed = 0n
  let totalPages = 0
  for (const group of rowGroups) {
    const groupRows = nonNegativeInteger(group.num_rows, 'row-group row-count')
    if (!Array.isArray(group.columns) || group.columns.length !== columnCount) {
      throw new Error('The parquet row-group columns are inconsistent.')
    }
    for (const column of group.columns) {
      const metadata = column.meta_data
      if (column.file_path || !metadata) {
        throw new Error('The parquet file contains an external column chunk.')
      }
      const chunkStart = nonNegativeInteger(
        metadata.dictionary_page_offset ?? metadata.data_page_offset,
        'column offset',
      )
      const compressedSize = nonNegativeInteger(metadata.total_compressed_size, 'column size')
      const chunkEnd = chunkStart + compressedSize
      if (
        compressedSize === 0n ||
        chunkStart < 4n ||
        chunkEnd > BigInt(footerStart) ||
        chunkEnd > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        throw new Error('The parquet file contains an invalid column chunk range.')
      }

      let offset = Number(chunkStart)
      const end = Number(chunkEnd)
      let dataPageValues = 0n
      while (offset < end) {
        totalPages += 1
        if (totalPages > MAX_PARQUET_PAGES) {
          throw new Error('The parquet file contains too many data pages.')
        }
        const pageHeaderEnd = preflightCompactStruct(
          view,
          offset,
          Math.min(end, offset + MAX_PARQUET_PAGE_HEADER_BYTES),
          PAGE_LIMITS,
        )
        const pageHeader = buffer.slice(offset, pageHeaderEnd)
        const reader = { view: new DataView(pageHeader), offset: 0 }
        const header = deserializeCompact(reader)
        if (reader.offset !== pageHeader.byteLength) {
          throw new Error('The parquet page header is malformed.')
        }
        const pageType = header.field_1
        const uncompressedSize = nonNegativeInteger(header.field_2, 'page size')
        const compressedPageSize = nonNegativeInteger(header.field_3, 'compressed page size')
        if (![0, 2, 3].includes(pageType)) {
          throw new Error('The parquet page type is unsupported.')
        }
        if (uncompressedSize > BigInt(MAX_PARQUET_UNCOMPRESSED_BYTES)) {
          throw new Error(
            `The parquet file exceeds the ${MAX_PARQUET_UNCOMPRESSED_BYTES / 1024 / 1024} MB uncompressed-data limit.`,
          )
        }
        const pageValues =
          pageType === 0
            ? header.field_5?.field_1
            : pageType === 2
              ? header.field_7?.field_1
              : header.field_8?.field_1
        const pageValueCount = nonNegativeInteger(pageValues, 'page value-count')
        if (pageValueCount > groupRows) {
          throw new Error('The parquet page exceeds the row limit.')
        }
        if (pageType !== 2) dataPageValues += pageValueCount
        totalUncompressed += uncompressedSize
        if (totalUncompressed > BigInt(MAX_PARQUET_UNCOMPRESSED_BYTES)) {
          throw new Error(
            `The parquet file exceeds the ${MAX_PARQUET_UNCOMPRESSED_BYTES / 1024 / 1024} MB uncompressed-data limit.`,
          )
        }

        const nextOffset = BigInt(pageHeaderEnd) + compressedPageSize
        if (nextOffset > chunkEnd || nextOffset <= BigInt(offset)) {
          throw new Error('The parquet page exceeds its column chunk.')
        }
        offset = Number(nextOffset)
      }
      if (offset !== end) throw new Error('The parquet column chunk is malformed.')
      if (dataPageValues !== groupRows) {
        throw new Error('The parquet data-page row counts are inconsistent.')
      }
    }
  }
  return totalUncompressed
}

// ── Raw parsing (CSV / parquet → plain row objects) ──────────────────────────

/** Parse a CSV File with papaparse: the header row becomes the object keys,
 *  dynamicTyping recovers numbers/booleans from strings (see the `bool()`
 *  caveat above for the one case it misses). */
function parseCsvRows(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const rows: RawRow[] = []
    let rejection: Error | null = null

    Papa.parse<RawRow>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 1024,
      step: (result, parser) => {
        const fields = result.meta.fields ?? []
        const fail = (message: string) => {
          rejection = new Error(message)
          parser.abort()
        }

        if (fields.length > MAX_UPLOAD_COLUMNS) {
          fail(`The CSV exceeds the ${MAX_UPLOAD_COLUMNS}-column limit.`)
          return
        }
        if (result.errors.length > 0) {
          fail('The CSV contains a malformed row.')
          return
        }
        if (rows.length >= MAX_UPLOAD_ROWS) {
          fail(`The CSV exceeds the ${MAX_UPLOAD_ROWS}-row limit.`)
          return
        }

        const cellError = rejectOversizedText(result.data)
        if (cellError) {
          fail(cellError)
          return
        }
        rows.push(result.data)
      },
      complete: () => (rejection ? reject(rejection) : resolve(rows)),
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
  const { parquetMetadata, parquetReadObjects, parquetSchema } = await import('hyparquet')
  const { deserializeTCompactProtocol } = await import('hyparquet/src/thrift.js')
  const buffer = await file.arrayBuffer()
  const footerStart = preflightParquetFooter(buffer)
  const metadata = parquetMetadata(buffer)
  const columnCount = flatParquetColumnCount(metadata.schema)
  validateParquetShape(metadata.num_rows, columnCount, 0n)
  const uncompressedBytes = preflightParquetPages(
    buffer,
    footerStart,
    metadata.num_rows,
    metadata.row_groups,
    columnCount,
    deserializeTCompactProtocol,
  )
  const leafColumns = parquetLeafColumns(parquetSchema(metadata) as ParquetSchemaNode)
  validateParquetShape(metadata.num_rows, leafColumns.length, uncompressedBytes)

  const recordColumns = Object.keys(toRaceRecord({}))
  const columns = recordColumns.filter((column) => leafColumns.includes(column))
  if (columns.length === 0) {
    throw new Error('The parquet file has no supported race-data columns.')
  }

  return parquetReadObjects({
    file: buffer,
    metadata,
    columns,
    rowStart: 0,
    rowEnd: Number(metadata.num_rows),
  })
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
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`The file exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`)
  }

  const extension = file.name.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'parquet') {
    throw new Error('Choose a CSV or parquet file.')
  }

  const isParquet = extension === 'parquet'
  const rawRows = isParquet ? await parseParquetRows(file) : await parseCsvRows(file)
  const records = rawRows.map(toRaceRecord)
  const longTextRecord = records.find((record) =>
    TEXT_COLUMNS.some((column) => record[column].length > MAX_TEXT_CELL_CHARS),
  )
  if (longTextRecord) {
    throw new Error(`Text cells must not exceed ${MAX_TEXT_CELL_CHARS} characters.`)
  }

  const withLaps = columnIsMissing(records, 'LapNumber') ? addRaceLapColumn(records) : records
  const hasGapColumns =
    !columnIsMissing(withLaps, 'consistent_gap_ahead_laps') ||
    !columnIsMissing(withLaps, 'consistent_gap_behind_laps')
  return hasGapColumns ? withLaps : calculateGapConsistency(withLaps)
}
