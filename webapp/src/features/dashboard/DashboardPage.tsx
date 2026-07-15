// Dashboard page (issue #34 + elevation). The telemetry workspace.
//
// This component owns the URL (selector state), threads it to every section,
// and runs the workspace-level behaviours: prewarm the FastF1 session on
// session-select, auto-load each driver's fastest lap when lap-times arrive
// (so the telemetry charts fall in without a manual click), and reset loaded
// laps when the session or drivers change. Sections are dumb consumers of
// `search`; the lap chart writes loaded laps to the store, the telemetry grid
// and circuit map read them.

import { useEffect, useMemo, useRef } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { ArrowRightLeft, Gauge, TriangleAlert } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/cn'
import { SelectorsToolbar } from './components/SelectorsToolbar'
import { LapChartSection } from './components/LapChartSection'
import { CircuitDominationSection } from './components/CircuitDominationSection'
import { TelemetryGrid } from './components/TelemetryGrid'
import { useDashboardStore } from './store'
import { useLapTimes, prewarmTelemetry } from './queries'
import { fastestLapPerDriver } from './lib/fastestLap'
import { applySelectionPatch, fromRaw, toRaw, MAX_DRIVERS, type DashboardSearch } from './search'

const routeApi = getRouteApi('/dashboard')

export function DashboardPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  // Memoize: `fromRaw` builds a fresh `drivers` array each call, and an unstable
  // `search`/`drivers` reference defeats the telemetry charts' `memo`, rebuilds
  // their option every render and resets the paint debounce mid-sweep. `raw` is
  // referentially stable from TanStack Router across unrelated renders, so this
  // only recomputes when the URL actually changes.
  const search = useMemo(() => fromRaw(raw), [raw])

  // Synchronous accumulator for the driver selection. URL navigations are async
  // and do NOT compose across a rapid burst of picks (each sees the same
  // pre-burst `prev`), so a fast multi-select would drop drivers. We track the
  // intended selection in a ref that toggles synchronously per click and always
  // navigate with the FULL accumulated set — the last navigate wins with the
  // complete list. The effect re-seeds it whenever the URL settles (external
  // nav, cascade reset). (design-specs/chart-animation-selection-bugs.md B-1.)
  const driversRef = useRef(search.drivers)
  useEffect(() => {
    driversRef.current = search.drivers
  }, [search.drivers])

  const pruneLaps = useDashboardStore((s) => s.pruneLaps)
  const clearLaps = useDashboardStore((s) => s.clearLaps)
  const setLap = useDashboardStore((s) => s.setLap)
  const selectedLapsPerDriver = useDashboardStore((s) => s.selectedLapsPerDriver)

  const lapTimesQuery = useLapTimes(search)
  const lapTimes = lapTimesQuery.data

  // A loaded lap only means something within one (year, GP, session). Clear all
  // loaded laps when the session context CHANGES — but NOT on the first mount,
  // so navigating away and back (e.g. to Comparison) preserves what was loaded
  // instead of silently resetting it to the fastest laps.
  const contextKey = `${search.year ?? ''}|${search.gp ?? ''}|${search.session ?? ''}`
  const contextInitialized = useRef(false)
  useEffect(() => {
    if (!contextInitialized.current) {
      contextInitialized.current = true
      return
    }
    clearLaps()
  }, [contextKey, clearLaps])

  // Removing a driver prunes just their loaded lap (others stay).
  const driverKey = search.drivers.join(',')
  useEffect(() => {
    pruneLaps(driverKey ? driverKey.split(',') : [])
  }, [driverKey, pruneLaps])

  // Auto-load the fastest lap for every selected driver that doesn't already
  // have a loaded lap — so the telemetry charts appear without hunting for
  // "click a point", AND adding a 2nd/3rd driver mid-session loads them too.
  // MERGE, never replace: a manually-clicked lap (already in the map) is left
  // untouched.
  useEffect(() => {
    if (!lapTimes || lapTimes.length === 0) return
    const drivers = driverKey ? driverKey.split(',') : []
    const missing = drivers.filter((driver) => !(driver in selectedLapsPerDriver))
    if (missing.length === 0) return
    const fastest = fastestLapPerDriver(lapTimes, missing)
    for (const [driver, lap] of Object.entries(fastest)) setLap(driver, lap)
  }, [lapTimes, driverKey, selectedLapsPerDriver, setLap])

  /** Patch the URL selection, applying the cascading reset of dependent levels. */
  const handleChange = (patch: Partial<DashboardSearch>) => {
    // Re-picking the SAME upstream value is a no-op (applySelectionPatch returns
    // its input) — skip the prewarm; the navigate below still no-ops structurally.
    if (applySelectionPatch(search, patch) === search) return

    // Warm the session cache the moment a session is chosen — the parse runs
    // while the user picks drivers, so the charts don't hang afterwards.
    if ('session' in patch && patch.session && search.year != null && search.gp) {
      prewarmTelemetry(search.year, search.gp, patch.session)
    }

    // Drivers change via the multiselect (which stays open for rapid picks):
    // its `onChange` ships a WHOLE array computed from the render-captured
    // selection, so composing that array over the committed URL would still
    // overwrite a just-added driver. Instead derive the single TOGGLED driver
    // from the same-render selection→patch delta, then apply that toggle over
    // the COMMITTED URL — so a burst accumulates instead of overwriting.
    // (design-specs/chart-animation-selection-bugs.md B-1.)
    if ('drivers' in patch && patch.drivers) {
      // The single toggled driver = the same-render delta between the current
      // selection and the array the multiselect shipped (both use the same,
      // possibly-stale, value — so the delta is correct regardless of staleness).
      const before = new Set(search.drivers)
      const after = new Set(patch.drivers)
      const toggled =
        [...after].find((d) => !before.has(d)) ?? [...before].find((d) => !after.has(d))
      if (!toggled) return
      // Toggle it into the SYNCHRONOUS accumulator and navigate with the full
      // set, so a rapid burst can't overwrite an earlier pick from a stale base.
      const current = driversRef.current
      const nextDrivers = current.includes(toggled)
        ? current.filter((d) => d !== toggled)
        : [...current, toggled].slice(0, MAX_DRIVERS)
      driversRef.current = nextDrivers
      void navigate({ search: (prevRaw) => toRaw({ ...fromRaw(prevRaw), drivers: nextDrivers }) })
      return
    }

    // Cascading selectors (year / GP / session): compose the patch over the
    // COMMITTED-latest URL, not the render-captured `search`.
    void navigate({ search: (prevRaw) => toRaw(applySelectionPatch(fromRaw(prevRaw), patch)) })
  }

  const hasDrivers = search.drivers.length > 0
  // Drivers are chosen but lap-times settled with no data (backend down, or no
  // laps for these drivers this session): show ONE clear notice instead of a
  // lap-chart banner contradicting seven telemetry loaders that never resolve.
  const lapTimesFailed =
    hasDrivers &&
    !lapTimesQuery.isLoading &&
    (lapTimesQuery.isError || (lapTimes?.length ?? 0) === 0)

  return (
    <>
      <Header title="Dashboard">
        <Link to="/comparison" search={toRaw(search)}>
          <Button variant="ghost" size="sm">
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            Go to comparison
          </Button>
        </Link>
      </Header>

      <div className="flex flex-col gap-6">
        {/* Selector context bar — sticky under the header so the session you're
            looking at stays visible while you scroll the charts. */}
        <div
          className={cn(
            'sticky top-14 z-20 -mx-6 border-b border-hairline bg-bg-1/85 px-6 py-3 backdrop-blur',
          )}
        >
          <SelectorsToolbar value={search} onChange={handleChange} />
        </div>

        {!hasDrivers ? (
          <EmptyState
            icon={<Gauge className="size-8 text-fg-3" aria-hidden="true" />}
            title="Pick a session and up to three drivers"
            description={
              search.session
                ? 'Choose up to three drivers above to load their lap times and telemetry.'
                : 'Choose a year, Grand Prix and session above, then up to three drivers.'
            }
          />
        ) : lapTimesFailed ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-hairline border-l-4 border-l-warning bg-bg-3 px-4 py-6 text-sm text-fg-2"
          >
            <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              No lap data for this selection. The backend may be unavailable, or these drivers set
              no timed laps in this session — try another session or driver.
            </span>
          </div>
        ) : (
          <>
            {/* Zone 1 — Session: lap chart (hero) beside the circuit map. */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="min-w-0 xl:col-span-2">
                <LapChartSection search={search} />
              </div>
              <div className="min-w-0 xl:col-span-1">
                <CircuitDominationSection search={search} />
              </div>
            </div>

            {/* Zone 2 — Lap inspector: the 7 telemetry channels. */}
            <TelemetryGrid search={search} />
          </>
        )}
      </div>
    </>
  )
}
