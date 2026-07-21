import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { RagAnswerCard } from '@/components/rag/RagAnswerCard'
import type { ToolResult } from '@/lib/api/chat'
import { RawDataDisclosure } from './RawDataDisclosure'
import { toLapRange, toRagResultData, toStringChips } from './toolResultParsing'

// The `text` display_type: `query_regulations` renders the full RAG answer
// card (citations + source passages); the three listing/lookup tools get a
// small chip list or one-liner instead of the raw JSON a fallback would show.

/** A chip per entry — `list_available_gps` / `list_available_drivers`. The
 *  header carries a mono count so the card reads as a data receipt at a
 *  glance, even when the chip rows wrap. */
function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-widest text-fg-3 uppercase">{label}</span>
        <span className="font-mono text-[11px] text-fg-4">{items.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Pill key={item} tone="neutral">
            {item}
          </Pill>
        ))}
      </div>
    </div>
  )
}

/** `get_lap_range`: a one-line lap-window readout instead of the raw
 *  `{min_lap, max_lap}` dict a JSON fallback would show. */
function LapRangeLine({ data }: { data: ToolResult['data'] }) {
  const range = toLapRange(data)
  if (range.minLap == null || range.maxLap == null) return <RawDataDisclosure data={data} />
  return (
    <p className="text-sm text-fg-2">
      Lap window <span className="font-mono text-fg-1">{range.minLap}</span> to{' '}
      <span className="font-mono text-fg-1">{range.maxLap}</span>
    </p>
  )
}

export interface TextResultProps {
  toolResult: ToolResult
}

/**
 * Dispatches the `text` display_type. `query_regulations` reuses the
 * promoted `RagAnswerCard` with `stream={false}` — the answer never types
 * itself out here, since the surrounding chat is already streaming the
 * real prose for this turn, unlike the Race tab's synchronous ask.
 */
export function TextResult({ toolResult }: TextResultProps) {
  if (toolResult.tool_name === 'query_regulations') {
    return <RagAnswerCard result={toRagResultData(toolResult.data)} stream={false} />
  }

  const gps = toStringChips(toolResult.data, 'gps')
  if (toolResult.tool_name === 'list_available_gps' && gps.length > 0) {
    return (
      <Card className="p-4">
        <ChipList label="Available Grand Prix" items={gps} />
      </Card>
    )
  }

  const drivers = toStringChips(toolResult.data, 'drivers')
  if (toolResult.tool_name === 'list_available_drivers' && drivers.length > 0) {
    return (
      <Card className="p-4">
        <ChipList label="Drivers" items={drivers} />
      </Card>
    )
  }

  if (toolResult.tool_name === 'get_lap_range') {
    return (
      <Card className="p-4">
        <LapRangeLine data={toolResult.data} />
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <RawDataDisclosure data={toolResult.data} />
    </Card>
  )
}
