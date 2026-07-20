// "Run all models" for the Model Lab: fire every model against the current
// moment in one click, so a user who wants the whole board can skip running six
// benches by hand. Fetches the shared lap state once, then runs pace, tyres,
// situation (which fills Overtake + Safety car) and pit in parallel, recording
// each result in the store exactly like the individual benches do. Radio is
// left out: it has no single "run this lap" input (it needs a chosen message).
//
// Each job is independent (Promise.allSettled), so one model failing (a rate
// limit, a missing lap) does not stop the others; failures raise one toast.

import { useState } from 'react'
import { useToast } from '@/components/Toast'
import {
  fetchLapRange,
  fetchLapState,
  fetchPaceRange,
  fetchTireRange,
  runAgent,
} from '@/lib/api/strategy'
import { LAB_YEAR, type LabSearch } from './search'
import { useLabStore, type LabRun } from './store'
import { runFailureToast } from './models/runError'

const newRun = (run: Omit<LabRun, 'id' | 'ranAt'>): LabRun => ({
  ...run,
  id: crypto.randomUUID(),
  ranAt: Date.now(),
})

export function useRunAll() {
  const addRun = useLabStore((s) => s.addRun)
  const { toast } = useToast()
  const [isRunning, setIsRunning] = useState(false)

  /** True when the context can run the batch (Radio aside). */
  const canRunAll = (search: LabSearch): boolean =>
    !!search.gp && !!search.driver && search.lap != null

  async function runAll(search: LabSearch): Promise<void> {
    const { gp, driver, lap } = search
    if (!gp || !driver || lap == null || isRunning) return
    setIsRunning(true)
    try {
      // Shared context: the lap state for the single-lap agents, and the full
      // lap range for the tyre trajectory (pace uses the picked window if any).
      const [lapState, range] = await Promise.all([
        fetchLapState(gp, driver, lap, LAB_YEAR),
        fetchLapRange(gp, driver, LAB_YEAR),
      ])
      const paceWindow = search.laps ?? [range.min_lap, range.max_lap]
      const lapLabel = `Lap ${lap}`

      const jobs = [
        fetchPaceRange(gp, driver, paceWindow[0], paceWindow[1], LAB_YEAR).then((r) =>
          addRun(
            newRun({
              model: 'pace',
              context: { gp, driver, laps: paceWindow },
              result: { kind: 'pace', range: r },
              label: `Laps ${paceWindow[0]}-${paceWindow[1]}`,
            }),
          ),
        ),
        Promise.all([
          runAgent('tire', lapState),
          fetchTireRange(gp, driver, range.min_lap, range.max_lap, LAB_YEAR),
        ]).then(([agent, r]) =>
          addRun(
            newRun({
              model: 'tyres',
              context: { gp, driver, lap },
              result: { kind: 'tyres', agent, range: r },
              label: lapLabel,
            }),
          ),
        ),
        runAgent('situation', lapState).then((agent) =>
          addRun(
            newRun({
              model: 'overtake',
              context: { gp, driver, lap },
              result: { kind: 'situation', agent },
              label: lapLabel,
            }),
          ),
        ),
        runAgent('pit', lapState).then((agent) =>
          addRun(
            newRun({
              model: 'pit',
              context: { gp, driver, lap },
              result: { kind: 'pit', agent },
              label: lapLabel,
            }),
          ),
        ),
      ]

      const settled = await Promise.allSettled(jobs)
      const failed = settled.filter((s) => s.status === 'rejected')
      if (failed.length > 0) {
        runFailureToast(
          toast,
          `${failed.length} model${failed.length === 1 ? '' : 's'}`,
          failed[0].status === 'rejected' ? failed[0].reason : undefined,
        )
      }
    } catch (error) {
      // A failure fetching the shared lap state / range aborts the whole batch.
      runFailureToast(toast, 'Run all', error)
    } finally {
      setIsRunning(false)
    }
  }

  return { runAll, isRunning, canRunAll }
}
