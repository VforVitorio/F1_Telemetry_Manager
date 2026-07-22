// Recent sessions panel (Home, #186): the persisted launch history, rendered.
// Each row restores its session by navigating — the tab's URL contract
// rebuilds the full state from the search params, so the row only needs the
// stored fields. Clicking a row also re-records it (refreshes the timestamp
// and moves it to the front). The empty state keeps the sample-session CTA:
// the one FastF1 session guaranteed to be offline-cached everywhere, so a
// first-time visitor always gets a real, fast-loading Dashboard.

import { Link } from '@tanstack/react-router'
import { ArrowRightLeft, Crosshair, Gauge, History, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SectionHeader } from '@/features/dashboard/components/SectionHeader'
import { toRaw } from '@/features/dashboard/search'
import {
  useSessionsStore,
  type RecentSession,
  type RecordableSelection,
  type SessionSurface,
} from '../sessionsStore'

const SAMPLE_SESSION: RecordableSelection = {
  year: 2023,
  gp: 'Monaco Grand Prix',
  session: 'R',
  drivers: ['VER', 'LEC'],
}

const SURFACE_ICON: Record<SessionSurface, LucideIcon> = {
  dashboard: Gauge,
  comparison: ArrowRightLeft,
  strategy: Crosshair,
}

/** Coarse relative time — recents only need "how long ago", not a clock. */
function timeAgo(thenMs: number): string {
  const minutes = Math.floor((Date.now() - thenMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** The surface-specific Link around a row's content. `to` stays a literal
 *  string per branch (never threaded through a prop) so TanStack Router's
 *  typed route tree checks each target — same convention as Rail.tsx and the
 *  SessionLauncher. Strategy maps the selection onto its scenario shape (the
 *  first two drivers become driver + optional rival). */
function SessionLink({
  session,
  onOpen,
  children,
}: {
  session: RecentSession
  onOpen: () => void
  children: ReactNode
}) {
  const className =
    'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-fg-1/[0.04]'
  if (session.surface === 'comparison') {
    return (
      <Link to="/comparison" search={toRaw(session)} className={className} onClick={onOpen}>
        {children}
      </Link>
    )
  }
  if (session.surface === 'strategy') {
    return (
      <Link
        to="/strategy"
        search={{
          gp: session.gp,
          ...(session.drivers[0] ? { driver: session.drivers[0] } : {}),
          ...(session.drivers[1] ? { rival: session.drivers[1] } : {}),
        }}
        className={className}
        onClick={onOpen}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link to="/dashboard" search={toRaw(session)} className={className} onClick={onOpen}>
      {children}
    </Link>
  )
}

export function RecentSessions() {
  const sessions = useSessionsStore((state) => state.sessions)
  const recordSession = useSessionsStore((state) => state.recordSession)
  const removeSession = useSessionsStore((state) => state.removeSession)

  return (
    <div className="flex flex-col gap-4 xl:col-span-1">
      <SectionHeader title="Recent sessions" />
      <Card className="flex-1">
        {sessions.length === 0 ? (
          <EmptyState
            icon={<History className="size-8" aria-hidden="true" />}
            title="No sessions yet"
            description="Sessions you open land here so you can jump straight back in."
            action={
              <Link
                to="/dashboard"
                search={toRaw(SAMPLE_SESSION)}
                onClick={() => recordSession(SAMPLE_SESSION, 'dashboard')}
              >
                <Button variant="ghost" size="sm">
                  Try the sample session
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((session) => {
              const Icon = SURFACE_ICON[session.surface]
              return (
                <li key={session.id} className="flex items-center gap-1">
                  <SessionLink
                    session={session}
                    onOpen={() => recordSession(session, session.surface)}
                  >
                    <Icon className="size-4 shrink-0 text-purple-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg-1">
                        {session.gp} · {session.year}
                      </span>
                      <span className="block truncate font-mono text-xs text-fg-3">
                        {session.session}
                        {session.drivers.length > 0 ? ` · ${session.drivers.join(' · ')}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-fg-4">
                      {timeAgo(session.lastOpenedAt)}
                    </span>
                  </SessionLink>
                  <button
                    type="button"
                    aria-label={`Remove ${session.gp} ${session.year} from recent sessions`}
                    onClick={() => removeSession(session.id)}
                    className="shrink-0 rounded-md p-1.5 text-fg-4 transition-colors hover:bg-fg-1/[0.06] hover:text-fg-1"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
