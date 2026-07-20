import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RaceRecord, RagResult } from '@/lib/api/race'

// Race Analysis UI state (Zustand). Holds ONLY view/layout preferences plus two
// ephemeral, deliberately-NOT-persisted slices: the Regulations Q&A history
// (session-scoped) and an uploaded offline frame (too big for localStorage).
// The race DATA itself lives in TanStack Query; the selection lives in the URL.
//
// Only the four view-layout fields persist (like the Dashboard's chartLayout).

/** The five tyre-degradation views the Tyres tab switches between. */
export const TYRE_CHARTS = ['speed', 'fuelAdj', 'regVsAdj', 'rate', 'pct'] as const
export type TyreChartKey = (typeof TYRE_CHARTS)[number]

/** Column-group presets for the Dataset table (26 cols is too many at once). */
export const DATASET_PRESETS = ['timing', 'tyres', 'speeds', 'gaps', 'weather', 'all'] as const
export type DatasetPreset = (typeof DATASET_PRESETS)[number]

/** Whether the Dataset table shows the whole field or only the selected drivers. */
export type DatasetScope = 'all' | 'selected'

const RAG_HISTORY_CAP = 10

interface RaceState {
  // ── View layout (persisted) ──────────────────────────────────────────────
  tyreChart: TyreChartKey
  setTyreChart: (key: TyreChartKey) => void
  tyreShowAll: boolean
  setTyreShowAll: (showAll: boolean) => void
  datasetPreset: DatasetPreset
  setDatasetPreset: (preset: DatasetPreset) => void
  datasetScope: DatasetScope
  setDatasetScope: (scope: DatasetScope) => void

  // ── Regulations Q&A history (session only) ────────────────────────────────
  ragHistory: RagResult[]
  pushRagEntry: (entry: RagResult) => void
  clearRagHistory: () => void

  // ── Offline upload (session only, too big to persist) ─────────────────────
  upload: { name: string; rows: RaceRecord[] } | null
  setUpload: (upload: { name: string; rows: RaceRecord[] }) => void
  clearUpload: () => void
}

export const useRaceStore = create<RaceState>()(
  persist(
    (set) => ({
      tyreChart: 'fuelAdj',
      setTyreChart: (tyreChart) => set({ tyreChart }),
      tyreShowAll: false,
      setTyreShowAll: (tyreShowAll) => set({ tyreShowAll }),
      datasetPreset: 'timing',
      setDatasetPreset: (datasetPreset) => set({ datasetPreset }),
      datasetScope: 'selected',
      setDatasetScope: (datasetScope) => set({ datasetScope }),

      ragHistory: [],
      // Newest first; a repeat question replaces its older entry so the rail
      // doesn't fill with duplicates. Capped so a long session stays bounded.
      pushRagEntry: (entry) =>
        set((s) => {
          const withoutDupe = s.ragHistory.filter((e) => e.question !== entry.question)
          return { ragHistory: [entry, ...withoutDupe].slice(0, RAG_HISTORY_CAP) }
        }),
      clearRagHistory: () => set({ ragHistory: [] }),

      upload: null,
      setUpload: (upload) => set({ upload }),
      clearUpload: () => set({ upload: null }),
    }),
    {
      name: 'f1sl.race',
      partialize: (s) => ({
        tyreChart: s.tyreChart,
        tyreShowAll: s.tyreShowAll,
        datasetPreset: s.datasetPreset,
        datasetScope: s.datasetScope,
      }),
    },
  ),
)
