// Radio bench (N24 NLP pipeline). Reuses the Race tab's promoted radio
// components wholesale: RadioBrowser (driver rail + message list),
// RadioFreeTextComposer (self-contained textarea + analyse), RadioResultCard
// (sentiment/intent/entities + corrections + Race Control rows). A segmented
// Tabs toggle switches between the two entry points, since Radio has no
// single "Run" button the way the other five models do -- it is either "pick
// a recorded message" or "type one".
//
// The lookup selection lives in LOCAL component state, not the URL, unlike
// the Race tab's rdriver/rlap/rmsg (v1 keeps the bench simple; nothing else
// on the Lab needs to deep-link into a radio message yet). Analysis still
// needs an explicit "Analyse radio" press -- selecting a message alone must
// not fire the NLP pipeline, same rule as Race.

import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, Radio } from 'lucide-react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton, SkeletonText } from '@/components/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/Tabs'
import { useToast } from '@/components/Toast'
import { RadioBrowser } from '@/components/radio/RadioBrowser'
import { RadioFreeTextComposer } from '@/components/radio/RadioFreeTextComposer'
import { RadioResultCard } from '@/components/radio/RadioResultCard'
import { analyzeRadio, RaceApiError, type RadioResult } from '@/lib/api/race'
import { fetchLapState } from '@/lib/api/strategy'
import { useLabRadioCorpus } from '../queries'
import { selectActiveRun, useLabStore, type LabRun } from '../store'
import { RunHeader } from '../components/RunFrame'
import type { ModelMeta, ResultViewProps } from './types'

export const RADIO_META: ModelMeta = {
  id: 'radio',
  Icon: Radio,
  title: 'Team radio',
  modelChip: 'Whisper + RoBERTa + SetFit + NER',
  evalHeadline: 'GPU 47.8 ms',
  blurb: 'Runs the NLP pipeline over team radio: sentiment, intent, entities and alerts.',
  control: 'radio',
}

type RadioMode = 'lookup' | 'free-text'

/** Prefer a `RaceApiError`'s own message (already unwrapped from the FastAPI
 *  `{detail}` body); fall back to a generic description for anything else
 *  (a network failure, an aborted request). Mirrors RadioPanel's helper --
 *  duplicated rather than shared since this file may only be edited alone. */
function errorDescription(error: unknown, fallback: string): string {
  return error instanceof RaceApiError ? error.message : fallback
}

export function RadioResultView({ gp, driver }: ResultViewProps) {
  const { toast } = useToast()
  const addRun = useLabStore((s) => s.addRun)
  const activeRadioRun = useLabStore((s) => selectActiveRun(s, 'radio'))
  const [mode, setMode] = useState<RadioMode>('lookup')

  const [selDriver, setSelDriver] = useState<string | undefined>()
  const [selLap, setSelLap] = useState<number | undefined>()
  const [selMsg, setSelMsg] = useState<number | undefined>()

  const corpus = useLabRadioCorpus(gp)
  const radioDrivers = useMemo(() => corpus.data ?? [], [corpus.data])

  useEffect(() => {
    if (!corpus.isError) return
    toast({
      title: 'Radio corpus unavailable',
      description: errorDescription(corpus.error, 'Could not load radio data for this GP.'),
      tone: 'danger',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpus.isError])

  const selectedTranscript = useMemo(() => {
    const d = radioDrivers.find((r) => r.driver === selDriver)
    if (!d) return ''
    // `selMsg` is the precise identity (an index into `laps[]`); without one
    // fall back to the first message on that lap.
    if (selMsg != null) return d.laps[selMsg]?.text ?? ''
    return d.laps.find((l) => l.lap === selLap)?.text ?? ''
  }, [radioDrivers, selDriver, selLap, selMsg])

  const analysis = useMutation<RadioResult, Error, void>({
    mutationFn: async () => {
      const lapState = await fetchLapState(gp!, selDriver!, selLap!)
      // LapState is a typed struct (no index signature); the radio endpoint
      // just serialises it as the opaque lap_state context object.
      return analyzeRadio(lapState as unknown as Record<string, unknown>, [
        { driver: selDriver!, lap: selLap!, text: selectedTranscript },
      ])
    },
    // Record the analysed message as a proper Lab run so it survives a
    // model switch and lights up the rail's status dot, same as the other
    // five benches. Guarded because the selection can in principle change
    // shape while the request is still in flight.
    onSuccess: (agent) => {
      if (!selDriver || selLap == null) return
      const label = `${selDriver} · Lap ${selLap}`
      const run: LabRun = {
        id: crypto.randomUUID(),
        model: 'radio',
        context: { gp, radioLabel: label },
        result: { kind: 'radio', agent },
        label,
        ranAt: Date.now(),
      }
      addRun(run)
    },
    onError: (error) => {
      toast({
        title: 'Radio analysis failed',
        description: errorDescription(error, 'The Radio Agent could not process this message.'),
        tone: 'danger',
      })
    },
  })

  // A GP swap invalidates any selection made against the previous corpus --
  // reset so a stale result card never lingers under the new context.
  useEffect(() => {
    setSelDriver(undefined)
    setSelLap(undefined)
    setSelMsg(undefined)
    analysis.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gp])

  function onSelect(d?: string, lap?: number, msg?: number) {
    setSelDriver(d)
    setSelLap(lap)
    setSelMsg(msg)
    analysis.reset()
  }

  // Sourced from the store rather than `analysis.data` so the last radio
  // result survives a switch away to another model and back -- the store
  // entry is what makes the rail's status dot light up too.
  const shownResult =
    activeRadioRun?.result.kind === 'radio' ? activeRadioRun.result.agent : undefined

  return (
    <div className="flex flex-col gap-4">
      <RunHeader title={RADIO_META.title} modelChip={RADIO_META.modelChip} right={null} />

      <Tabs value={mode} onValueChange={(v) => setMode(v as RadioMode)}>
        <TabsList variant="segmented">
          <TabsTrigger value="lookup">Race radio</TabsTrigger>
          <TabsTrigger value="free-text">Free text</TabsTrigger>
        </TabsList>

        <TabsContent value="lookup" className="mt-4 flex flex-col gap-4">
          {!gp ? (
            <EmptyState
              icon={<Radio className="size-5" aria-hidden="true" />}
              title="Pick a Grand Prix"
              description="Pick a Grand Prix to browse its radio, or use the Free text tab instead."
            />
          ) : corpus.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <RadioBrowser
              radioDrivers={radioDrivers}
              contextDrivers={driver ? [driver] : []}
              selectedDriver={selDriver}
              selectedLap={selLap}
              selectedMsg={selMsg}
              onSelect={onSelect}
              onRetry={() => void corpus.refetch()}
              onOpenComposer={() => setMode('free-text')}
            />
          )}

          {gp && selDriver && selLap != null ? (
            <Card
              elevation="resting"
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="min-w-0 truncate text-sm text-fg-2">
                <span className="font-medium text-fg-1">{selDriver}</span> · Lap {selLap} ·{' '}
                {selectedTranscript || 'No transcript preview.'}
              </p>
              <Button
                size="sm"
                onClick={() => analysis.mutate()}
                disabled={analysis.isPending || !selectedTranscript.trim()}
              >
                <Play className="size-3.5" aria-hidden="true" />
                {analysis.isPending ? 'Analysing…' : 'Analyse radio'}
              </Button>
            </Card>
          ) : null}

          {analysis.isPending ? (
            <Card elevation="resting" className="p-4">
              <SkeletonText lines={4} />
            </Card>
          ) : shownResult ? (
            <RadioResultCard result={shownResult} />
          ) : null}
        </TabsContent>

        <TabsContent value="free-text" className="mt-4">
          <RadioFreeTextComposer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
