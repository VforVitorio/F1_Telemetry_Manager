import { useRef } from 'react'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/cn'
import { Button } from '@/components/Button'

// Virtualized data table (react-table + react-virtual). Replaces st.dataframe:
// the header stays pinned while the body scrolls in its own fixed-height
// container, and only the rows near the viewport are mounted, so a
// multi-thousand-row lap-by-lap telemetry table stays smooth. Columns use a
// fixed table layout sized from `getSize()` so widths stay stable as
// virtualization swaps which rows are mounted (an auto-layout table would
// otherwise jitter column widths every scroll frame). Numeric cells (raw
// value, not the rendered display string) get tabular mono figures so stacked
// numbers align.

const ROW_HEIGHT_PX = 36
const DEFAULT_HEIGHT_PX = 480
const OVERSCAN_ROWS = 12

/** Escape one CSV field per RFC 4180: wrap in quotes (doubling any embedded
 *  quote) whenever the value contains a comma, quote, or newline. */
function escapeCsvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Build an RFC 4180 CSV string (CRLF line endings) from a header row and a
 *  matrix of row values. Pure and side-effect free so it is unit-testable
 *  without mounting the table or touching the DOM. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}

/** Trigger a browser download of `csv` as `filename` via a temporary object URL. */
function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Resolve a display label for a CSV header cell: plain-string headers are
 *  used as-is; function/JSX headers (rendered visually via `flexRender`) fall
 *  back to the column id, since CSV has no markup to render. */
function headerLabel(header: unknown, columnId: string): string {
  return typeof header === 'string' ? header : columnId
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M8 2v8m0 0 3-3m-3 3-3-3" />
      <path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" />
    </svg>
  )
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  /** Fixed height in px of the scrolling body. Defaults to 480. */
  height?: number
  /** Filename used by the CSV export button. Defaults to 'export.csv'. */
  csvFilename?: string
}

/** Virtualized data table with a sticky header and a CSV export button.
 *  Generic over row shape `T`; pass tanstack `ColumnDef`s the same way you
 *  would to `useReactTable`. */
export function DataTable<T>({
  columns,
  data,
  height = DEFAULT_HEIGHT_PX,
  csvFilename = 'export.csv',
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const table = useReactTable({ columns, data, getCoreRowModel: getCoreRowModel() })
  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
  })
  const virtualRows = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalHeight - virtualRows[virtualRows.length - 1].end : 0
  const leafColumnCount = table.getVisibleLeafColumns().length

  function handleExport() {
    const headers = table
      .getVisibleLeafColumns()
      .map((column) => headerLabel(column.columnDef.header, column.id))
    const values = rows.map((row) => row.getVisibleCells().map((cell) => cell.getValue()))
    downloadCsv(buildCsv(headers, values), csvFilename)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" aria-label="Export table as CSV" onClick={handleExport}>
          <DownloadIcon />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto rounded-xl border border-hairline"
        style={{ height }}
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 bg-bg-2">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="border-b border-hairline px-3 py-2 text-left font-display text-xs font-semibold uppercase tracking-wide text-fg-3"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td style={{ height: paddingTop }} colSpan={leafColumnCount} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <tr key={row.id} className="border-b border-hairline last:border-b-0">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={cn(
                        'px-3 py-2 text-fg-2',
                        typeof cell.getValue() === 'number' && 'font-mono tabular-nums',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td style={{ height: paddingBottom }} colSpan={leafColumnCount} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
