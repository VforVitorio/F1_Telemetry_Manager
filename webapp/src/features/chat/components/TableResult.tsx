import type { ColumnDef } from '@tanstack/react-table'
import { Card } from '@/components/Card'
import { DataTable } from '@/components/DataTable'
import { RadioResultCard } from '@/components/radio/RadioResultCard'
import type { ToolResult } from '@/lib/api/chat'
import { RawDataDisclosure } from './RawDataDisclosure'
import { asRecord, toRadioResultData } from './toolResultParsing'

// The `table` display_type: `analyze_radio` is the only tool the chat
// allowlist tags this way today, reusing the exact `RadioResultCard` Race
// and Lab already ship. A generic fallback covers any future `table` tool
// whose shape is not fixed beyond "some list of records somewhere" — mirrors
// the Streamlit renderer's own fallback (`tool_result_renderer.py`'s
// `_render_table`, which builds a `pd.DataFrame` from the first
// list-of-dicts value it finds).

type GenericRow = Record<string, unknown>

/** Build tanstack column defs from the keys of the first row, since a
 *  generic-fallback table has no fixed schema to declare columns from. */
function genericColumns(rows: GenericRow[]): ColumnDef<GenericRow, unknown>[] {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).map((key) => ({
    id: key,
    header: key.replace(/_/g, ' '),
    accessorFn: (row: GenericRow) => row[key],
  }))
}

/** The first array-of-objects value found anywhere in the payload. */
function firstRowList(data: ToolResult['data']): GenericRow[] {
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      return value.map(asRecord)
    }
  }
  return []
}

export interface TableResultProps {
  toolResult: ToolResult
}

/** Dispatches the `table` display_type. */
export function TableResult({ toolResult }: TableResultProps) {
  if (toolResult.tool_name === 'analyze_radio') {
    return <RadioResultCard result={toRadioResultData(toolResult.data)} />
  }

  const rows = firstRowList(toolResult.data)
  if (rows.length === 0) {
    return (
      <Card className="p-4">
        <RawDataDisclosure data={toolResult.data} />
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <DataTable columns={genericColumns(rows)} data={rows} height={280} />
    </Card>
  )
}
