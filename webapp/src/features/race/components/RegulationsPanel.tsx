// The Regulations tab: ask the FIA-rulebook RAG in plain language, get a cited
// answer. Never gated behind a race load (asking a rules question shouldn't need
// a parquet download) and never auto-fires — a deep-linked `?q=` only prefills.
// Past answers live in a session history rail (store), one click to restore.

import { useState } from 'react'
import { Scale, Send } from 'lucide-react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { SkeletonText } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import type { RagResult } from '@/lib/api/race'
import { RaceApiError } from '@/lib/api/race'
import { useRag } from '../queries'
import { useRaceStore } from '../store'
import { RagAnswerCard } from './RagAnswerCard'

const SUGGESTIONS = [
  'What happens if the safety car is still out on the last lap?',
  'When is a driver given a penalty for causing a collision?',
  'What are the tyre rules for a dry race?',
  'How is a track-limits breach penalised?',
]

export function RegulationsPanel({ initialQuestion }: { initialQuestion?: string }) {
  const [question, setQuestion] = useState(initialQuestion ?? '')
  const [viewing, setViewing] = useState<RagResult | null>(null)
  const rag = useRag()
  const { toast } = useToast()
  const history = useRaceStore((s) => s.ragHistory)
  const pushRagEntry = useRaceStore((s) => s.pushRagEntry)

  const ask = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || rag.isPending) return
    setViewing(null)
    rag.mutate(trimmed, {
      onSuccess: (result) => pushRagEntry(result),
      onError: (error) => {
        const rateLimited = error instanceof RaceApiError && error.status === 429
        toast({
          title: rateLimited ? 'Too many questions' : 'Regulations query failed',
          description: rateLimited ? 'Give it a few seconds and try again.' : error.message,
          tone: 'danger',
        })
      },
    })
  }

  const answer = viewing ?? rag.data ?? null

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="flex flex-col gap-4">
        <Card elevation="resting" className="flex flex-col gap-3 p-4">
          <label htmlFor="rag-q" className="text-xs font-medium tracking-wide text-fg-3 uppercase">
            Ask the regulations
          </label>
          <textarea
            id="rag-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask(question)
            }}
            rows={2}
            placeholder="e.g. When does a pit stop under a red flag count as a stop?"
            className="w-full resize-none rounded-lg border border-hairline bg-bg-2 px-3 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s)
                  ask(s)
                }}
                className="rounded-full border border-hairline bg-bg-4 px-2.5 py-1 text-xs text-fg-2 transition-colors hover:bg-bg-5 hover:text-fg-1"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="flex items-center gap-1 text-[11px] text-fg-4">
              <kbd className="rounded border border-hairline bg-bg-4 px-1 py-0.5 font-mono">
                Cmd/Ctrl
              </kbd>
              <span>+</span>
              <kbd className="rounded border border-hairline bg-bg-4 px-1 py-0.5 font-mono">
                Enter
              </kbd>
              to ask
            </span>
            <Button
              size="sm"
              onClick={() => ask(question)}
              disabled={!question.trim() || rag.isPending}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {rag.isPending ? 'Asking…' : 'Ask'}
            </Button>
          </div>
        </Card>

        {rag.isPending ? (
          <Card elevation="resting" className="p-4">
            <SkeletonText lines={4} />
          </Card>
        ) : answer ? (
          <RagAnswerCard result={answer} />
        ) : (
          <Card elevation="resting" className="flex items-center gap-3 p-6 text-sm text-fg-3">
            <Scale className="size-5 text-fg-4" aria-hidden="true" />
            Ask a question or tap a suggestion. No race data needed.
          </Card>
        )}
      </div>

      {history.length > 0 ? (
        <aside className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-fg-3 uppercase">
            This session
          </span>
          {history.map((entry) => (
            <button
              key={entry.question}
              type="button"
              onClick={() => {
                setViewing(entry)
                setQuestion(entry.question)
              }}
              className="truncate rounded-lg border border-hairline bg-bg-3 px-3 py-2 text-left text-sm text-fg-2 transition-colors hover:bg-bg-4 hover:text-fg-1"
              title={entry.question}
            >
              {entry.question}
            </button>
          ))}
        </aside>
      ) : null}
    </div>
  )
}
