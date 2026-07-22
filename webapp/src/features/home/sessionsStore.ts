// Recent-sessions store (Home, #186). A "session" here is just the launcher's
// selection plus where it was opened: every tab rebuilds its full state from
// URL search params, so persisting a session means persisting the fields the
// URL contract needs — restoring one is nothing more than navigating.
//
// Records happen at launch time (the SessionLauncher's action links and the
// sample CTA) and when a recent row is re-opened. Dedup identity is
// year + GP + drivers: re-opening the same session refreshes its timestamp
// and surface and moves it to the front instead of piling up duplicates. The
// list is capped so the panel never grows unbounded. localStorage only
// (`f1sl.sessions`), same persist pattern as `f1sl.ui` and the chat store.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SessionSurface = 'dashboard' | 'comparison' | 'strategy'

export interface RecentSession {
  id: string
  year: number
  gp: string
  session: string
  drivers: string[]
  surface: SessionSurface
  lastOpenedAt: number
}

/** The launcher fields a record needs — `DashboardSearch` with the three
 *  required pieces actually present (the launcher only fires when ready). */
export interface RecordableSelection {
  year: number
  gp: string
  session: string
  drivers: string[]
}

export const MAX_RECENT_SESSIONS = 8

/** Dedup identity: what a user would call "the same session" — GP + drivers
 *  + year. Drivers are sorted so NOR,VER and VER,NOR collapse into one. */
export function sessionId(sel: RecordableSelection): string {
  return `${sel.year}·${sel.gp}·${[...sel.drivers].sort().join(',')}`
}

interface SessionsState {
  sessions: RecentSession[]
  recordSession: (sel: RecordableSelection, surface: SessionSurface) => void
  removeSession: (id: string) => void
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set) => ({
      sessions: [],
      recordSession: (sel, surface) =>
        set((state) => {
          const id = sessionId(sel)
          const rest = state.sessions.filter((existing) => existing.id !== id)
          const entry: RecentSession = {
            id,
            year: sel.year,
            gp: sel.gp,
            session: sel.session,
            drivers: sel.drivers,
            surface,
            lastOpenedAt: Date.now(),
          }
          return { sessions: [entry, ...rest].slice(0, MAX_RECENT_SESSIONS) }
        }),
      removeSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((existing) => existing.id !== id) })),
    }),
    { name: 'f1sl.sessions' },
  ),
)
