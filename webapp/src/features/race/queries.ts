// TanStack Query data layer for the Race Analysis tab.
//
// The race frame + radio corpus are deterministic (the 2025 parquet never
// changes) → useQuery with staleTime:Infinity, fetched once per GP and filtered
// client-side. RAG is generative + rate-limited → useMutation the page drives,
// appending each answer to the session history in the store.
//
// Query keys are inline arrays (this tab doesn't need the shared queryKeys
// registry); the `'idle'` sentinel keeps a stable key while a query is disabled.

import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchLapState, fetchStrategyGps } from '@/lib/api/strategy'
import {
  analyzeRadio,
  askRag,
  fetchRaceData,
  fetchRadioAvailableGps,
  fetchRadioLaps,
  type RadioDriver,
  type RadioResult,
  type RagResult,
  type RaceRecord,
} from '@/lib/api/race'

/** Deterministic data: cache forever, one retry so a downed backend fails fast. */
export const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const

/** The 2025 GPs available in the featured parquet — the GP combobox options.
 *  Shares the endpoint (`/strategy/available-gps`) with the Strategy tab. */
export function useRaceGps() {
  return useQuery({
    queryKey: ['race', 'gps'],
    queryFn: (): Promise<string[]> => fetchStrategyGps(),
    ...STATIC,
  })
}

/** The whole race frame for a GP (~1-3 MB), fetched once and filtered client-side.
 *  Enabled once a GP is picked. */
export function useRaceData(gp: string | undefined) {
  return useQuery({
    queryKey: gp ? ['race', 'data', gp] : ['race', 'data', 'idle'],
    queryFn: (): Promise<RaceRecord[]> => fetchRaceData(gp!),
    enabled: !!gp,
    ...STATIC,
  })
}

/** The set of 2025 GPs that have a team-radio corpus — badges the GP combobox. */
export function useRadioAvailableGps() {
  return useQuery({
    queryKey: ['race', 'radio-gps'],
    queryFn: (): Promise<string[]> => fetchRadioAvailableGps(),
    ...STATIC,
  })
}

/** Ask the FIA-regulations RAG. Generative + rate-limited (429), so a mutation:
 *  the Regulations card drives it and appends the answer to the history store. */
export function useRag() {
  return useMutation<RagResult, Error, string>({
    mutationFn: (question: string) => askRag(question),
  })
}

/** The GP's team-radio corpus: one entry per driver, each lap carrying a
 *  transcript preview. Deterministic like the race frame — fetch once, cache
 *  forever. `enabled` lets the Radio panel skip the fetch until it actually
 *  needs the corpus (e.g. while the tab itself is still idle). */
export function useRadioLaps(gp: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: gp ? ['race', 'radio-laps', gp] : ['race', 'radio-laps', 'idle'],
    queryFn: (): Promise<RadioDriver[]> => fetchRadioLaps(gp!),
    enabled: !!gp && enabled,
    ...STATIC,
  })
}

/**
 * Run the Radio Agent's NLP pipeline for one (gp, driver, lap) transcript:
 * fetches the lap_state the agent reads for context, then posts the transcript
 * as a single radio message — the fix for the Streamlit lookup, which built
 * `radio_msgs` from an empty string and analysed nothing (see `analyzeRadio`).
 * Keyed by (gp, driver, lap) only, NOT by `text` — editing the transcript
 * doesn't invalidate a prior result on its own; the caller re-triggers by
 * flipping `enabled` (the panel's "Analyse" button). Disabled by default, since
 * merely selecting a message shouldn't fire the pipeline.
 */
export function useRadioAnalysis(
  gp: string | undefined,
  driver: string | undefined,
  lap: number | undefined,
  text: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['race', 'radio', gp ?? 'idle', driver ?? 'idle', lap ?? 'idle'],
    queryFn: async (): Promise<RadioResult> => {
      const lapState = await fetchLapState(gp!, driver!, lap!)
      // LapState is a typed struct (no index signature); the radio endpoint just
      // serialises it as the opaque lap_state context object.
      return analyzeRadio(lapState as unknown as Record<string, unknown>, [
        { driver: driver!, lap: lap!, text },
      ])
    },
    enabled: enabled && !!gp && !!driver && lap != null,
    retry: 1,
  })
}
