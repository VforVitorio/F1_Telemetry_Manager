// LAP CHART section. Streamlit parity: `frontend/components/dashboard/lap_graph.py`.
//
// Owns the data fetch (`useLapTimes`) and the store reads/writes; the three
// sub-components (`LapChart`, `LapControls`, `CompoundLegend`) are dumb
// renderers of whatever slice they're handed. The outlier/invalid filters are
// applied here (client-side, no refetch — `applyLapFilters`) and only the
// resulting `visible` laps are plotted; buttons and the legend keep working
// off the FULL `lapTimes`, matching the Streamlit source's split between
// "what's plotted" and "what's counted".

import { useMemo } from 'react'
import type { DashboardSearch } from '../search'
import { useLapTimes } from '../queries'
import { useDashboardStore } from '../store'
import { applyLapFilters } from '../lib/outliers'
import { Skeleton } from '@/components/Skeleton'
import { LapChart } from './LapChart'
import { LapControls } from './LapControls'
import { CompoundLegend } from './CompoundLegend'

export interface LapChartSectionProps {
  search: DashboardSearch
}

/** Subtle inline banner — Streamlit parity for `st.info("No lap data available...")`. */
function NoLapDataBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-hairline border-l-4 border-l-info bg-bg-3 px-4 py-3 text-sm text-fg-2"
    >
      <span aria-hidden="true">ℹ️</span>
      <span>No lap data available. Select drivers and ensure backend is running.</span>
    </div>
  )
}

/** `{ driver, lap }` pairs for the "Showing telemetry" caption, in the
 *  store map's insertion order (click order / fastest-laps batch order). */
function telemetryCaptionParts(selectedLapsPerDriver: Record<string, number>) {
  return Object.entries(selectedLapsPerDriver).map(([driver, lap]) => ({ driver, lap }))
}

/** LAP CHART section: chart (or its loading/empty state), control buttons,
 *  a click-to-load tip, the current telemetry-selection caption, and the
 *  tyre compound legend, in that order. */
export function LapChartSection({ search }: LapChartSectionProps) {
  const lapTimesQuery = useLapTimes(search)
  const lapTimes = useMemo(() => lapTimesQuery.data ?? [], [lapTimesQuery.data])

  const showOutliers = useDashboardStore((s) => s.showOutliers)
  const showInvalidLaps = useDashboardStore((s) => s.showInvalidLaps)
  const toggleOutliers = useDashboardStore((s) => s.toggleOutliers)
  const toggleInvalidLaps = useDashboardStore((s) => s.toggleInvalidLaps)
  const selectedLapsPerDriver = useDashboardStore((s) => s.selectedLapsPerDriver)
  const setLap = useDashboardStore((s) => s.setLap)
  const setFastestLaps = useDashboardStore((s) => s.setFastestLaps)

  const filterResult = useMemo(
    () => applyLapFilters(lapTimes, showOutliers, showInvalidLaps),
    [lapTimes, showOutliers, showInvalidLaps],
  )

  const isEmpty = search.drivers.length === 0 || lapTimes.length === 0
  const captionParts = telemetryCaptionParts(selectedLapsPerDriver)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-center font-display text-lg uppercase tracking-wide text-fg-2">
        Lap Chart
      </h2>

      {lapTimesQuery.isLoading ? (
        <Skeleton className="h-100 w-full" />
      ) : isEmpty ? (
        <NoLapDataBanner />
      ) : (
        <LapChart
          laps={filterResult.visible}
          drivers={search.drivers}
          year={search.year}
          onLapClick={setLap}
        />
      )}

      <LapControls
        lapTimes={lapTimes}
        drivers={search.drivers}
        showOutliers={showOutliers}
        showInvalidLaps={showInvalidLaps}
        outlierCount={filterResult.outlierCount}
        invalidCount={filterResult.invalidCount}
        onSelectFastestLaps={setFastestLaps}
        onToggleOutliers={toggleOutliers}
        onToggleInvalidLaps={toggleInvalidLaps}
      />

      <p className="text-sm text-fg-3">
        💡 Tip: Click on any point in the LAP CHART above to load that lap's telemetry
      </p>

      {captionParts.length > 0 ? (
        <p className="text-sm text-fg-2">
          📊 Showing telemetry:{' '}
          {captionParts.map((part, index) => (
            <span key={part.driver}>
              {index > 0 ? ', ' : ''}
              <strong className="font-semibold text-fg-1">{part.driver}</strong> (Lap {part.lap})
            </span>
          ))}
        </p>
      ) : null}

      <CompoundLegend lapTimes={lapTimes} drivers={search.drivers} />
    </section>
  )
}
