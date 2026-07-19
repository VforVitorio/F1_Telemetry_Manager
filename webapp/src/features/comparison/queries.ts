// TanStack Query data layer for the Comparison tab.
//
// The selector metadata (GP / session / driver lists) is the SAME telemetry
// backend the Dashboard uses, so those hooks are re-exported rather than
// duplicated. The one comparison-specific call is `useComparison`: a single
// GET /comparison/compare gated behind the explicit COMPARE flag (fetch is
// expensive — cold FastF1 up to ~60s — so it never runs reactively). Historical
// telemetry never changes → staleTime:Infinity, so the payload survives
// navigation and a paused-replay deep link re-reads the cache instantly.

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { fetchComparison, type ComparisonPayload } from '@/lib/api/comparison'
import { type ComparisonSearch, shouldFetch } from './search'

// Re-exported so the toolbar has one import site (these are generic telemetry
// metadata queries shared with the Dashboard).
export { useGps, useSessions, useDrivers, prewarmTelemetry } from '@/features/dashboard/queries'

const HISTORICAL = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const

/**
 * Fetch the head-to-head comparison for the current selection. Enabled only once
 * the COMPARE gate is set (shouldFetch), so selecting drivers is cheap and the
 * expensive fetch is explicit. Driver order is preserved in the key (pilot1 vs
 * pilot2 differ). TanStack passes `signal`, so disabling the query (COMPARE off /
 * unmount) aborts an in-flight cold session — the Cancel affordance.
 */
export function useComparison(search: ComparisonSearch) {
  const { year, gp, session, drivers } = search
  const enabled = shouldFetch(search)
  const [driver1, driver2] = drivers
  return useQuery({
    queryKey: enabled
      ? queryKeys.comparison.compare(year!, gp!, session!, driver1, driver2)
      : ['comparison', 'compare', 'idle'],
    queryFn: ({ signal }): Promise<ComparisonPayload> =>
      fetchComparison({ year: year!, gp: gp!, session: session!, driver1, driver2 }, signal),
    enabled,
    ...HISTORICAL,
  })
}
