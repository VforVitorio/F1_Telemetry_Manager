// Session launcher (Home page) — the ONE glow card on the Pit Wall. Reuses
// the Dashboard's cascading Year > GP > Session > Drivers toolbar verbatim
// (SelectorsToolbar is a dumb value/onChange renderer, so it works the same
// way here as it does on /dashboard) and turns the resulting selection into
// three action links. Each ready link forwards the selection via
// `search={toRaw(value)}` so the surface it opens lands on the exact session
// just picked, instead of starting cold — the whole point of the launcher.

import { Link } from '@tanstack/react-router'
import { ArrowRightLeft, Crosshair, Gauge, type LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/features/dashboard/components/SectionHeader'
import { SelectorsToolbar } from '@/features/dashboard/components/SelectorsToolbar'
import { toRaw, type DashboardSearch } from '@/features/dashboard/search'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { useSessionsStore, type SessionSurface } from '../sessionsStore'

export interface SessionLauncherProps {
  value: DashboardSearch
  onChange: (patch: Partial<DashboardSearch>) => void
}

/** Icon + label, shared by both the enabled-Link and the disabled-Button
 *  rendering of one action, so the ready/not-ready branch below only ever
 *  differs in wrapper (Link vs. plain disabled Button), never in content.
 *
 *  There used to be an optional `soon` flag that hung a "Soon" pill on the
 *  Comparison action. Comparison shipped and the pill did not come off, so the
 *  launcher advertised a finished surface as unbuilt. The flag is gone rather
 *  than set to false everywhere: a prop every call site passes the same value
 *  to is one more thing to forget, and re-adding a pill for a genuinely
 *  unfinished action is three lines. */
function ActionContent({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </>
  )
}

/**
 * The launcher card: the 4 cascading selectors, then an actions row. "Open in
 * Dashboard" is primary and becomes a real link once year, GP AND session are
 * all chosen (drivers stay optional — the Dashboard prompts for them itself).
 * Comparison and Strategy are secondary actions using the same
 * selection-forwarding cross-link the Dashboard already wires up for
 * Comparison (see DashboardPage's "Go to comparison"), so picking a session
 * here carries straight through to either surface. Both shipped (#35/#36);
 * they were previews once and the prose said so long after they stopped
 * being previews.
 *
 * `to` is kept a literal string at each `<Link>` call site (never threaded
 * through a prop), matching Rail.tsx's own convention: that is what lets
 * TanStack Router's typed `Link` infer the exact route instead of widening
 * the generic to `string`. A disabled Button is rendered standalone, never
 * nested inside a Link — the Link only exists once the action is real.
 */
export function SessionLauncher({ value, onChange }: SessionLauncherProps) {
  const ready = value.year != null && !!value.gp && !!value.session
  const recordSession = useSessionsStore((state) => state.recordSession)

  /** Persist the launch into the recents panel (#186). Guarded on the same
   *  fields `ready` checks so TypeScript narrows them; only reachable from
   *  the ready branches below. */
  function recordLaunch(surface: SessionSurface) {
    if (value.year == null || !value.gp || !value.session) return
    recordSession(
      { year: value.year, gp: value.gp, session: value.session, drivers: value.drivers },
      surface,
    )
  }

  return (
    <Card elevation="glow" className="flex flex-col gap-5 p-6">
      <SectionHeader title="Launch a session" />
      <SelectorsToolbar value={value} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {ready ? (
          <Link to="/dashboard" search={toRaw(value)} onClick={() => recordLaunch('dashboard')}>
            <Button size="md">
              <ActionContent icon={Gauge} label="Open in Dashboard" />
            </Button>
          </Link>
        ) : (
          <Button size="md" disabled>
            <ActionContent icon={Gauge} label="Open in Dashboard" />
          </Button>
        )}

        {ready ? (
          <Link to="/comparison" search={toRaw(value)} onClick={() => recordLaunch('comparison')}>
            <Button variant="ghost">
              <ActionContent icon={ArrowRightLeft} label="Comparison" />
            </Button>
          </Link>
        ) : (
          <Button variant="ghost" disabled>
            <ActionContent icon={ArrowRightLeft} label="Comparison" />
          </Button>
        )}

        {ready ? (
          // Strategy is live (#35). Map the launcher selection onto the Strategy
          // scenario shape: GP carries over, the first two picked drivers become
          // the driver + optional rival for the pit-wall duel.
          <Link
            to="/strategy"
            onClick={() => recordLaunch('strategy')}
            search={{
              ...(value.gp ? { gp: value.gp } : {}),
              ...(value.drivers[0] ? { driver: value.drivers[0] } : {}),
              ...(value.drivers[1] ? { rival: value.drivers[1] } : {}),
            }}
          >
            <Button variant="ghost">
              <ActionContent icon={Crosshair} label="Strategy" />
            </Button>
          </Link>
        ) : (
          <Button variant="ghost" disabled>
            <ActionContent icon={Crosshair} label="Strategy" />
          </Button>
        )}

        <span className="ml-auto text-xs text-fg-4">
          Selections carry over — the link is shareable.
        </span>
      </div>
    </Card>
  )
}
