// Surface grid (Home page) — a catalogue of every surface the app offers.
// Dashboard is `live`; the other five carry a "Soon" pill, previewing the
// migration roadmap instead of hiding what is not built yet.
//
// Each card's `<Link to="...">` is written out literal-by-literal rather than
// mapped from an array, matching Rail.tsx's own convention: TanStack
// Router's typed `Link` infers its `to` generic from the literal string at
// the JSX call site, and a `SURFACES.map((s) => <Link to={s.to}>)` would
// widen that literal to the whole route-path union, losing the type-check
// the literal form gives for free. Only the CARD BODY (icon, title, blurb,
// Soon pill) is shared below — that part carries no route type, so factoring
// it out costs nothing.

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Crosshair,
  Flag,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { SectionHeader } from '@/features/dashboard/components/SectionHeader'

interface SurfaceCardBodyProps {
  icon: LucideIcon
  title: string
  blurb: string
  live: boolean
}

/** The shared card face: icon badge top-left, a "Soon" pill top-right for
 *  everything but the shipped Dashboard, title + blurb below. The card is
 *  the direct child of a `<Link>` at every call site, so its hover/focus
 *  treatment reacts to the parent's `group` state rather than its own. */
function SurfaceCardBody({ icon: Icon, title, blurb, live }: SurfaceCardBodyProps) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:bg-bg-4 group-focus-visible:ring-2 group-focus-visible:ring-purple-400">
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-[image:var(--grad-purple-soft)]">
          <Icon className="size-4.5 text-accent-hover" strokeWidth={1.75} aria-hidden="true" />
        </span>
        {!live && <Pill tone="neutral">Soon</Pill>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-sm font-medium text-fg-1">{title}</span>
        <span className="text-sm text-fg-3">{blurb}</span>
      </div>
    </Card>
  )
}

/** The 6-surface grid: Dashboard (live) plus the five surfaces still on the
 *  migration roadmap, each a whole-card link into its route so Home doubles
 *  as the app's table of contents. */
export function SurfaceCards() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Surfaces" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link to="/dashboard" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={LayoutDashboard}
            title="Dashboard"
            blurb="Lap times, circuit domination and 8 telemetry channels for up to 3 drivers."
            live
          />
        </Link>
        <Link to="/comparison" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={ArrowRightLeft}
            title="Comparison"
            blurb="Side-by-side driver deltas: pace, sectors and tyre stints across one session."
            live={false}
          />
        </Link>
        <Link to="/strategy" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={Crosshair}
            title="Strategy"
            blurb="The multi-agent pit wall: recommendations with confidence, scenarios and agent traces."
            live={false}
          />
        </Link>
        <Link to="/race" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={Flag}
            title="Race"
            blurb="Full-race analysis: position changes, stint timelines and safety-car windows."
            live={false}
          />
        </Link>
        <Link to="/lab" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={FlaskConical}
            title="Lab"
            blurb="The model laboratory: run the ML predictors against any session."
            live={false}
          />
        </Link>
        <Link to="/chat" className="group block focus-visible:outline-none">
          <SurfaceCardBody
            icon={MessageSquare}
            title="Chat"
            blurb="Ask the strategy engineer: tool-calling chat over your session."
            live={false}
          />
        </Link>
      </div>
    </section>
  )
}
