// Radio tab — a browser (driver rail → message list with transcript previews)
// feeding an NLP result card, plus a free-text composer. The corpus fetch and
// the message-select flow are separate concerns: selecting a message only
// updates the URL (`rdriver`/`rlap`/`rmsg`, so it's shareable); running the
// Radio Agent needs an explicit "Analyse" press, same as the old Streamlit
// lookup — a lap selection alone shouldn't fire the NLP pipeline. `rmsg` is
// the index of the message within that driver's laps, since a lap can carry
// more than one radio call and `rlap` alone can't tell them apart.

import { useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Skeleton, SkeletonText } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { RaceApiError } from '@/lib/api/race'
import { useRadioAnalysis, useRadioLaps } from '../queries'
import { RadioBrowser } from './RadioBrowser'
import { RadioFreeTextComposer } from './RadioFreeTextComposer'
import { RadioResultCard } from './RadioResultCard'

export interface RadioPanelProps {
  gp: string
  /** Driver codes selected in the context bar (seeds the browser). */
  drivers: string[]
  /** The selected radio message (URL-bound): driver code, lap number (display
   *  only), and the index of the message within that driver's `laps[]` — the
   *  part that actually disambiguates two messages sharing the same lap. */
  rdriver?: string
  rlap?: number
  rmsg?: number
  /** RacePage maps this to `patch({ rdriver, rlap, rmsg })`. Widened from the
   *  previous 2-arg (`rdriver`, `rlap`) signature to also carry the message
   *  index. */
  onSelect: (rdriver?: string, rlap?: number, rmsg?: number) => void
}

/** Prefer a `RaceApiError`'s own message (already unwrapped from the FastAPI
 *  `{detail}` body); fall back to a generic description for anything else
 *  (a network failure, an aborted request). */
function errorDescription(error: unknown, fallback: string): string {
  return error instanceof RaceApiError ? error.message : fallback
}

export function RadioPanel({ gp, drivers, rdriver, rlap, rmsg, onSelect }: RadioPanelProps) {
  const { toast } = useToast()
  const radioLaps = useRadioLaps(gp, true)

  useEffect(() => {
    if (!radioLaps.isError) return
    toast({
      title: 'Radio corpus unavailable',
      description: errorDescription(radioLaps.error, 'Could not load radio data for this GP.'),
      tone: 'danger',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioLaps.isError])

  const radioDrivers = useMemo(() => radioLaps.data ?? [], [radioLaps.data])

  const selectedTranscript = useMemo(() => {
    const driver = radioDrivers.find((d) => d.driver === rdriver)
    if (!driver) return ''
    // `rmsg` is the precise identity (an index into `laps[]`); without one
    // (an older deep link) fall back to the first message on that lap, same
    // as the previous behaviour.
    if (rmsg != null) return driver.laps[rmsg]?.text ?? ''
    return driver.laps.find((l) => l.lap === rlap)?.text ?? ''
  }, [radioDrivers, rdriver, rlap, rmsg])

  // A message selection ALONE never triggers analysis — only pressing
  // "Analyse" does, by stamping the current selection into `analysedKey`.
  // Picking a different message naturally invalidates it (the key no longer
  // matches), so there is no separate reset step to keep in sync. `rmsg` is
  // folded in so two messages sharing a lap get distinct keys.
  const selectionKey = rdriver && rlap != null ? `${rdriver}:${rlap}:${rmsg ?? ''}` : null
  const [analysedKey, setAnalysedKey] = useState<string | null>(null)
  const analysisEnabled = analysedKey !== null && analysedKey === selectionKey

  const analysis = useRadioAnalysis(gp, rdriver, rlap, rmsg, selectedTranscript, analysisEnabled)

  useEffect(() => {
    if (!analysis.isError) return
    toast({
      title: 'Radio analysis failed',
      description: errorDescription(analysis.error, 'The Radio Agent could not process this message.'),
      tone: 'danger',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.isError])

  return (
    <div className="flex flex-col gap-4">
      {radioLaps.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <RadioBrowser
          radioDrivers={radioDrivers}
          contextDrivers={drivers}
          selectedDriver={rdriver}
          selectedLap={rlap}
          selectedMsg={rmsg}
          onSelect={onSelect}
          onRetry={() => void radioLaps.refetch()}
        />
      )}

      {selectionKey ? (
        <Card
          elevation="resting"
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="min-w-0 truncate text-sm text-fg-2">
            <span className="font-medium text-fg-1">{rdriver}</span> · Lap {rlap} &mdash;{' '}
            {selectedTranscript || 'No transcript preview.'}
          </p>
          <Button
            size="sm"
            onClick={() => setAnalysedKey(selectionKey)}
            disabled={analysis.isFetching || !selectedTranscript.trim()}
          >
            <Play className="size-3.5" aria-hidden="true" />
            {analysis.isFetching ? 'Analysing…' : 'Analyse radio'}
          </Button>
        </Card>
      ) : null}

      {analysisEnabled && analysis.isLoading ? (
        <Card elevation="resting" className="p-4">
          <SkeletonText lines={4} />
        </Card>
      ) : analysisEnabled && analysis.data ? (
        <RadioResultCard result={analysis.data} />
      ) : null}

      <details className="group rounded-lg border border-hairline bg-bg-2">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-2 marker:content-none">
          Free text
        </summary>
        <div className="border-t border-hairline p-3">
          <RadioFreeTextComposer />
        </div>
      </details>
    </div>
  )
}
