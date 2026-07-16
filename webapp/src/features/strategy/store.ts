import { create } from 'zustand'
import type { LapState, StrategyRecommendation } from '@/lib/api/strategy'
import type { StrategySearch } from './search'

// Strategy run history (Zustand, NOT persisted). Each orchestrator run is
// non-deterministic and rate-limited (5/min), so we keep every result in memory
// for the session: the active run feeds the Decision Brief, and the full list
// powers the run-history rail (click a past run to restore it) and the lap-walk.
// Not persisted — a stale LLM call from yesterday shouldn't resurrect on reload;
// results live only as long as the session.

/** One completed orchestrator run: the scenario config + inputs + output. */
export interface RunRecord {
  id: string
  /** The scenario (gp/driver/rival/laps/risk) that produced this result. */
  config: StrategySearch
  /** The lap_state fed to the orchestrator (for the situation strip + JSON). */
  lapState: LapState
  result: StrategyRecommendation
  ranAt: number
}

/** Keep memory bounded — a session rarely needs more than the last ~20 runs. */
const MAX_RUNS = 20

interface StrategyState {
  runs: RunRecord[]
  /** id of the run whose brief is shown; null before the first run. */
  activeRunId: string | null
  /** Append a run (newest first), cap the list, and make it active. */
  addRun: (record: RunRecord) => void
  setActiveRun: (id: string) => void
  clearRuns: () => void
}

export const useStrategyStore = create<StrategyState>((set) => ({
  runs: [],
  activeRunId: null,
  addRun: (record) =>
    set((s) => ({
      runs: [record, ...s.runs].slice(0, MAX_RUNS),
      activeRunId: record.id,
    })),
  setActiveRun: (id) => set({ activeRunId: id }),
  clearRuns: () => set({ runs: [], activeRunId: null }),
}))

/** The active run record, or undefined before any run / after a clear. */
export function selectActiveRun(s: StrategyState): RunRecord | undefined {
  return s.runs.find((r) => r.id === s.activeRunId)
}
