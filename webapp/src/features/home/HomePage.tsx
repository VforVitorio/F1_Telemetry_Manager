// Home page (issue #34 punch-list) — the "Pit Wall" launcher hub, the app's
// landing surface. A hero moment, a session launcher that hands its
// selection to whichever surface the user opens next, a recent-sessions
// stub, and a data-driven grid of every surface the app offers.
//
// The launcher's selection lives in local component state, NOT the URL —
// unlike DashboardPage, Home has no "view" of its own worth deep-linking to.
// Its only job is handing the chosen (year, gp, session, drivers) forward via
// each action link's `search={toRaw(selection)}`.

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SectionHeader } from '@/features/dashboard/components/SectionHeader'
import {
  applySelectionPatch,
  type DashboardSearch,
  type RawDashboardSearch,
} from '@/features/dashboard/search'
import { prewarmTelemetry } from '@/features/dashboard/queries'
import { SessionLauncher } from './components/SessionLauncher'
import { SurfaceCards } from './components/SurfaceCards'

/** Sample session behind the "recent sessions" empty state's CTA — the one
 *  FastF1 session guaranteed to be offline-cached in every environment (the
 *  golden verify session used across the whole migration, see MEMORY.md), so
 *  a first-time visitor always gets a real, fast-loading Dashboard. */
const SAMPLE_SESSION_SEARCH: RawDashboardSearch = {
  year: 2023,
  gp: 'Monaco Grand Prix',
  session: 'R',
  drivers: 'VER,LEC',
}

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

          {/* Recent sessions — a stub for this MVP (no persistence yet). Wrapped
              in a resting Card so the column reads as a real panel next to the
              launcher's glow card, instead of bare text floating beside it. */}
          <div className="flex flex-col gap-4 xl:col-span-1">
            <SectionHeader title="Recent sessions" />
            <Card className="flex-1">
              <EmptyState
                icon={<History className="size-8" aria-hidden="true" />}
                title="No sessions yet"
                description="Sessions you open land here so you can jump straight back in."
                action={
                  <Link to="/dashboard" search={SAMPLE_SESSION_SEARCH}>
                    <Button variant="ghost" size="sm">
                      Try the sample session
                    </Button>
                  </Link>
                }
              />
            </Card>
          </div>
        </div>

        <SurfaceCards />
      </div>
    </>
  )
}
