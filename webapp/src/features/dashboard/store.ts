import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Dashboard UI state (Zustand). This holds the user's SELECTIONS and view
// toggles only — the telemetry DATA for each selected lap lives in TanStack
// Query (keyed by driver+lap), so click-to-load is just `setLap()` and the
// charts read the query cache. Mirrors the Streamlit session-state keys
// `selected_laps_per_driver`, `show_outliers`, `show_invalid_laps`.
//
// Only `chartLayout` persists (a view preference); lap selections + filter
// toggles reset per load, matching the Streamlit defaults.

export type ChartLayout = 'grid' | 'stack'

interface DashboardState {
  /** driver code → the lap number whose telemetry is loaded. */
  selectedLapsPerDriver: Record<string, number>
  /** Merge one driver's loaded lap (click-to-load). */
  setLap: (driver: string, lap: number) => void
  /** Replace the whole map (SELECT FASTEST LAPS batch load). */
  setFastestLaps: (laps: Record<string, number>) => void
  /** Drop selections for drivers no longer chosen (call on selection change). */
  pruneLaps: (drivers: string[]) => void
  clearLaps: () => void

  showOutliers: boolean
  showInvalidLaps: boolean
  toggleOutliers: () => void
  toggleInvalidLaps: () => void

  chartLayout: ChartLayout
  toggleChartLayout: () => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedLapsPerDriver: {},
      setLap: (driver, lap) =>
        set((s) => ({ selectedLapsPerDriver: { ...s.selectedLapsPerDriver, [driver]: lap } })),
      setFastestLaps: (laps) => set({ selectedLapsPerDriver: laps }),
      pruneLaps: (drivers) =>
        set((s) => {
          const allowed = new Set(drivers)
          const next: Record<string, number> = {}
          for (const [driver, lap] of Object.entries(s.selectedLapsPerDriver)) {
            if (allowed.has(driver)) next[driver] = lap
          }
          return { selectedLapsPerDriver: next }
        }),
      clearLaps: () => set({ selectedLapsPerDriver: {} }),

      showOutliers: false,
      showInvalidLaps: true,
      toggleOutliers: () => set((s) => ({ showOutliers: !s.showOutliers })),
      toggleInvalidLaps: () => set((s) => ({ showInvalidLaps: !s.showInvalidLaps })),

      chartLayout: 'grid',
      toggleChartLayout: () =>
        set((s) => ({ chartLayout: s.chartLayout === 'grid' ? 'stack' : 'grid' })),
    }),
    { name: 'f1sl.dashboard', partialize: (s) => ({ chartLayout: s.chartLayout }) },
  ),
)
