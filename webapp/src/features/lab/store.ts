import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  PaceRangePoint,
  PitResult,
  SituationResult,
  TireRangePoint,
  TireResult,
} from '@/lib/api/strategy'
import type { RadioResult } from '@/lib/api/race'
import type { ModelId } from './search'

// Run store for the Model Lab. Each model RUN (not a cache hit) is recorded so
// the bench can show a per-model history and detect a stale result (one whose
// context no longer matches the bench). Runs are session-scoped (sessionStorage)
// and capped, so a long defense demo stays bounded. A Situation run feeds BOTH
// the Overtake and Safety-car models, so it registers as the active run under
// both ids.

const RUN_CAP = 30

/** The race moment a run was fired against, kept so a later context change can
 *  be flagged as stale. Radio runs carry a short input label instead of a lap. */
export interface LabRunContext {
  gp?: string
  driver?: string
  lap?: number
  laps?: [number, number]
  radioLabel?: string
}

/** A run's result, tagged by the shape it carries. `situation` backs both the
 *  Overtake and Safety-car models; `tyres` carries the agent verdict AND the
 *  degradation trajectory (two calls, one run). */
export type LabRunResult =
  | { kind: 'pace'; range: PaceRangePoint[] }
  | { kind: 'tyres'; agent: TireResult; range: TireRangePoint[] }
  | { kind: 'situation'; agent: SituationResult }
  | { kind: 'pit'; agent: PitResult }
  | { kind: 'radio'; agent: RadioResult }

export interface LabRun {
  id: string
  /** The model whose Run button fired this (Situation runs use 'overtake' or
   *  'safetycar' depending on which lens was active). */
  model: ModelId
  context: LabRunContext
  result: LabRunResult
  /** Short human label for the history strip, e.g. "Lap 18" or "Free text". */
  label: string
  ranAt: number
}

interface LabState {
  runs: LabRun[]
  /** The run currently shown per model id. A model with no entry is idle. */
  activeRunByModel: Partial<Record<ModelId, string>>
  addRun: (run: LabRun) => void
  setActiveRun: (model: ModelId, runId: string) => void
  clearRuns: () => void
}

/** Which model ids a run should light up. A Situation run answers both the
 *  Overtake and Safety-car benches; every other run answers only its own. */
function activeIdsFor(run: LabRun): ModelId[] {
  if (run.result.kind === 'situation') return ['overtake', 'safetycar']
  return [run.model]
}

export const useLabStore = create<LabState>()(
  persist(
    (set) => ({
      runs: [],
      activeRunByModel: {},
      addRun: (run) =>
        set((s) => {
          const runs = [run, ...s.runs].slice(0, RUN_CAP)
          // Drop any active pointer whose run was evicted by the cap, so the
          // rail never shows a filled dot for a model whose run is gone.
          const alive = new Set(runs.map((r) => r.id))
          const activeRunByModel: Partial<Record<ModelId, string>> = {}
          for (const [model, id] of Object.entries(s.activeRunByModel)) {
            if (id && alive.has(id)) activeRunByModel[model as ModelId] = id
          }
          for (const id of activeIdsFor(run)) activeRunByModel[id] = run.id
          return { runs, activeRunByModel }
        }),
      // Restoring a run activates it under EVERY id it answers, so restoring a
      // Situation run from history keeps the Overtake and Safety-car lenses in
      // sync (they share one run) instead of splitting them.
      setActiveRun: (model, runId) =>
        set((s) => {
          const run = s.runs.find((r) => r.id === runId)
          const ids = run ? activeIdsFor(run) : [model]
          const activeRunByModel = { ...s.activeRunByModel }
          for (const id of ids) activeRunByModel[id] = runId
          return { activeRunByModel }
        }),
      clearRuns: () => set({ runs: [], activeRunByModel: {} }),
    }),
    {
      name: 'f1sl.lab',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ runs: s.runs, activeRunByModel: s.activeRunByModel }),
    },
  ),
)

/** The active run for a model, or undefined when the model is idle. */
export function selectActiveRun(state: LabState, model: ModelId): LabRun | undefined {
  const id = state.activeRunByModel[model]
  return id ? state.runs.find((r) => r.id === id) : undefined
}

/** Past runs for one model, newest first (Situation runs show under both). A
 *  pure helper over the runs array (NOT a zustand selector): filtering inside a
 *  selector returns a fresh array each call and loops the render, so callers
 *  select `runs` and pass it here inside a useMemo. */
export function runsForModel(runs: LabRun[], model: ModelId): LabRun[] {
  const situationLens = model === 'overtake' || model === 'safetycar'
  return runs.filter((r) =>
    situationLens ? r.result.kind === 'situation' : r.result.kind === modelKind(model),
  )
}

/** The result kind a model reads (Overtake/SC both read 'situation'). */
function modelKind(model: ModelId): LabRunResult['kind'] {
  switch (model) {
    case 'pace':
      return 'pace'
    case 'tyres':
      return 'tyres'
    case 'overtake':
    case 'safetycar':
      return 'situation'
    case 'pit':
      return 'pit'
    case 'radio':
      return 'radio'
  }
}
