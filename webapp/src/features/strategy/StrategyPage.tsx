// Strategy page (#35) — the multi-agent pit wall, the crown jewel of the TFG.
//
// A three-act experience over the N31 orchestrator: CONFIGURE a scenario
// (scenario bar, URL-bound so it's shareable) → watch the agent council
// DELIBERATE (the run IS the loading state, no fake skeletons) → read a
// DECISION brief with its evidence trail (per-agent analysis, Monte-Carlo
// scores, stint timeline). Decision first, evidence below.
//
// This component owns the URL (scenario config) and the run lifecycle (the
// /recommend mutation, its abortable timer, and the five view states:
// idle / running / complete / error / stale). Every child is a dumb consumer of
// `search` or of the active RunRecord; results persist in the Zustand store so
// navigating away and back keeps the brief.

import { useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Check, Crosshair, Link2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { StrategyApiError } from '@/lib/api/strategy'
import { cn } from '@/lib/cn'
import { ScenarioBar } from './components/ScenarioBar'
import { AgentDeliberation } from './components/AgentDeliberation'
import { SituationStrip } from './components/SituationStrip'
import { DecisionCard } from './components/DecisionCard'
import { ScenarioScoresChart } from './components/ScenarioScoresChart'
import { StintTimeline } from './components/StintTimeline'
import { AgentTabs } from './components/AgentTabs'
import { useStrategyStore, selectActiveRun, type RunRecord } from './store'
import { useStrategyGps, useStrategyDrivers, useLapRange, useRecommend } from './queries'
import { applyStrategyPatch, fromRaw, toRaw, type StrategySearch } from './search'

const routeApi = getRouteApi('/strategy')

/** Two scenarios are the same run when every config field matches. */
function sameScenario(a: StrategySearch, b: StrategySearch): boolean {
  return (
    a.gp === b.gp &&
    a.driver === b.driver &&
    a.rival === b.rival &&
    a.risk === b.risk &&
    a.laps?.[0] === b.laps?.[0] &&
    a.laps?.[1] === b.laps?.[1]
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
  // Memoize: fromRaw builds fresh arrays each call; a stable identity keeps the
  // child charts' memo intact across unrelated renders (same fix as Dashboard).
  const search = useMemo(() => fromRaw(raw), [raw])

  const gpsQuery = useStrategyGps()
  const driversQuery = useStrategyDrivers(search.gp)
  const lapRangeQuery = useLapRange(search.gp, search.driver)
  const recommend = useRecommend()

  const runs = useStrategyStore((s) => s.runs)
  const addRun = useStrategyStore((s) => s.addRun)
  const activeRun = useStrategyStore(selectActiveRun)

  // The scenario bar collapses to a chip row once a run exists; "Edit scenario"
  // re-expands it. A fresh run collapses it again.
  const [editing, setEditing] = useState(false)

  // Elapsed timer for the deliberation panel — ticks only while a run is
  // in-flight, reset on each new run.
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (!recommend.isPending) return
    const start = Date.now()
    setElapsedMs(0)
    const id = setInterval(() => setElapsedMs(Date.now() - start), 100)
    return () => clearInterval(id)
  }, [recommend.isPending])

  // AbortController for the Cancel button — aborting rejects the in-flight fetch.
  const abortRef = useRef<AbortController | null>(null)

  /** Apply a single-key scenario patch (cascade + navigate), like Dashboard. */
  const handleChange = (patch: Partial<StrategySearch>) => {
    if (applyStrategyPatch(search, patch) === search) return
    void navigate({ search: (prevRaw) => toRaw(applyStrategyPatch(fromRaw(prevRaw), patch)) })
  }

  // The lap window defaults to the driver's full range until the slider is
  // touched, so a run is possible the moment gp+driver+range are ready.
  const lapRange = lapRangeQuery.data
  const effectiveLaps: [number, number] | undefined =
    search.laps ?? (lapRange ? [lapRange.min_lap, lapRange.max_lap] : undefined)
  const canRun = !!search.gp && !!search.driver && !!effectiveLaps

  const handleRun = () => {
    if (!canRun || !effectiveLaps) return
    const controller = new AbortController()
    abortRef.current = controller
    const runSearch: StrategySearch = { ...search, laps: effectiveLaps }
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

  /** Abort the run and drop the (abort) error so we fall back to the prior view. */
  const handleCancel = () => {
    abortRef.current?.abort()
    recommend.reset()
  }

  const [copied, setCopied] = useState(false)
  const handleCopyLink = () => {
    void navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ── Derived view state ────────────────────────────────────────────────────
  const running = recommend.isPending
  const hasRun = !!activeRun
  const collapsed = hasRun && !editing && !running
  const isStale = hasRun && !running && !sameScenario(activeRun.config, search)
  const apiError = recommend.error instanceof StrategyApiError ? recommend.error : null
  const showError = recommend.isError

  return (
    <>
      <Header title="Strategy">
        {hasRun ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <Check className="size-4 text-success" aria-hidden="true" />
              ) : (
                <Link2 className="size-4" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy scenario link'}
            </Button>
          </div>
        ) : null}
      </Header>

      <div className="flex flex-col gap-6">
        {/* Scenario bar — sticky under the header, the persistent config surface. */}
        <div className="sticky top-14 z-20 -mx-6 border-b border-hairline bg-bg-1/85 px-6 py-3 backdrop-blur">
          <ScenarioBar
            search={search}
            gps={gpsQuery.data ?? []}
            gpsLoading={gpsQuery.isLoading}
            drivers={driversQuery.data ?? []}
            driversLoading={driversQuery.isLoading}
            lapRange={lapRange}
            onChange={(patch) => {
              setEditing(true)
              handleChange(patch)
            }}
            onRun={handleRun}
            running={running}
            collapsed={collapsed}
            onEdit={() => setEditing(true)}
          />
        </div>

        {running ? (
          <AgentDeliberation elapsedMs={elapsedMs} onCancel={handleCancel} />
        ) : showError ? (
          <StrategyErrorBanner error={apiError} onRetry={handleRun} />
        ) : hasRun ? (
          <CompleteView
            run={activeRun}
            isStale={isStale}
            onRerun={handleRun}
            onDownloadJson={() => downloadRunJson(activeRun)}
          />
        ) : (
          <IdleView
            search={search}
            hasGps={(gpsQuery.data?.length ?? 0) > 0}
            runCount={runs.length}
          />
        )}
      </div>
    </>
  )
}

/** The completed decision brief + its evidence trail. */
function CompleteView({
  run,
  isStale,
  onRerun,
  onDownloadJson,
}: {
  run: RunRecord
  isStale: boolean
  onRerun: () => void
  onDownloadJson: () => void
}) {
  const { result, lapState, config } = run
  return (
    <div className="flex flex-col gap-6">
      {isStale ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline border-l-4 border-l-warning bg-bg-3 px-4 py-3 text-sm text-fg-2"
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
      ) : null}

      <SituationStrip lapState={lapState} rival={config.rival} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <DecisionCard
            result={result}
            lapState={lapState}
            rival={config.rival}
            onDownloadJson={onDownloadJson}
          />
        </div>
        <div className="min-w-0 xl:col-span-1">
          <ScenarioScoresChart scores={result.scenario_scores} chosenAction={result.action} />
        </div>
      </div>

      {/* Stint timeline full-width — a lap-axis ruler reads far better wide than
          crammed into the 1/3 rail (audit P1). */}
      <StintTimeline lapState={lapState} result={result} />

      <AgentTabs lapState={lapState} enabled />
    </div>
  )
}

/** The pre-run empty state — progressive prompt of what to configure. */
function IdleView({
  search,
  hasGps,
  runCount,
}: {
  search: StrategySearch
  hasGps: boolean
  runCount: number
}) {
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
      className={cn(runCount > 0 && 'opacity-90')}
    />
  )
}

/** Orchestrator failure — tailored copy by status; config is preserved so Retry
 *  just re-fires the same scenario. */
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
      className="flex flex-col gap-3 rounded-2xl border border-hairline border-l-4 border-l-danger bg-bg-3 px-5 py-4"
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
