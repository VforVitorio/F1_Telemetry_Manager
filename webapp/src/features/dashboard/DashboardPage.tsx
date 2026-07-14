// Dashboard page (issue #34) — the telemetry pilot screen, full §6.1 parity.
//
// This component owns the URL (selector state) and threads it to every section:
// it reads the validated search, exposes the component-facing array shape, and
// applies the cascading reset (changing year clears GP/session/drivers, etc.).
// Sections are dumb consumers of `search` — the lap chart writes loaded laps to
// the dashboard store, the telemetry grid + circuit map read them.

import { useEffect } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { SelectorsToolbar } from './components/SelectorsToolbar'
import { LapChartSection } from './components/LapChartSection'
import { CircuitDominationSection } from './components/CircuitDominationSection'
import { TelemetryGrid } from './components/TelemetryGrid'
import { useDashboardStore } from './store'
import { fromRaw, toRaw, type DashboardSearch } from './search'

const routeApi = getRouteApi('/dashboard')

export function DashboardPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = fromRaw(raw)
  const pruneLaps = useDashboardStore((s) => s.pruneLaps)
  const clearLaps = useDashboardStore((s) => s.clearLaps)

  // A loaded lap only means something within one (year, GP, session). If any of
  // those change — including via a Back/Forward jump or an incoming link that
  // doesn't go through the selectors — drop every loaded lap, otherwise a stale
  // driver→lap would be re-fetched against the NEW session's key.
  const contextKey = `${search.year ?? ''}|${search.gp ?? ''}|${search.session ?? ''}`
  useEffect(() => {
    clearLaps()
  }, [contextKey, clearLaps])

  // Within the same session, removing a driver prunes just their loaded lap
  // (the other drivers' stay).
  const driverKey = search.drivers.join(',')
  useEffect(() => {
    pruneLaps(driverKey ? driverKey.split(',') : [])
  }, [driverKey, pruneLaps])

  /** Patch the URL selection, applying the cascading reset of dependent levels. */
  const handleChange = (patch: Partial<DashboardSearch>) => {
    // Re-picking the SAME value from a dropdown must not wipe the downstream
    // selection (the combobox fires onChange even when the value is unchanged).
    if ('year' in patch && patch.year === search.year) return
    if ('gp' in patch && patch.gp === search.gp) return
    if ('session' in patch && patch.session === search.session) return

    const next: DashboardSearch = { ...search, ...patch }
    if ('year' in patch) {
      next.gp = undefined
      next.session = undefined
      next.drivers = []
    } else if ('gp' in patch) {
      next.session = undefined
      next.drivers = []
    } else if ('session' in patch) {
      next.drivers = []
    }
    void navigate({ search: toRaw(next) })
  }

  return (
    <>
      <Header title="Dashboard">
        <Link to="/comparison" search={toRaw(search)}>
          <Button variant="ghost" size="sm">
            ⚖️ Go to comparison
          </Button>
        </Link>
      </Header>

      <div className="flex flex-col gap-8">
        <SelectorsToolbar value={search} onChange={handleChange} />
        <LapChartSection search={search} />
        <CircuitDominationSection search={search} />
        <TelemetryGrid search={search} />
      </div>
    </>
  )
}
