// TanStack Query data layer for the Strategy tab.
//
// Two kinds of call:
//  - Deterministic metadata + ML sub-agents (gps / drivers / lap-range / the 4
//    agent POSTs) → useQuery with staleTime:Infinity. Given a (gp, driver, lap)
//    the parquet + ML output never change, so cache forever and the agent tabs
//    lazy-fetch on first open (`enabled`) and stay cached across tab switches.
//  - The orchestrator run (POST /recommend) → useMutation: it is non-deterministic
//    (LLM synthesis), rate-limited (5/min), and must be cancellable, none of
//    which fit a query. The page drives it and appends the result to the store.

import { useMutation, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  fetchLapRange,
  fetchLapState,
  fetchStrategyDrivers,
  fetchStrategyGps,
  runAgent,
  runRecommend,
  type AgentName,
  type AgentResultMap,
  type LapRange,
  type LapState,
  type StrategyRecommendation,
} from '@/lib/api/strategy'
import { analysedLap, type StrategySearch } from './search'

// Historical/deterministic data: cache forever, one retry so a downed backend
// fails fast instead of a multi-minute exponential backoff on slow calls.
const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const

/** GPs available in the 2025 featured parquet. */
export function useStrategyGps() {
  return useQuery({
    queryKey: queryKeys.strategy.gps(),
    queryFn: () => fetchStrategyGps(),
    ...STATIC,
  })
}

/** Driver codes for a GP (gated on GP, like the Streamlit cascade). */
export function useStrategyDrivers(gp: string | undefined) {
  return useQuery({
    queryKey: gp ? queryKeys.strategy.drivers(gp) : ['strategy', 'drivers', 'idle'],
    queryFn: () => fetchStrategyDrivers(gp!),
    enabled: !!gp,
    ...STATIC,
  })
}

/** Min/max lap for a (gp, driver) — bounds the lap-window slider. */
export function useLapRange(gp: string | undefined, driver: string | undefined) {
  return useQuery({
    queryKey:
      gp && driver ? queryKeys.strategy.lapRange(gp, driver) : ['strategy', 'lap-range', 'idle'],
    queryFn: (): Promise<LapRange> => fetchLapRange(gp!, driver!),
    enabled: !!gp && !!driver,
    ...STATIC,
  })
}

/**
 * Run one sub-agent for the active run's lap state. Lazy: `enabled` only once
 * the tab is opened AND a lap state exists (from a completed run), so the 4
 * agent tabs each fire their single ML call on first view and stay cached.
 */
export function useAgent<A extends AgentName>(
  agent: A,
  lapState: LapState | undefined,
  enabled: boolean,
) {
  const d = lapState?.driver
  return useQuery({
    queryKey:
      d != null
        ? queryKeys.strategy.agent(
            agent,
            lapState!.session_meta.gp_name,
            d.driver,
            lapState!.lap_number,
          )
        : ['strategy', 'agent', agent, 'idle'],
    queryFn: (): Promise<AgentResultMap[A]> => runAgent(agent, lapState!),
    enabled: enabled && lapState != null,
    ...STATIC,
  })
}

/** Variables for a run: the scenario + an abort signal (Cancel button). */
export interface RecommendVars {
  search: StrategySearch
  signal: AbortSignal
}

/** What a completed run yields — the inputs and the recommendation. */
export interface RecommendData {
  lapState: LapState
  result: StrategyRecommendation
}

/**
 * The orchestrator run as a mutation. Fetches the lap state for the analysed lap
 * (right edge of the window), then runs the full N31 pipeline. The page wires
 * `onSuccess` to append a RunRecord to the store; here we only own the two
 * network steps + cancellation. Requires gp/driver/laps to be set (the Run
 * button is disabled otherwise), so the non-null assertions are safe.
 */
export function useRecommend() {
  return useMutation<RecommendData, Error, RecommendVars>({
    mutationFn: async ({ search, signal }) => {
      const lap = analysedLap(search)!
      const lapState = await fetchLapState(search.gp!, search.driver!, lap)
      const result = await runRecommend(lapState, search.risk, signal)
      return { lapState, result }
    },
  })
}
