import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { buildReportHistory, generateReport } from '@/lib/api/chat'
import { useChatStore, type ChatReport, type ChatSession } from '../store'

export interface ReportsPanelProps {
  activeChat?: ChatSession
}

/** Turn a report's title into a filesystem-safe basename, falling back to a
 *  generic name when the title has nothing alphanumeric in it (an
 *  auto-titled "New chat" that never got a first user message, say). */
function reportFilename(report: ChatReport): string {
  const slug = report.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'chat-report'}.md`
}

/** Trigger a browser download of a saved report as a `.md` file — no viewer
 *  UI exists yet, so "re-open" a report today means downloading it again. */
function downloadReport(report: ChatReport): void {
  const blob = new Blob([report.content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = reportFilename(report)
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * One-click "summarise this conversation" report, plus the list of
 * previously generated reports (parity: Streamlit's report drawer,
 * `frontend/pages/chat.py:382-423`). Hits the non-streaming
 * `/chat/tool-message` endpoint directly rather than going through
 * `useChatStream` — a report is a single JSON response, not an SSE turn.
 */
export function ReportsPanel({ activeChat }: ReportsPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const reports = useChatStore((s) => s.reports)
  const addReport = useChatStore((s) => s.addReport)
  const { toast } = useToast()

  const canGenerate = Boolean(activeChat && activeChat.messages.length > 0) && !isGenerating

  async function handleGenerate() {
    if (!activeChat) return
    setIsGenerating(true)
    try {
      const chatHistory = buildReportHistory(activeChat.messages)
      const content = await generateReport({ chatHistory })
      const report: ChatReport = {
        id: crypto.randomUUID(),
        chatId: activeChat.id,
        title: activeChat.title,
        content,
        createdAt: Date.now(),
      }
      addReport(report)
      toast({ title: 'Report generated', description: `Saved "${report.title}".`, tone: 'success' })
    } catch (error) {
      toast({
        title: 'Report generation failed',
        description: error instanceof Error ? error.message : 'Could not reach the backend.',
        tone: 'danger',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <span className="px-1 text-xs font-medium tracking-wide text-fg-4 uppercase">Reports</span>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="justify-start gap-2 border border-hairline bg-bg-3"
      >
        {isGenerating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileText className="size-4" aria-hidden="true" />
        )}
        {isGenerating ? 'Generating…' : 'Generate report'}
      </Button>

      {reports.length > 0 ? (
        <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => downloadReport(report)}
              title={`Download "${report.title}"`}
              className="flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-xs text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg-1"
            >
              <Download className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{report.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
