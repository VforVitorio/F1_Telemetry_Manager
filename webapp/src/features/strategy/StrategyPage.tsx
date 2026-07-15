// Strategy page (#35) — the multi-agent pit wall, the crown jewel of the TFG.
//
// A three-act experience over the N31 orchestrator, composed as: CONFIGURE a
// scenario (scenario bar, URL-bound so it's shareable) → read the live evidence
// on the RACE TRACE (a pace trajectory across the lap window, with a movable
// decision cursor) → run the agent council and read the DECISION brief. The lap
// window is the evidence window; the decision cursor (`search.lap`) is the lap
// the orchestrator actually analyses — click a lap on the trace to move it.
//
// Layout (kills the old empty right-rail void): a HERO row (decision banner OR
// deliberation OR ready-prompt), a full-width RACE TRACE row, then a two-column
// EVIDENCE row (playbook/risks + agent tabs). This component owns the URL and
// the run lifecycle; children are dumb consumers of `search` or the active run.

import { useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Check, Crosshair, Link2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { StrategyApiError } from '@/lib/api/strategy'
import { cn } from '@/lib/cn'
import { ScenarioBar } from './components/ScenarioBar'
import { AgentDeliberation } from './components/AgentDeliberation'
import { LapReadout } from './components/LapReadout'
import { RaceTrace, type RaceTraceRun } from './components/RaceTrace'
import { DecisionBanner } from './components/DecisionBanner'
import { DecisionDetails } from './components/DecisionDetails'
import { AgentTabs } from './components/AgentTabs'
import { useStrategyStore, selectActiveRun, type RunRecord } from './store'
import {
  useStrategyGps,
  useStrategyDrivers,
  useLapRange,
  usePaceRange,
  useLapState,
  useRecommend,
} from './queries'
import { applyStrategyPatch, fromRaw, toRaw, analysedLap, type StrategySearch } from './search'

const routeApi = getRouteApi('/strategy')

/** Two scenarios produce the same recommendation when the inputs that drive the
 *  orchestrator match — the decision lap (not the whole window), risk, rival. */
function sameScenario(a: StrategySearch, b: StrategySearch): boolean {
  return (
    a.gp === b.gp &&
    a.driver === b.driver &&
    a.rival === b.rival &&
    a.risk === b.risk &&
    analysedLap(a) === analysedLap(b)
  )
}

/** Serialise the full recommendation verbatim and trigger a file download. */
function downloadRunJson(run: RunRecord): void {
  const { gp, driver } = run.config
  const lap = run.lapState.lap_number
  const filename = `strategy_${gp ?? 'gp'}_${driver ?? 'drv'}_lap${lap}.json`.replace(/\s+/g, '_')
  const blob = new Blob([JSON.stringify(run.result, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function StrategyPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])

  const gpsQuery = useStrategyGps()
  const driversQuery = useStrategyDrivers(search.gp)
  const lapRangeQuery = useLapRange(search.gp, search.driver)
  const paceRangeQuery = usePaceRange(search.gp, search.driver, lapRangeQuery.data)
  const recommend = useRecommend()

  const runs = useStrategyStore((s) => s.runs)
  const addRun = useStrategyStore((s) => s.addRun)
  const setActiveRun = useStrategyStore((s) => s.setActiveRun)
  const activeRun = useStrategyStore(selectActiveRun)

  const [editing, setEditing] = useState(false)

  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (!recommend.isPending) return
    const start = Date.now()
    setElapsedMs(0)
    const id = setInterval(() => setElapsedMs(Date.now() - start), 100)
    return () => clearInterval(id)
  }, [recommend.isPending])

  const abortRef = useRef<AbortController | null>(null)

  // The lap window defaults to the driver's full range until the slider is
  // touched; the decision cursor defaults to the window's end.
  const lapRange = lapRangeQuery.data
  const effectiveWindow: [number, number] | undefined =
    search.laps ?? (lapRange ? [lapRange.min_lap, lapRange.max_lap] : undefined)
  const cursorLap = search.lap ?? effectiveWindow?.[1]
  const canRun = !!search.gp && !!search.driver && !!effectiveWindow && cursorLap != null

  const running = recommend.isPending
  const hasRun = !!activeRun
  const runLap = activeRun ? analysedLap(activeRun.config) : undefined

  // The readout tracks the CURSOR lap. On the golden path (cursor == run lap) we
  // reuse the run's lap state; otherwise we fetch the cursor lap for preview.
  const cursorLapStateQuery = useLapState(
    search.gp,
    search.driver,
    hasRun && cursorLap === runLap ? undefined : cursorLap,
  )
  const readoutLapState =
    hasRun && cursorLap === runLap ? activeRun.lapState : cursorLapStateQuery.data
  const isPreview = cursorLap !== runLap

  /** Apply a single-key scenario patch (cascade + navigate), like Dashboard. */
  const handleChange = (patch: Partial<StrategySearch>) => {
    if (applyStrategyPatch(search, patch) === search) return
    setEditing(true)
    void navigate({ search: (prevRaw) => toRaw(applyStrategyPatch(fromRaw(prevRaw), patch)) })
  }

  /** Move the decision cursor (no bar edit — just re-point the analysed lap). */
  const handleSelectLap = (lap: number) => {
    void navigate({ search: (prevRaw) => toRaw(applyStrategyPatch(fromRaw(prevRaw), { lap })) })
  }

  const handleRun = () => {
    if (!canRun || !effectiveWindow || cursorLap == null) return
    const controller = new AbortController()
    abortRef.current = controller
    const runSearch: StrategySearch = { ...search, laps: effectiveWindow, lap: cursorLap }
    recommend.mutate(
      { search: runSearch, signal: controller.signal },
      {
        onSuccess: ({ lapState, result }) => {
          addRun({
            id: crypto.randomUUID(),
            config: runSearch,
            lapState,
            result,
            ranAt: Date.now(),
          })
          setEditing(false)
        },
      },
    )
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    recommend.reset()
  }

  /** Restore a past run and move the cursor to the lap it analysed. */
  const handleSelectRun = (id: string) => {
    const record = runs.find((r) => r.id === id)
    if (!record) return
    setActiveRun(id)
    const lap = analysedLap(record.config)
    if (lap != null) handleSelectLap(lap)
  }

  const [copied, setCopied] = useState(false)
  const handleCopyLink = () => {
    void navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const collapsed = hasRun && !editing && !running
  const isStale = hasRun && !running && !sameScenario(activeRun.config, search)
  const apiError = recommend.error instanceof StrategyApiError ? recommend.error : null
  const showError = recommend.isError

  // Past runs pinned on the trace (newest first from the store).
  const traceRuns = useMemo<RaceTraceRun[]>(
    () =>
      runs
        .map((r) => {
          const lap = analysedLap(r.config)
          return lap == null
            ? null
            : {
                id: r.id,
                lap,
                action: r.result.action,
                confidence: r.result.confidence,
                active: r.id === activeRun?.id,
              }
        })
        .filter((r): r is RaceTraceRun => r !== null),
    [runs, activeRun?.id],
  )

  return (
    <>
      <Header title="Strategy">
        {hasRun ? (
          <Button variant="ghost" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <Check className="size-4 text-success" aria-hidden="true" />
            ) : (
              <Link2 className="size-4" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy scenario link'}
          </Button>
        ) : null}
      </Header>

      <div className="flex flex-col gap-6">
        <div className="sticky top-14 z-20 -mx-6 border-b border-hairline bg-bg-1/85 px-6 py-3 backdrop-blur">
          <ScenarioBar
            search={search}
            gps={gpsQuery.data ?? []}
            gpsLoading={gpsQuery.isLoading}
            drivers={driversQuery.data ?? []}
            driversLoading={driversQuery.isLoading}
            lapRange={lapRange}
            onChange={handleChange}
            onRun={handleRun}
            running={running}
            collapsed={collapsed}
            onEdit={() => setEditing(true)}
          />
        </div>

        {!canRun ? (
          <IdleEmpty search={search} hasGps={(gpsQuery.data?.length ?? 0) > 0} />
        ) : (
          <div className="flex flex-col gap-6">
            {isStale ? <StaleNotice onRerun={handleRun} /> : null}

            {/* HERO — deliberation while running, else the brief / error / prompt. */}
            {running ? (
              <AgentDeliberation elapsedMs={elapsedMs} onCancel={handleCancel} />
            ) : showError ? (
              <StrategyErrorBanner error={apiError} onRetry={handleRun} />
            ) : hasRun ? (
              <DecisionBanner
                result={activeRun.result}
                lapState={activeRun.lapState}
                rival={activeRun.config.rival}
                onDownloadJson={() => downloadRunJson(activeRun)}
              />
            ) : (
              <ReadyHero cursorLap={cursorLap} />
            )}

            {/* RACE TRACE — the live evidence + the decision cursor. */}
            <div className="flex flex-col gap-3">
              {readoutLapState ? (
                <LapReadout lapState={readoutLapState} rival={search.rival} isPreview={isPreview} />
              ) : null}
              <RaceTrace
                points={paceRangeQuery.data ?? []}
                window={effectiveWindow!}
                cursorLap={cursorLap!}
                onSelectLap={handleSelectLap}
                pitLapTarget={activeRun?.result.pit_lap_target ?? null}
                expectedStintEnd={activeRun?.result.expected_stint_end ?? null}
                runs={traceRuns}
                onSelectRun={handleSelectRun}
                loading={paceRangeQuery.isLoading}
              />
            </div>

            {/* EVIDENCE — playbook/risks + agent breakdown (dimmed during a re-run). */}
            {hasRun ? (
              <div
                className={cn(
                  'grid grid-cols-1 items-start gap-6 lg:grid-cols-2',
                  running && 'pointer-events-none opacity-60',
                )}
                aria-busy={running || undefined}
              >
                <DecisionDetails result={activeRun.result} />
                <AgentTabs lapState={activeRun.lapState} enabled={!running} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}

/** Pre-run prompt shown in the hero slot once a scenario is runnable. */
function ReadyHero({ cursorLap }: { cursorLap: number | undefined }) {
  return (
    <Card className="flex flex-col gap-1 px-6 py-5">
      <p className="font-display text-lg text-fg-1">Ready to run</p>
      <p className="text-sm text-fg-3">
        The trace below shows the pace across your window. Click a lap to set the decision point
        {cursorLap != null ? ` (now lap ${cursorLap})` : ''}, then run the pit wall from the bar
        above.
      </p>
    </Card>
  )
}

/** The pre-config empty state — progressive prompt of what to configure. */
function IdleEmpty({ search, hasGps }: { search: StrategySearch; hasGps: boolean }) {
  const description = !hasGps
    ? 'Loading available Grands Prix…'
    : !search.gp
      ? 'Pick a Grand Prix above to begin.'
      : !search.driver
        ? 'Pick a driver, then a lap window and risk appetite.'
        : 'Set the lap window and risk, then run the pit wall to get a defensible strategy call.'
  return (
    <EmptyState
      icon={<Crosshair className="size-8 text-fg-3" aria-hidden="true" />}
      title="Configure a strategy scenario"
      description={description}
    />
  )
}

/** Scenario-changed notice — hairline + tint, no side-stripe (de-slop). */
function StaleNotice({ onRerun }: { onRerun: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-warning/8 px-4 py-3 text-sm text-fg-2"
    >
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        The scenario has changed since this run — the brief below is from the previous one.
      </span>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onRerun}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Re-run
      </Button>
    </div>
  )
}

/** Orchestrator failure — tailored copy by status; config preserved so Retry
 *  re-fires the same scenario. Hairline + tint, no side-stripe. */
function StrategyErrorBanner({
  error,
  onRetry,
}: {
  error: StrategyApiError | null
  onRetry: () => void
}) {
  const isRateLimited = error?.isRateLimited ?? false
  const message = isRateLimited
    ? 'Rate limit reached (5 runs per minute). Wait a moment, then retry.'
    : (error?.message ?? 'The orchestrator could not complete this run.')
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-hairline bg-danger/8 px-5 py-4"
    >
      <div className="flex items-center gap-3 text-sm text-fg-1">
        <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
        <span className="font-medium">Run failed</span>
      </div>
      <p className="text-sm text-fg-2">{message}</p>
      <Button size="sm" variant="primary" className="self-start" onClick={onRetry}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  )
}
