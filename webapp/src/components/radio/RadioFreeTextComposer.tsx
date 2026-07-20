// Free-text radio composer: paste any transcript and get the same NLP result
// card the corpus browser produces. The fallback path for a GP with no radio
// corpus (or just testing a hypothetical call) — the Radio Agent still needs
// SOME lap_state to run against, so this sends the same 'UNK' / lap 1
// placeholder the old Streamlit free-text tab used; the actual analysis reads
// only the pasted text.
//
// Exported directly (not wired through queries.ts) since it owns a one-off
// mutation with no cache-sharing need — nothing else in the tab re-reads a
// free-text result.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button } from '@/components/Button'
import { SkeletonText } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { analyzeRadio, type RadioResult } from '@/lib/api/race'
import { RadioResultCard } from './RadioResultCard'

const PLACEHOLDER_DRIVER = 'UNK'
const PLACEHOLDER_LAP = 1
const EXAMPLE_TEXT = 'e.g. Box box, we are going to Plan B, tyres are gone'

export function RadioFreeTextComposer() {
  const [text, setText] = useState('')
  const { toast } = useToast()

  const mutation = useMutation<RadioResult, Error, string>({
    mutationFn: (message: string) =>
      analyzeRadio({ driver: { driver: PLACEHOLDER_DRIVER }, lap_number: PLACEHOLDER_LAP }, [
        { driver: PLACEHOLDER_DRIVER, lap: PLACEHOLDER_LAP, text: message },
      ]),
    onError: (error) => {
      toast({ title: 'Radio analysis failed', description: error.message, tone: 'danger' })
    },
  })

  const analyse = () => {
    const trimmed = text.trim()
    if (!trimmed || mutation.isPending) return
    mutation.mutate(trimmed)
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyse()
        }}
        rows={3}
        placeholder={EXAMPLE_TEXT}
        className="w-full resize-none rounded-lg border border-hairline bg-bg-2 px-3 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={analyse} disabled={!text.trim() || mutation.isPending}>
          <Send className="size-3.5" aria-hidden="true" />
          {mutation.isPending ? 'Analysing…' : 'Analyse radio'}
        </Button>
      </div>

      {mutation.isPending ? (
        <SkeletonText lines={4} />
      ) : mutation.data ? (
        <RadioResultCard result={mutation.data} />
      ) : null}
    </div>
  )
}
