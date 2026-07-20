// TanStack Query reads for the Model Lab. Context lookups (gps / drivers /
// lap-range / lap-state / radio corpus) are deterministic historical data:
// cache forever, and reuse the SAME query keys as the Strategy tab so the cache
// is shared across pages with no cross-feature import. Model RUNS are mutations
// and live inside each model's ResultView (a run history must record runs, not
// serve cache hits), so they are not here.

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  fetchLapRange,
  fetchLapState,
  fetchStrategyDrivers,
  fetchStrategyGps,
  type LapRange,
  type LapState,
} from '@/lib/api/strategy'
import { fetchRadioLaps, type RadioDriver } from '@/lib/api/race'

// Historical/deterministic data: cache forever, one retry so a downed backend
// fails fast instead of a multi-minute backoff.
const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const

/** GPs in the 2025 featured parquet (shared cache with Strategy). */
export function useLabGps() {
  return useQuery({
    queryKey: queryKeys.strategy.gps(),
    queryFn: () => fetchStrategyGps(),
    ...STATIC,
  })
}

/** Driver codes for a GP (gated on GP, like the Streamlit cascade). */
export function useLabDrivers(gp: string | undefined) {
  return useQuery({
    queryKey: gp ? queryKeys.strategy.drivers(gp) : ['strategy', 'drivers', 'idle'],
    queryFn: () => fetchStrategyDrivers(gp!),
    enabled: !!gp,
    ...STATIC,
  })
}

/** Min/max lap for a (gp, driver) — bounds the lap slider / pace window. */
export function useLabRange(gp: string | undefined, driver: string | undefined) {
  return useQuery({
    queryKey:
      gp && driver ? queryKeys.strategy.lapRange(gp, driver) : ['strategy', 'lap-range', 'idle'],
    queryFn: (): Promise<LapRange> => fetchLapRange(gp!, driver!),
    enabled: !!gp && !!driver,
    ...STATIC,
  })
}

/** The lap snapshot for one (gp, driver, lap) — previews compound/age/position
 *  in the context bar before any run. Cached per lap. */
export function useLabState(
  gp: string | undefined,
  driver: string | undefined,
  lap: number | undefined,
) {
  return useQuery({
    queryKey:
      gp && driver && lap != null
        ? queryKeys.strategy.lapState(gp, driver, lap)
        : ['strategy', 'lap-state', 'idle'],
    queryFn: (): Promise<LapState> => fetchLapState(gp!, driver!, lap!),
    enabled: !!gp && !!driver && lap != null,
    ...STATIC,
  })
}

/** The team-radio corpus for a GP: one entry per driver with recorded radio,
 *  each carrying its per-message transcript previews. Feeds the RadioBrowser. */
export function useLabRadioCorpus(gp: string | undefined) {
  return useQuery({
    queryKey: gp ? ['lab', 'radio-laps', gp] : ['lab', 'radio-laps', 'idle'],
    queryFn: (): Promise<RadioDriver[]> => fetchRadioLaps(gp!),
    enabled: !!gp,
    ...STATIC,
  })
}
