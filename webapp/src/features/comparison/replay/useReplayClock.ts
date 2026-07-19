// The ONE rAF clock for the Comparison replay (spec §4.2/§4.3, #36). Every
// other replay piece — TrackCanvas, the channel-chart playhead overlay, the
// transport bar, the scrubber — reads time through THIS clock; nothing else
// runs its own requestAnimationFrame loop. The playhead lives in a ref, never
// React state, so a 60fps tick does not re-render the component tree: canvas
// and DOM-overlay consumers call `subscribe` and paint imperatively, and only
// `useReplayTime` (throttled text readouts) lifts it into React state.
//
// WHERE TO CHANGE IF THE TRANSPORT CONTRACT CHANGES: this file owns the whole
// play/pause/seek/loop state machine. `ReplayClock` (src/features/comparison/
// replay/types.ts) is the frozen shape every consumer imports — change the
// interface there first, then this implementation.

import { useEffect, useRef, useState } from 'react'
import type { ReplayClock } from './types'

/** Playback lifecycle events the clock reports as they happen, not per frame. */
type ReplayClockStatus = 'playing' | 'paused' | 'finished'

export interface UseReplayClockOptions {
  /** Lap duration in seconds (max of the two pilots' lap times). The clock
   *  never advances past it; a non-positive duration disables playback. */
  duration: number
  /** Playback speed multiplier (REPLAY_SPEEDS: 0.25/0.5/1/2). Read fresh every
   *  frame from a ref, so dragging the speed control mid-play changes pace on
   *  the very next tick — no loop restart. */
  speed: number
  /** When true, hitting `duration` wraps the playhead to 0 and keeps playing
   *  instead of stopping and firing 'finished'. */
  loop: boolean
  onStatusChange?: (status: ReplayClockStatus) => void
}

/** The clock's public API plus the two internals the visibilitychange effect
 *  needs to drive the loop by hand (pause it on hide, resume it on return). */
interface ClockEngine {
  clock: ReplayClock
  advance: (now: number) => void
  cancelLoop: () => void
}

/**
 * The one rAF-driven playhead for the replay. Time lives in a `useRef<number>`
 * — never React state — so the running loop does not re-render the tree;
 * consumers read `getTime()` on demand or register a `subscribe` callback for
 * per-frame imperative repaints (canvas, DOM-overlay `transform`). `duration`/
 * `speed`/`loop`/`onStatusChange` are synced into refs on every render so a
 * loop already in flight always observes the latest values.
 *
 * The engine (and the `ReplayClock` it exposes) is built exactly once via a
 * `useState` lazy initializer — React guarantees that function runs a single
 * time regardless of re-renders, so the clock's identity never changes for
 * the life of the hook and consumers that memoize on it never see churn.
 * (A `useRef` + "if null, create" check would work too, but leaves the ref's
 * `T | null` type unnarrowed past the effect below — `useState` sidesteps it.)
 */
export function useReplayClock(opts: UseReplayClockOptions): ReplayClock {
  const { duration, speed, loop, onStatusChange } = opts

  // Latest-value refs: read by the loop each frame, written on every render.
  const durationRef = useRef(duration)
  const speedRef = useRef(speed)
  const loopRef = useRef(loop)
  const onStatusChangeRef = useRef(onStatusChange)
  durationRef.current = duration
  speedRef.current = speed
  loopRef.current = loop
  onStatusChangeRef.current = onStatusChange

  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const resumeAfterHiddenRef = useRef(false)
  const subscribersRef = useRef(new Set<(t: number) => void>())

  const [engine] = useState<ClockEngine>(() => {
    const notify = () => {
      for (const cb of subscribersRef.current) cb(timeRef.current)
    }

    const cancelLoop = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }

    /**
     * One rAF step: advance the playhead by elapsed-time × speed, clamp (or
     * wrap, if looping) at `duration`, then notify subscribers. Re-arms itself
     * via `requestAnimationFrame` unless playback just stopped.
     */
    const advance = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000
      lastFrameRef.current = now

      const dur = durationRef.current
      const rawNext = timeRef.current + dt * speedRef.current
      timeRef.current = dur > 0 ? Math.min(rawNext, dur) : 0
      notify()

      const reachedEnd = dur > 0 && timeRef.current >= dur
      if (reachedEnd) {
        if (loopRef.current) {
          timeRef.current = 0
          rafIdRef.current = requestAnimationFrame(advance)
          return
        }
        playingRef.current = false
        rafIdRef.current = null
        onStatusChangeRef.current?.('finished')
        return
      }
      rafIdRef.current = requestAnimationFrame(advance)
    }

    const getTime = () => timeRef.current
    const isPlaying = () => playingRef.current

    const play = () => {
      // Already running, or nothing to play (guards against /0 and NaN).
      if (playingRef.current || durationRef.current <= 0) return
      if (!loopRef.current && timeRef.current >= durationRef.current) {
        timeRef.current = 0
        notify()
      }
      playingRef.current = true
      lastFrameRef.current = performance.now() // fresh baseline: no dt spike
      rafIdRef.current = requestAnimationFrame(advance)
      onStatusChangeRef.current?.('playing')
    }

    const pause = () => {
      if (!playingRef.current) return
      playingRef.current = false
      cancelLoop()
      onStatusChangeRef.current?.('paused')
    }

    const toggle = () => {
      if (playingRef.current) pause()
      else play()
    }

    const seek = (t: number) => {
      const dur = durationRef.current
      timeRef.current = dur > 0 ? Math.min(Math.max(t, 0), dur) : 0
      notify()
      // Still playing: rebase the dt origin so the next tick doesn't jump by
      // "however long the scrub took" on top of the seek itself.
      if (playingRef.current) lastFrameRef.current = performance.now()
    }

    const nudge = (dt: number) => seek(getTime() + dt)

    const restart = () => {
      seek(0)
      play()
    }

    const subscribe = (cb: (t: number) => void) => {
      subscribersRef.current.add(cb)
      return () => subscribersRef.current.delete(cb)
    }

    const clock: ReplayClock = {
      play,
      pause,
      toggle,
      seek,
      nudge,
      restart,
      subscribe,
      getTime,
      isPlaying,
    }

    return { clock, advance, cancelLoop }
  })

  // Background tabs: cancel the frame loop explicitly on hide (a throttled
  // background tab must never deliver one huge `dt`), and on return resume
  // from a fresh `performance.now()` — the hidden interval is never treated as
  // elapsed playback time.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (playingRef.current) {
          engine.cancelLoop()
          resumeAfterHiddenRef.current = true
        }
      } else if (resumeAfterHiddenRef.current) {
        // Always clear the flag on return, but only re-arm the loop if the clock
        // is STILL logically playing — a pause() that landed while hidden (e.g.
        // programmatic) must not be undone by the resume.
        resumeAfterHiddenRef.current = false
        if (playingRef.current) {
          lastFrameRef.current = performance.now()
          rafIdRef.current = requestAnimationFrame(engine.advance)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      engine.cancelLoop()
    }
  }, [engine])

  return engine.clock
}

/**
 * Throttled React-state mirror of the clock's playhead, for TEXT readouts only
 * (elapsed/remaining labels, tooltips). This is the ONLY place the clock's
 * ref-based time is lifted into React state — canvas and DOM-overlay consumers
 * must keep reading `clock.getTime()` inside their own `subscribe` callback so
 * a 60fps tick never re-renders the tree (spec §4.2).
 */
export function useReplayTime(clock: ReplayClock, hz = 10): number {
  const [time, setTime] = useState(clock.getTime())
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    const minIntervalMs = 1000 / hz
    const unsubscribe = clock.subscribe((t) => {
      const now = performance.now()
      if (now - lastUpdateRef.current < minIntervalMs) return
      lastUpdateRef.current = now
      setTime(t)
    })
    // Sync immediately so switching to a different clock (or hz) never shows
    // a stale time until the next throttled tick fires.
    setTime(clock.getTime())
    return unsubscribe
  }, [clock, hz])

  return time
}
