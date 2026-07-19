import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ReplayStatus, TrackMode } from './replay/types'

// Comparison replay UI state (Zustand). Holds ONLY view/transport preferences and
// the coarse replay lifecycle — NOT the playhead time (that lives in a ref inside
// useReplayClock; 60 setState/s would re-render the whole tree) and NOT the
// comparison DATA (that's TanStack Query, immutable). The clock drives
// `status`; the transport drives speed/loop/trackMode.
//
// speed/loop/trackMode persist as preferences (like the Dashboard's chartLayout);
// `status` always resets to 'ready' on load.

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

interface ReplayState {
  /** Coarse lifecycle within a loaded comparison; set by useReplayClock. */
  status: ReplayStatus
  setStatus: (status: ReplayStatus) => void

  speed: ReplaySpeed
  setSpeed: (speed: ReplaySpeed) => void

  loop: boolean
  toggleLoop: () => void

  trackMode: TrackMode
  setTrackMode: (mode: TrackMode) => void

  /** Reset the transient lifecycle to a fresh paused-at-start (new comparison). */
  resetForNewComparison: () => void
}

export const useReplayStore = create<ReplayState>()(
  persist(
    (set) => ({
      status: 'ready',
      setStatus: (status) => set({ status }),

      speed: 1,
      setSpeed: (speed) => set({ speed }),

      loop: false,
      toggleLoop: () => set((s) => ({ loop: !s.loop })),

      trackMode: 'dominance',
      setTrackMode: (trackMode) => set({ trackMode }),

      resetForNewComparison: () => set({ status: 'ready' }),
    }),
    {
      name: 'f1sl.replay',
      partialize: (s) => ({ speed: s.speed, loop: s.loop, trackMode: s.trackMode }),
    },
  ),
)
