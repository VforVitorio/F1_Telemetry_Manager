// The `chart` family is delegated to a sibling module built separately (see
// the import below) so this switch never needs its own ECharts option
// builders — it only routes.
import { InlineChart } from '@/features/chat/charts/InlineChart'
import type { ToolResult } from '@/lib/api/chat'
import { MetricsResult } from './MetricsResult'
import { RawDataDisclosure } from './RawDataDisclosure'
import { StrategyCardResult } from './StrategyCardResult'
import { TableResult } from './TableResult'
import { TextResult } from './TextResult'
import { ToolErrorCard } from './ToolErrorCard'
import { isToolError } from './toolResultParsing'

export interface ToolResultCardProps {
  toolResult: ToolResult
}

/**
 * Renders one `tool_result` event. A failed call always short-circuits to
 * the danger-tinted `ToolErrorCard` — the backend forces `display_type:
 * 'text'` and collapses `data` to just `{error}` on failure, so `isToolError`
 * runs ahead of the `display_type` switch below rather than letting a text
 * renderer try to make sense of an error envelope. Otherwise the result is
 * dispatched to its family renderer by `display_type`, each of which reuses
 * the cards already shipped for Race and Lab (StatCard, Gauge, CompoundPill,
 * ScenarioScoresChart, RadioResultCard, RagAnswerCard, ...) instead of
 * inventing new visual language for the chat tab.
 */
export function ToolResultCard({ toolResult }: ToolResultCardProps) {
  if (isToolError(toolResult.data)) {
    return <ToolErrorCard toolResult={toolResult} />
  }

  switch (toolResult.display_type) {
    case 'metrics':
      return <MetricsResult toolResult={toolResult} />
    case 'strategy_card':
      return <StrategyCardResult toolResult={toolResult} />
    case 'table':
      return <TableResult toolResult={toolResult} />
    case 'text':
      return <TextResult toolResult={toolResult} />
    case 'chart':
      return <InlineChart toolName={toolResult.tool_name} data={toolResult.data} />
    default:
      return <RawDataDisclosure data={toolResult.data} />
  }
}
