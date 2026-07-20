import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import type { ToolResult } from '@/lib/api/chat'

export interface ToolResultCardProps {
  toolResult: ToolResult
}

/**
 * Placeholder tool-result renderer for the foundation sprint: every tool
 * result lands as its natural-language summary plus a raw JSON disclosure, no
 * matter which `display_type` the backend tagged it with. A later sprint
 * replaces the body below with a switch over `display_type` (metrics /
 * strategy_card / table / chart / text) that reuses the cards already built
 * for Race and Lab (StatCard, Gauge, CompoundPill, ScenarioScoresChart, …) —
 * this component's props and export stay the same, only the body changes.
 */
export function ToolResultCard({ toolResult }: ToolResultCardProps) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-fg-3">{toolResult.tool_name}</span>
        <Pill tone="neutral">{toolResult.display_type}</Pill>
      </div>
      {toolResult.summary ? <p className="text-sm text-fg-2">{toolResult.summary}</p> : null}
      <details className="text-xs text-fg-3">
        <summary className="cursor-pointer select-none">Raw data</summary>
        <pre className="mt-2 overflow-auto rounded-lg bg-bg-2 p-2 font-mono">
          {JSON.stringify(toolResult.data, null, 2)}
        </pre>
      </details>
      {/* C2 replaces this with the display_type switch */}
    </Card>
  )
}
