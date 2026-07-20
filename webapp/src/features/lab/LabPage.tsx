// The Model Lab page: put one predictor on the bench, feed it a race moment,
// read what it says. Owns the URL (bench config), the model rail, and the shared
// RunFrame that renders the active model's ResultView. The six models keep their
// run history and stale-run state in the store; the page only threads context.

import { useCallback, useMemo } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowUpRight, Play } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { LabContextBar } from './components/LabContextBar'
import { ModelRail } from './components/ModelRail'
import { RunFrame } from './components/RunFrame'
import { RunHistoryStrip } from './components/RunHistoryStrip'
import { MODEL_DEFS, MODEL_DEF_BY_ID } from './models/registry'
import { applyLabPatch, fromRaw, toRaw, type LabSearch, type ModelId } from './search'
import { useLabStore } from './store'
import { useRunAll } from './useRunAll'

const routeApi = getRouteApi('/lab')

/** The lap window to carry into Strategy: the pace window, or the single lap as
 *  a one-lap window, or nothing. */
function strategyWindow(search: LabSearch): string | undefined {
  if (search.laps) return `${search.laps[0]}-${search.laps[1]}`
  if (search.lap != null) return `${search.lap}-${search.lap}`
  return undefined
}

export function LabPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])

  const patch = useCallback(
    (p: Partial<LabSearch>) => {
      void navigate({ search: (prev) => toRaw(applyLabPatch(fromRaw(prev), p)) })
    },
    [navigate],
  )

  const def = MODEL_DEF_BY_ID[search.model]
  const activeRunByModel = useLabStore((s) => s.activeRunByModel)
  const doneIds = useMemo(
    () => new Set(Object.keys(activeRunByModel) as ModelId[]),
    [activeRunByModel],
  )

  const { runAll, isRunning, canRunAll } = useRunAll()

  const window = strategyWindow(search)
  const canSendToStrategy = !!search.gp && !!search.driver

  return (
    <>
      <Header title="Model Lab">
        <Button
          size="sm"
          variant="ghost"
          className="border border-hairline bg-bg-3 hover:bg-bg-4"
          onClick={() => runAll(search)}
          disabled={!canRunAll(search) || isRunning}
          title={
            canRunAll(search)
              ? 'Run every model for this moment'
              : 'Pick a Grand Prix, driver and lap first'
          }
        >
          <Play className="size-3.5" aria-hidden="true" />
          {isRunning ? 'Running all…' : 'Run all'}
        </Button>
        {canSendToStrategy ? (
          <Link
            to="/strategy"
            search={{ gp: search.gp, driver: search.driver, ...(window ? { laps: window } : {}) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-bg-3 px-3 py-1.5 text-sm text-fg-2 transition-colors hover:bg-bg-4 hover:text-fg-1"
          >
            Send to Strategy
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </Header>

      <div className="flex flex-col gap-4 p-6">
        <div className="sticky top-14 z-10 -mx-6 border-b border-hairline bg-bg-1/80 px-6 py-3 backdrop-blur-md">
          <LabContextBar search={search} onPatch={patch} control={def.control} />
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <ModelRail
            models={MODEL_DEFS}
            active={search.model}
            onSelect={(id) => patch({ model: id })}
            doneIds={doneIds}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <RunFrame
              def={def}
              gp={search.gp}
              driver={search.driver}
              lap={search.lap}
              laps={search.laps}
              onPatch={patch}
            />
            <RunHistoryStrip model={search.model} />
          </div>
        </div>
      </div>
    </>
  )
}
