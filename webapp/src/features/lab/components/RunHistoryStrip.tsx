// Per-model run history: the past runs for the active model, newest first. Click
// one to restore it as the shown result. Two runs at the same context expose the
// model's run-to-run spread (a feature to see, not hide). Session-scoped.

import { useMemo } from 'react'
import { runsForModel, useLabStore } from '../store'
import { cn } from '@/lib/cn'
import type { ModelId } from '../search'

function clockLabel(ranAt: number): string {
  const d = new Date(ranAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function RunHistoryStrip({ model }: { model: ModelId }) {
  // Select the raw arrays (stable references) and filter in a memo. Returning a
  // freshly .filter()'d array straight from a zustand selector re-renders every
  // tick (a new ref each call), which React caps as an infinite update loop.
  const runs = useLabStore((s) => s.runs)
  const activeId = useLabStore((s) => s.activeRunByModel[model])
  const setActiveRun = useLabStore((s) => s.setActiveRun)
  const modelRuns = useMemo(() => runsForModel(runs, model), [runs, model])

  if (modelRuns.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-fg-3 uppercase">Run history</span>
      <div className="flex flex-col gap-1">
        {modelRuns.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => setActiveRun(model, run.id)}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors',
              run.id === activeId
                ? 'border-purple-500/50 bg-bg-4 text-fg-1'
                : 'border-hairline bg-bg-3 text-fg-2 hover:bg-bg-4 hover:text-fg-1',
            )}
          >
            <span className="truncate">{run.label}</span>
            <span className="shrink-0 font-mono text-xs text-fg-4">{clockLabel(run.ranAt)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
