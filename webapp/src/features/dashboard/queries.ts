// TanStack Query hooks for the Dashboard data layer. All wrap the typed
// openapi-fetch client and narrow the `unknown` telemetry bodies (see
// lib/api/telemetry.ts). Historical data never changes, so `staleTime:
// Infinity` — nav and UI toggles never trigger a refetch (perf target P4-3).
//
// Design: the store holds the SELECTED laps; `useLapTelemetries` turns that
// selection map into N parallel queries (useQueries) and returns a
// `{ driver: telemetry }` record, so click-to-load / fastest-laps are just
// store writes and the charts fetch reactively.

import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/queryKeys'
import {
  narrowCircuitDomination,
  narrowDrivers,
  narrowLapTelemetry,
  narrowLapTimes,
  narrowStringList,
  type CircuitDomination,
  type DriverOption,
  type LapTelemetry,
  type LapTime,
} from '@/lib/api/telemetry'
import type { DashboardSearch } from './search'

// Historical data never changes: cache forever, and cap retries at 1 so a
// downed backend fails fast instead of spinning through the default 3-retry
// exponential backoff (which, on 10s+ FastF1 calls, means minutes of spinner).
const HISTORICAL = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const

/** Available GPs for a season. */
export function useGps(year: number | undefined) {
  return useQuery({
    queryKey: year != null ? queryKeys.telemetry.gps(year) : ['telemetry', 'gps', 'idle'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await api.GET('/api/v1/telemetry/gps', {
        params: { query: { year: year! } },
      })
      if (error) throw error
      return narrowStringList(data, 'gps')
    },
    enabled: year != null,
    ...HISTORICAL,
  })
}

/** Available sessions for a GP. */
export function useSessions(year: number | undefined, gp: string | undefined) {
  return useQuery({
    queryKey:
      year != null && gp
        ? queryKeys.telemetry.sessions(year, gp)
        : ['telemetry', 'sessions', 'idle'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await api.GET('/api/v1/telemetry/sessions', {
        params: { query: { year: year!, gp: gp! } },
      })
      if (error) throw error
      return narrowStringList(data, 'sessions')
    },
    enabled: year != null && !!gp,
    ...HISTORICAL,
  })
}

/** Drivers who ran in a session (used to populate the driver multiselect). */
export function useDrivers(
  year: number | undefined,
  gp: string | undefined,
  session: string | undefined,
) {
  return useQuery({
    queryKey:
      year != null && gp && session
        ? queryKeys.telemetry.drivers(year, gp, session)
        : ['telemetry', 'drivers', 'idle'],
    queryFn: async (): Promise<DriverOption[]> => {
      const { data, error } = await api.GET('/api/v1/telemetry/drivers', {
        params: { query: { year: year!, gp: gp!, session: session! } },
      })
      if (error) throw error
      return narrowDrivers(data)
    },
    enabled: year != null && !!gp && !!session,
    ...HISTORICAL,
  })
}

const ready = (s: DashboardSearch) => s.year != null && !!s.gp && !!s.session

/**
 * Fire-and-forget: ask the backend to warm the FastF1 session cache for this
 * (year, gp, session). Called when the user picks a session so the ~2-15s parse
 * starts while they choose drivers — by the time lap-times fires, it's warm.
 * Untyped raw fetch (same-origin via the dev proxy / nginx); errors are ignored.
 */
export function prewarmTelemetry(year: number, gp: string, session: string): void {
  // Same base as the typed client (client.ts) so it works split-origin too.
  const base = import.meta.env.VITE_API_BASE ?? ''
  const query = new URLSearchParams({ year: String(year), gp, session })
  void fetch(`${base}/api/v1/telemetry/prewarm?${query.toString()}`, { method: 'POST' }).catch(
    () => {},
  )
}

/** Lap-time series for the selected drivers (feeds the lap chart). */
export function useLapTimes(search: DashboardSearch) {
  const { year, gp, session, drivers } = search
  // Sort the CSV (like the Streamlit original's `tuple(sorted(...))`) so
  // VER,LEC and LEC,VER are one cache entry / one backend call, not two.
  const driversCsv = [...drivers].sort().join(',')
  const enabled = ready(search) && drivers.length > 0
  return useQuery({
    queryKey: enabled
      ? queryKeys.telemetry.lapTimes(year!, gp!, session!, driversCsv)
      : ['telemetry', 'lap-times', 'idle'],
    queryFn: async (): Promise<LapTime[]> => {
      const { data, error } = await api.GET('/api/v1/telemetry/lap-times', {
        params: { query: { year: year!, gp: gp!, session: session!, drivers: driversCsv } },
      })
      if (error) throw error
      return narrowLapTimes(data)
    },
    enabled,
    ...HISTORICAL,
  })
}

/** Microsector-dominance map (needs >=2 drivers). */
export function useCircuitDomination(search: DashboardSearch) {
  const { year, gp, session, drivers } = search
  const driversCsv = [...drivers].sort().join(',')
  const enabled = ready(search) && drivers.length >= 2
  return useQuery({
    queryKey: enabled
      ? queryKeys.telemetry.circuitDomination(year!, gp!, session!, driversCsv)
      : ['telemetry', 'circuit-domination', 'idle'],
    queryFn: async (): Promise<CircuitDomination | null> => {
      const { data, error } = await api.GET('/api/v1/circuit-domination', {
        params: { query: { year: year!, gp: gp!, session: session!, drivers: driversCsv } },
      })
      if (error) throw error
      return narrowCircuitDomination(data)
    },
    enabled,
    ...HISTORICAL,
  })
}

export interface LapTelemetriesResult {
  /** driver code → that driver's loaded-lap telemetry. */
  byDriver: Record<string, LapTelemetry>
  /** True while at least one selected lap is still loading. */
  isLoading: boolean
  /** True once at least one lap's telemetry has loaded. */
  hasAny: boolean
  /** True when the user has selected any lap (vs. the initial idle state). */
  hasSelection: boolean
  /** Selected drivers whose lap settled with NO telemetry (pit / out / incomplete
   *  lap → backend `{}`) or errored — so the UI can explain the empty state
   *  instead of spinning the loader forever. */
  failedDrivers: string[]
}

/**
 * Fetch telemetry for every currently-selected (driver, lap) in parallel.
 * Turns the store's `selectedLapsPerDriver` map into N reactive queries so
 * click-to-load and SELECT FASTEST LAPS need no manual prefetch.
 */
export function useLapTelemetries(
  search: DashboardSearch,
  selectedLapsPerDriver: Record<string, number>,
): LapTelemetriesResult {
  const { year, gp, session } = search
  const entries = Object.entries(selectedLapsPerDriver)
  const canFetch = ready(search)

  const results = useQueries({
    queries: entries.map(([driver, lap]) => ({
      queryKey: canFetch
        ? queryKeys.telemetry.lapTelemetry(year!, gp!, session!, driver, lap)
        : ['telemetry', 'lap-telemetry', 'idle', driver, lap],
      queryFn: async (): Promise<LapTelemetry | null> => {
        const { data, error } = await api.GET('/api/v1/telemetry/lap-telemetry', {
          params: { query: { year: year!, gp: gp!, session: session!, driver, lap_number: lap } },
        })
        if (error) throw error
        return narrowLapTelemetry(data)
      },
      enabled: canFetch,
      ...HISTORICAL,
    })),
  })

  // Memoize the combined result on a content signature so `byDriver` keeps a
  // STABLE identity across unrelated re-renders (outlier/layout toggles, hovers)
  // — without this the 7 telemetry charts' option `useMemo`s recompute thousands
  // of points every render. The signature must capture EVERY input to `byDriver`:
  // the session context (so navigating between sessions can't return the prior
  // session's cached telemetry for one frame), each query's driver:lap:status,
  // and `dataUpdatedAt` (so a refetch that keeps `status: 'success'` still busts
  // the memo). `year`/`gp`/`session`/`canFetch` are already in scope above.
  const signature =
    `${canFetch}|${year ?? ''}|${gp ?? ''}|${session ?? ''}|` +
    results
      .map((r, i) => `${entries[i]?.[0]}:${entries[i]?.[1]}:${r.status}:${r.dataUpdatedAt}`)
      .join('|')

  return useMemo<LapTelemetriesResult>(
    () => {
      const byDriver: Record<string, LapTelemetry> = {}
      const failedDrivers: string[] = []
      let anyLoading = false
      results.forEach((r, i) => {
        if (!canFetch) return
        const driver = entries[i][0]
        if (r.isLoading) {
          anyLoading = true
          return
        }
        if (r.data) {
          byDriver[driver] = r.data
          return
        }
        // Settled (success with a `{}` body → null, or error after retries) but
        // no telemetry: a pit/out/incomplete lap or a failed fetch.
        if (r.isError || r.isSuccess) failedDrivers.push(driver)
      })
      return {
        byDriver,
        isLoading: anyLoading,
        hasAny: Object.keys(byDriver).length > 0,
        hasSelection: entries.length > 0,
        failedDrivers,
      }
    },
    // Keyed on the content signature above; `results`/`entries`/`canFetch` are
    // read inside but only matter when the signature changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )
}
