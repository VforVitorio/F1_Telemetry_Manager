// LAP CHART section. Streamlit parity: `frontend/components/dashboard/lap_graph.py`.
//
// Owns the data fetch (`useLapTimes`) and the store reads/writes; `LapChart`,
// `LapControls`, and `LapChartFooter` are dumb renderers of whatever slice
// they're handed. The outlier/invalid filters are applied here (client-side,
// no refetch — `applyLapFilters`) and only the resulting `visible` laps are
// plotted; the controls and footer keep working off the FULL `lapTimes`,
// matching the Streamlit source's split between "what's plotted" and "what's
// counted".
//
// Everything the chart owns — controls, telemetry status, compound legend —
// folds into the ONE `ChartCard`: controls sit in the header `actions` slot,
// status + legend in the `footer` strip, so the card reads as a single unit
// instead of a chart plus a stack of loose blocks below it (round-2 fix #3,
// see `docs/migration/design-specs/dashboard-round2.md#3`).

import { useMemo } from 'react'
import { Info } from 'lucide-react'
import type { DashboardSearch } from '../search'
import { useLapTimes } from '../queries'
import { useDashboardStore } from '../store'
import { applyLapFilters } from '../lib/outliers'
import { useToast } from '@/components/Toast'
import { Skeleton } from '@/components/Skeleton'
import { ChartCard } from '@/components/ChartCard'
import { LapChart } from './LapChart'
import { LapControls } from './LapControls'
import { LapChartFooter } from './LapChartFooter'

export interface LapChartSectionProps {
  search: DashboardSearch
}

/** Subtle inline banner — Streamlit parity for `st.info("No lap data available...")`.
 *  Only reachable once drivers ARE selected but their lap-times came back empty;
 *  the "no drivers yet" case is handled by the page-level `EmptyState`. */
function NoLapDataBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-hairline border-l-4 border-l-info bg-bg-3 px-4 py-3 text-sm text-fg-2"
    >
      <Info className="size-4 shrink-0 text-info" aria-hidden="true" />
      <span>No laps to plot for this selection.</span>
    </div>
  )
}

/** LAP CHART section: one `ChartCard` — the chart body (or its loading/empty
 *  state), the fastest-laps/outlier/invalid controls in the header, and the
 *  telemetry-status + compound-legend strip in the footer. */
export function LapChartSection({ search }: LapChartSectionProps) {
  const lapTimesQuery = useLapTimes(search)
  const lapTimes = useMemo(() => lapTimesQuery.data ?? [], [lapTimesQuery.data])
  const { toast } = useToast()

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

  // Drivers are always present by the time this section renders (the page
  // shows its own EmptyState otherwise) — this only guards the in-between
  // moment where lap-times came back empty for the current selection.
  const isEmpty = lapTimes.length === 0

  /** Click-to-load, with feedback that the click actually landed: an
   *  already-loaded lap gets an info toast (no store write, no refetch); a
   *  new lap gets a success toast once the fetch is queued. Compensates for
   *  the chart's ring marker (see `LapChart`) being easy to miss when the
   *  telemetry grid it feeds is below the fold. */
  function handleLapClick(driver: string, lap: number) {
    if (selectedLapsPerDriver[driver] === lap) {
      toast({
        title: `${driver} lap ${lap}`,
        description: 'Already showing this lap.',
        tone: 'info',
      })
      return
    }
    setLap(driver, lap)
    toast({
      title: `${driver} lap ${lap} loaded`,
      description: 'Telemetry updated below.',
      tone: 'success',
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <ChartCard
        title="Lap Chart"
        actions={
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
        }
        footer={
          lapTimes.length > 0 ? (
            <LapChartFooter
              selectedLapsPerDriver={selectedLapsPerDriver}
              lapTimes={lapTimes}
              drivers={search.drivers}
              year={search.year}
            />
          ) : undefined
        }
      >
        {lapTimesQuery.isLoading ? (
          <Skeleton className="h-100 w-full" />
        ) : isEmpty ? (
          <NoLapDataBanner />
        ) : (
          <LapChart
            laps={filterResult.visible}
            drivers={search.drivers}
            year={search.year}
            selectedLaps={selectedLapsPerDriver}
            onLapClick={handleLapClick}
          />
        )}
      </ChartCard>
    </section>
  )
}
