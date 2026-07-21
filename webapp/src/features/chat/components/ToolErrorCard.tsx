import { TriangleAlert } from 'lucide-react'
import type { ToolResult } from '@/lib/api/chat'
import { toolErrorMessage } from './toolResultParsing'

export interface ToolErrorCardProps {
  toolResult: ToolResult
}

/**
 * Danger-tinted banner for a failed tool call — the chat engine catches MCP
 * exceptions (timeouts, missing data, validation failures) and packs them as
 * `{"error": "..."}`, forcing `display_type` to `'text'` (see
 * `toolResultParsing.ts`'s `isToolError` for the detector). The engine always
 * follows a tool error by streaming an LLM explanation of what went wrong and
 * what to try instead (it appends a recovery nudge to the summary prompt
 * before streaming), and that explanation lands as the very next assistant
 * message in the thread — so this card is deliberately self-contained rather
 * than trying to embed that prose itself; the two simply render one after
 * the other in message order.
 *
 * Styled as a plain tinted banner (hairline border, tinted background) rather
 * than a colored-border `Card`, matching the failure banner already used on
 * the Strategy and Comparison tabs instead of introducing a new treatment.
 */
export function ToolErrorCard({ toolResult }: ToolErrorCardProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-hairline bg-danger/8 px-4 py-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-fg-3">{toolResult.tool_name}</span>
        <p className="text-sm text-fg-1">{toolErrorMessage(toolResult.data)}</p>
      </div>
    </div>
  )
}
