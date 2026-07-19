// Comparison page (#36) — the flagship time-clock replay. Owns the URL search, the
// (explicit, cancellable) compare fetch, the pure replay model, and the ONE clock;
// children are dumb consumers of `model`/`clock`. The state machine (spec §3):
//   idle       — selection incomplete OR COMPARE not yet armed
//   comparing  — fetch in flight (staged skeleton, cancellable via AbortController)
//   error      — 404 (driver/lap not found) or generic, Retry keeps the selection
//   ready      — data loaded, paused at t=0 (a complete static analysis screen)
//   playing / paused / finished — the replay lifecycle, driven by the clock
//
// The replay card is the ONE glow surface; the toolbar + banner frame it (solid,
// no glow). Playhead time lives in the clock's ref, never React state (§4.2).

import { useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Check, GitCompareArrows, Link2, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/cn'
import { ComparisonApiError } from '@/lib/api/comparison'
import { useComparison } from './queries'
import { useReplayStore } from './store'
import { buildReplayModel } from './replay/buildReplayModel'
import { useReplayClock } from './replay/useReplayClock'
import { useReplayKeyboard } from './replay/useReplayKeyboard'
import { TrackCanvas } from './replay/TrackCanvas'
import { ChannelGrid } from './replay/ChannelGrid'
import { ReplayTransport } from './replay/ReplayTransport'
import { ComparisonToolbar } from './components/ComparisonToolbar'
import { ResultBanner } from './components/ResultBanner'
import { AskAiButton } from './components/AskAiButton'
import { REPLAY_SPEEDS } from './store'
import {
  applyComparisonPatch,
  fromRaw,
  isComparable,
  shouldFetch,
  toRaw,
  type ComparisonSearch,
} from './search'

const routeApi = getRouteApi('/comparison')

/** Matches the OS "reduce motion" preference (spec §4.6: no autoplay/trails). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function ComparisonPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])
  const { toast } = useToast()
  const reducedMotion = usePrefersReducedMotion()

  const comparison = useComparison(search)
  const payload = comparison.data
  // The pure model is memoized on the (immutable) payload identity.
  const model = useMemo(() => (payload ? buildReplayModel(payload) : null), [payload])

  const status = useReplayStore((s) => s.status)
  const setStatus = useReplayStore((s) => s.setStatus)
  const speed = useReplayStore((s) => s.speed)
  const setSpeed = useReplayStore((s) => s.setSpeed)
  const loop = useReplayStore((s) => s.loop)
  const toggleLoop = useReplayStore((s) => s.toggleLoop)
  const trackMode = useReplayStore((s) => s.trackMode)
  const setTrackMode = useReplayStore((s) => s.setTrackMode)
  const resetForNewComparison = useReplayStore((s) => s.resetForNewComparison)

  const duration = model?.duration ?? 0
  const clock = useReplayClock({
    duration,
    speed,
    loop,
    onStatusChange: setStatus,
  })

  // A fresh comparison resets the lifecycle to paused-at-start.
  const modelIdRef = useRef<ReplayModelId>(null)
  useEffect(() => {
    if (!model) return
    const id = comparison.dataUpdatedAt
    if (modelIdRef.current === id) return
    modelIdRef.current = id
    resetForNewComparison()
    clock.seek(0)
    // Apply the moment-link ONCE (a shared paused instant), clamped to the lap.
    if (search.t != null) clock.seek(Math.min(Math.max(search.t, 0), model.duration))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, comparison.dataUpdatedAt])

  // Keyboard transport, scoped to the focused replay card (dossier #33).
  const cardRef = useRef<HTMLDivElement>(null)
  useReplayKeyboard(cardRef, {
    clock,
    duration,
    speed,
    speeds: REPLAY_SPEEDS,
    onSpeedChange: setSpeed,
  })

  const complete = isComparable(search)
  const fetching = shouldFetch(search) && comparison.isFetching && !payload
  const apiError = comparison.error instanceof ComparisonApiError ? comparison.error : null
  const showError = shouldFetch(search) && comparison.isError

  // Screen-reader announcement of the replay lifecycle (spec §4.4): a keyboard/SR
  // user pressing Space gets silence otherwise. aria-live fires only on change.
  const replayAnnouncement =
    !model || status === 'ready'
      ? ''
      : status === 'finished'
        ? `Replay finished — ${model.winner.winnerCode} first by ${model.winner.gapSeconds.toFixed(3)} seconds`
        : status === 'playing'
          ? 'Replay playing'
          : 'Replay paused'

  /** Single-key selector patch → cascade + navigate (like Dashboard/Strategy). */
  const handleChange = (patch: Partial<ComparisonSearch>) => {
    if (applyComparisonPatch(search, patch) === search) return
    void navigate({ search: (prev) => toRaw(applyComparisonPatch(fromRaw(prev), patch)) })
  }

  /** Arm the (expensive) fetch. */
  const handleCompare = () => {
    if (!complete) return
    void navigate({ search: (prev) => toRaw({ ...fromRaw(prev), compare: true }) })
  }

  /** Cancel an in-flight comparison → disabling the query aborts the request. */
  const handleCancel = () => {
    void navigate({ search: (prev) => toRaw({ ...fromRaw(prev), compare: false, t: undefined }) })
  }

  const [copied, setCopied] = useState(false)
  /** Share the current paused instant: write `&t=` into the URL, copy it, toast. */
  const handleShareMoment = () => {
    const t = Number(clock.getTime().toFixed(2))
    // Copy AFTER the navigate resolves — `navigate` is async, so reading
    // window.location.href before it settles would copy a URL still missing `t=`.
    void navigate({ search: (prev) => toRaw({ ...fromRaw(prev), compare: true, t }) }).then(() => {
      void navigator.clipboard?.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast({
        title: 'Moment link copied',
        description: `Paused at ${t.toFixed(1)}s`,
        tone: 'success',
      })
    })
  }

  return (
    <>
      <Header title="Comparison">{model ? <AskAiButton search={search} /> : null}</Header>

      <div className="flex flex-col gap-6">
        <div className="sticky top-14 z-20 -mx-6 border-b border-hairline bg-bg-1/85 px-6 py-3 backdrop-blur">
          <ComparisonToolbar
            value={search}
            onChange={handleChange}
            onCompare={handleCompare}
            comparing={fetching}
          />
        </div>

        {showError ? (
          <ComparisonError error={apiError} onRetry={handleCompare} />
        ) : fetching ? (
          <ComparingSkeleton onCancel={handleCancel} />
        ) : model ? (
          <div className="flex flex-col gap-6">
            <div className="sr-only" role="status" aria-live="polite">
              {replayAnnouncement}
            </div>
            <ResultBanner model={model} />

            {/* The ONE glow card: the replay instrument. */}
            <Card
              elevation="glow"
              ref={cardRef}
              tabIndex={0}
              aria-label="Replay — press space to play/pause, arrows to scrub"
              className="flex flex-col gap-4 p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[55fr_45fr]">
                <TrackCanvas
                  model={model}
                  clock={clock}
                  trackMode={trackMode}
                  reducedMotion={reducedMotion}
                  className="relative min-h-[360px] w-full"
                />
                <ChannelGrid model={model} clock={clock} status={status} />
              </div>
              <ReplayTransport
                model={model}
                clock={clock}
                status={status}
                speed={speed}
                onSpeedChange={setSpeed}
                loop={loop}
                onToggleLoop={toggleLoop}
                trackMode={trackMode}
                onTrackModeChange={setTrackMode}
                onShareMoment={handleShareMoment}
              />
              <ShareHint copied={copied} />
            </Card>
          </div>
        ) : (
          <IdleEmpty search={search} complete={complete} />
        )}
      </div>
    </>
  )
}

type ReplayModelId = number | null

/** Pre-fetch prompt — progressive by how much of the selection is set. */
function IdleEmpty({ search, complete }: { search: ComparisonSearch; complete: boolean }) {
  const description = !search.gp
    ? 'Pick a Grand Prix, session and two drivers to compare their fastest laps.'
    : !search.session
      ? 'Pick a session (Q for qualifying, R for race).'
      : search.drivers.length < 2
        ? 'Pick two drivers to compare head-to-head.'
        : complete
          ? 'Ready — hit COMPARE above to load the head-to-head replay.'
          : 'Pick two drivers to compare head-to-head.'
  return (
    <EmptyState
      icon={<GitCompareArrows className="size-8 text-fg-3" aria-hidden="true" />}
      title="Head-to-head comparison"
      description={description}
    />
  )
}

/** Staged skeleton of the final layout while the compare fetch runs. */
function ComparingSkeleton({ onCancel }: { onCancel: () => void }) {
  const STAGES = [
    'Loading session…',
    'Extracting fastest laps…',
    'Synchronizing telemetry…',
  ] as const
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1800)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Card elevation="glow" className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[55fr_45fr]">
          <Skeleton className="min-h-[360px] w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3" role="status" aria-live="polite">
          <p className="font-mono text-sm text-fg-3">{STAGES[stage]}</p>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="size-4" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** Compare failure — tailored copy by status; the selection is preserved so Retry
 *  re-fires the same comparison. A 404 = a driver had no valid lap. */
function ComparisonError({
  error,
  onRetry,
}: {
  error: ComparisonApiError | null
  onRetry: () => void
}) {
  const isNotFound = error?.isNotFound ?? false
  const message = isNotFound
    ? (error?.message ??
      'One of the drivers has no valid lap in this session. Pick another driver or session.')
    : (error?.message ?? 'The comparison could not be loaded. Try again.')
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-hairline px-5 py-4',
        isNotFound ? 'bg-warning/8' : 'bg-danger/8',
      )}
    >
      <div className="flex items-center gap-3 text-sm text-fg-1">
        <TriangleAlert
          className={cn('size-5 shrink-0', isNotFound ? 'text-warning' : 'text-danger')}
          aria-hidden="true"
        />
        <span className="font-medium">{isNotFound ? 'Driver not found' : 'Comparison failed'}</span>
      </div>
      <p className="text-sm text-fg-2">{message}</p>
      <Button size="sm" variant="primary" className="self-start" onClick={onRetry}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  )
}

/** Tiny confirmation line under the transport after Share-a-moment. */
function ShareHint({ copied }: { copied: boolean }) {
  if (!copied) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-success" role="status">
      <Check className="size-3.5" aria-hidden="true" />
      <Link2 className="size-3.5" aria-hidden="true" />
      Moment link copied to clipboard
    </p>
  )
}
