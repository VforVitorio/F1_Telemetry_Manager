import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RaceRecord } from '@/lib/api/race'
import { ToastProvider } from '@/components/Toast'
import { RaceContextExtras } from '../components/RaceContextBar'
import { useRaceStore } from '../store'
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_COLUMNS,
  MAX_UPLOAD_ROWS,
  MAX_PARQUET_UNCOMPRESSED_BYTES,
  parseUploadedFile,
  preflightParquetPages,
  preflightParquetFooter,
  validateParquetShape,
} from './uploadParse'

afterEach(() => useRaceStore.getState().clearUpload())

const ONE_ROW_PARQUET_BASE64 =
  'UEFSMRUEFQ4VEkwVAhUAEgAABxgDAAAATk9SFQAVEhUWLBUCFRAVBhUGHDYAKANOT1IYA05PUhERAAAACSACAAAAAgEBAgAVBBUQFRRMFQIVABIAAAgcAAAAAACgVEAVABUSFRYsFQIVEBUGFQYcGAgAAAAAAKBUQBgIAAAAAACgVEAWACgIAAAAAACgVEAYCAAAAAAAoFRAEREAAAAJIAIAAAACAQECABUEFRIVFkwVAhUAEgAACSAFAAAATW9uemEVABUSFRYsFQIVEBUGFQYcNgAoBU1vbnphGAVNb256YRERAAAACSACAAAAAgEBAgAVBBlMNQAYBnNjaGVtYRUGABUMJQIYBkRyaXZlciUATBwAAAAVCiUCGAlMYXBUaW1lX3MAFQwlAhgHR1BfTmFtZSUATBwAAAAWAhkcGTwmABwVDBk1AAYQGRgGRHJpdmVyFQIWAhZ+FoYBJjYmCBw2ACgDTk9SGANOT1IREQAZLBUEFQAVAgAVABUQFQIAPBYGGQYZJgACAAAAJgAcFQoZNQAGEBkYCUxhcFRpbWVfcxUCFgIWvAEWxAEmvgEmjgEcGAgAAAAAAKBUQBgIAAAAAACgVEAWACgIAAAAAACgVEAYCAAAAAAAoFRAEREAGSwVBBUAFQIAFQAVEBUCADwpBhkmAAIAAAAmABwVDBk1AAYQGRgHR1BfTmFtZRUCFgIWigEWkgEmhAMm0gIcNgAoBU1vbnphGAVNb256YRERABksFQQVABUCABUAFRAVAgA8FgoZBhkmAAIAAAAWxAMWAiYIFtwDABkcGAxBUlJPVzpzY2hlbWEYrAIvLy8vLzlnQUFBQVFBQUFBQUFBS0FBd0FCZ0FGQUFnQUNnQUFBQUFCQkFBTUFBQUFDQUFJQUFBQUJBQUlBQUFBQkFBQUFBTUFBQUI0QUFBQU1BQUFBQVFBQUFDay8vLy9BQUFCQlJBQUFBQVlBQUFBQkFBQUFBQUFBQUFIQUFBQVJIQnBUbUZ0WlFDVS8vLy96UC8vL3dBQUFRTVFBQUFBSUFBQUFBUUFBQUFBQUFBQUNRQUFBRXhoY0ZScGJXVmZjd0FHQUFnQUJnQUdBQUFBQUFBQ0FCQUFGQUFJQUFZQUJ3QU1BQUFBRUFBUUFBQUFBQUFCQlJBQUFBQWNBQUFBQkFBQUFBQUFBQUFHQUFBQVJISnBkbVZ5QUFBRUFBUUFCQUFBQUFBQUFBQT0AGCBwYXJxdWV0LWNwcC1hcnJvdyB2ZXJzaW9uIDIzLjAuMRk8HAAAHAAAHAAAANUCAABQQVIx'

function csvFile(contents: string, name = 'race.csv'): File {
  return new File([contents], name, { type: 'text/csv' })
}

function encodeVarInt(value: bigint): number[] {
  const bytes: number[] = []
  while (value > 0x7fn) {
    bytes.push(Number(value & 0x7fn) | 0x80)
    value >>= 7n
  }
  bytes.push(Number(value))
  return bytes
}

function compactIntField(value: number): number[] {
  const integer = BigInt(value)
  const zigzag = integer < 0n ? -integer * 2n - 1n : integer * 2n
  return [0x15, ...encodeVarInt(zigzag)]
}

describe('parseUploadedFile', () => {
  it('parses a real CSV file into race records', async () => {
    const rows = await parseUploadedFile(csvFile('Driver,LapTime_s,GP_Name\nNOR,82.5,Monza\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ Driver: 'NOR', LapTime_s: 82.5, GP_Name: 'Monza' })
  })

  it('reads a small real parquet file and projects supported race columns', async () => {
    const bytes = Uint8Array.from(atob(ONE_ROW_PARQUET_BASE64), (char) => char.charCodeAt(0))
    const file = new File([bytes], 'race.parquet')

    const rows = await parseUploadedFile(file)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ Driver: 'NOR', LapTime_s: 82.5, GP_Name: 'Monza' })
  })

  it('rejects an oversized file before parsing it', async () => {
    const file = new File([''], 'large.parquet')
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    await expect(parseUploadedFile(file)).rejects.toThrow('exceeds the 25 MB limit')
  })

  it('stops CSV parsing when the header exceeds the column limit', async () => {
    const header = Array.from({ length: MAX_UPLOAD_COLUMNS + 1 }, (_, index) => `c${index}`).join(
      ',',
    )
    const row = Array.from({ length: MAX_UPLOAD_COLUMNS + 1 }, () => 'x').join(',')

    await expect(parseUploadedFile(csvFile(`${header}\n${row}\n`))).rejects.toThrow(
      `${MAX_UPLOAD_COLUMNS}-column limit`,
    )
  })

  it('stops CSV parsing after the row limit', async () => {
    const data = `Driver,LapTime_s\n${Array.from({ length: MAX_UPLOAD_ROWS + 1 }, () => 'NOR,82').join('\n')}`

    await expect(parseUploadedFile(csvFile(data))).rejects.toThrow(`${MAX_UPLOAD_ROWS}-row limit`)
  })

  it('rejects oversized text cells without retaining their contents', async () => {
    const tooLong = 'x'.repeat(513)

    await expect(parseUploadedFile(csvFile(`Driver,GP_Name\nNOR,${tooLong}\n`))).rejects.toThrow(
      'GP_Name cell exceeds 512 characters',
    )
  })

  it('applies row and column limits to parquet metadata', () => {
    expect(() => validateParquetShape(BigInt(MAX_UPLOAD_ROWS + 1), 1, 1n)).toThrow(
      `${MAX_UPLOAD_ROWS}-row limit`,
    )
    expect(() => validateParquetShape(1n, MAX_UPLOAD_COLUMNS + 1, 1n)).toThrow(
      `${MAX_UPLOAD_COLUMNS}-column limit`,
    )
    expect(() => validateParquetShape(1n, 1, BigInt(MAX_PARQUET_UNCOMPRESSED_BYTES + 1))).toThrow(
      'uncompressed-data limit',
    )
  })

  it('rejects a compact footer list bomb before metadata parsing', async () => {
    const footer = [0x29, 0xf5, ...encodeVarInt(25_001n)]
    const bytes = new Uint8Array(4 + footer.length + 8)
    bytes.set([0x50, 0x41, 0x52, 0x31], 0)
    bytes.set(footer, 4)
    const view = new DataView(bytes.buffer)
    view.setUint32(bytes.length - 8, footer.length, true)
    bytes.set([0x50, 0x41, 0x52, 0x31], bytes.length - 4)

    await expect(parseUploadedFile(new File([bytes], 'oversized-footer.parquet'))).rejects.toThrow(
      'oversized collection',
    )
    expect(() => preflightParquetFooter(bytes.buffer)).toThrow('oversized collection')
  })

  it('rejects an oversized parquet page before the decoder receives it', async () => {
    const oversizedSize = MAX_PARQUET_UNCOMPRESSED_BYTES + 1
    const pageHeader = [
      ...compactIntField(0),
      ...compactIntField(2),
      ...compactIntField(1),
      0x2c,
      ...compactIntField(1),
      0,
      0,
    ]
    const zigzagSize = BigInt(oversizedSize) * 2n
    const encodedSize = encodeVarInt(zigzagSize)
    const firstPageSizeField = 2
    pageHeader.splice(firstPageSizeField, 2, 0x15, ...encodedSize)

    const bytes = new Uint8Array(256)
    bytes.set([0x50, 0x41, 0x52, 0x31], 0)
    bytes.set(pageHeader, 4)
    bytes[4 + pageHeader.length] = 0
    const { deserializeTCompactProtocol } = await import('hyparquet/src/thrift.js')

    expect(() =>
      preflightParquetPages(
        bytes.buffer,
        200,
        1n,
        [
          {
            num_rows: 1n,
            columns: [
              {
                meta_data: {
                  data_page_offset: 4n,
                  total_compressed_size: BigInt(pageHeader.length + 1),
                },
              },
            ],
          },
        ],
        1,
        deserializeTCompactProtocol,
      ),
    ).toThrow('uncompressed-data limit')
  })

  it('keeps the existing dataset when a selected file is rejected', async () => {
    const previousRows: RaceRecord[] = []
    useRaceStore.getState().setUpload({ name: 'previous.csv', rows: previousRows })
    const oversized = new File([''], 'large.csv')
    Object.defineProperty(oversized, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    render(
      <ToastProvider>
        <RaceContextExtras loaded={null} />
      </ToastProvider>,
    )
    fireEvent.change(screen.getByLabelText(/Drop a CSV or parquet file/), {
      target: { files: [oversized] },
    })

    expect(await screen.findByText('Could not parse file')).toBeInTheDocument()
    expect(useRaceStore.getState().upload).toEqual({ name: 'previous.csv', rows: previousRows })
  })
})
