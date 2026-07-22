// Home page (issue #34 punch-list) — the "Pit Wall" launcher hub, the app's
// landing surface. A hero moment, a session launcher that hands its
// selection to whichever surface the user opens next, the persisted
// recent-sessions panel (#186), and a data-driven grid of every surface the
// app offers.
//
// The launcher's selection lives in local component state, NOT the URL —
// unlike DashboardPage, Home has no "view" of its own worth deep-linking to.
// Its only job is handing the chosen (year, gp, session, drivers) forward via
// each action link's `search={toRaw(selection)}`.

import { useState } from 'react'
import { Header } from '@/app/Header'
import { applySelectionPatch, type DashboardSearch } from '@/features/dashboard/search'
import { prewarmTelemetry } from '@/features/dashboard/queries'
import { RecentSessions } from './components/RecentSessions'
import { SessionLauncher } from './components/SessionLauncher'
import { SurfaceCards } from './components/SurfaceCards'

export function HomePage() {
  const [selection, setSelection] = useState<DashboardSearch>({ drivers: [] })

  /** Apply a launcher patch (cascading reset via `applySelectionPatch`) and
   *  warm the FastF1 session cache the moment a session is picked — mirrors
   *  DashboardPage's `handleChange`, minus the URL navigate: Home's selection
   *  never lives in the address bar, so there's nothing to push to it. */
  function handleChange(patch: Partial<DashboardSearch>) {
    const next = applySelectionPatch(selection, patch)
    if (next === selection) return
    if ('session' in patch && patch.session && selection.year != null && selection.gp) {
      prewarmTelemetry(selection.year, selection.gp, patch.session)
    }
    setSelection(next)
  }

  return (
    <>
      <Header title="Home" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="flex flex-col gap-3 pt-4 md:pt-8">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-accent-hover">
            Pit wall
          </span>
          <h1 className="max-w-3xl font-display text-4xl font-bold tracking-tight text-balance text-fg-1 md:text-5xl">
            Every session. One pit wall.
          </h1>
          <p className="max-w-prose text-base text-fg-2 text-pretty">
            Pick any Grand Prix from 2023–2025 and open it in telemetry, comparison, or the
            multi-agent strategy engine.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SessionLauncher value={selection} onChange={handleChange} />
          </div>

          <RecentSessions />
        </div>

        <SurfaceCards />
      </div>
    </>
  )
}
