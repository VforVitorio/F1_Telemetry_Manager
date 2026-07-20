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
import { fetchStrategyGps } from '@/lib/api/strategy'
import { askRag, fetchRaceData, fetchRadioAvailableGps, type RagResult, type RaceRecord } from '@/lib/api/race'

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
