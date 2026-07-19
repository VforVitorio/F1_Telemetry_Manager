import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { ReplayClock } from './types'

// Global keyboard transport for the replay card (spec §4.6, fixes dossier
// #33). The page attaches this to the focused replay `Card`'s ref; it covers
// the shortcut surface — play/pause, scrub, speed, restart — from anywhere
// inside the card. Generic over the speed type `S` so this stays a reusable
// transport primitive (spec §5's "keep the seams free of comparison-specific
// types"): TypeScript infers `S` as `ReplaySpeed` from the caller's actual
// `speed`/`speeds`/`onSpeedChange` without this file importing that type.

const NUDGE_SMALL_SECONDS = 0.5
const NUDGE_LARGE_SECONDS = 5

export interface UseReplayKeyboardOptions<S extends number = number> {
  clock: ReplayClock
  /** Lap duration in seconds — End seeks here. */
  duration: number
  speed: S
  speeds: readonly S[]
  onSpeedChange: (s: S) => void
}

/** True when the event's target is a text-entry control — shortcuts must not
 *  fire while the user is typing elsewhere on the page (e.g. a search field). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** True when the target is the scrubber thumb (Radix `role="slider"`). It
 *  handles ArrowLeft/Right/Home/End natively (fine 0.05s steps), so the
 *  card-level seek shortcuts must NOT also fire on those keys or every press
 *  seeks twice (0.05 + 0.5s). Non-seek shortcuts (play/speed/restart) still run. */
function isSliderTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[role="slider"]') !== null
}

/** One step through `speeds` in `direction`, clamped at the ends (no wrap). */
function stepSpeed<S extends number>(speeds: readonly S[], current: S, direction: 1 | -1): S {
  const currentIndex = speeds.indexOf(current)
  const baseIndex = currentIndex === -1 ? (direction > 0 ? -1 : speeds.length) : currentIndex
  const nextIndex = Math.min(Math.max(baseIndex + direction, 0), speeds.length - 1)
  return speeds[nextIndex] ?? current
}

/**
 * Attaches the replay transport's keyboard shortcuts to `ref.current`:
 * Space/K play-pause, ←/→ ±0.5s, Shift+←/→ ±5s, Home/End (start/duration),
 * J/L step speed down/up, R restart. Ignored while the event target is a
 * text input, textarea, or contenteditable element.
 */
export function useReplayKeyboard<S extends number = number>(
  ref: RefObject<HTMLElement | null>,
  opts: UseReplayKeyboardOptions<S>,
): void {
  const { clock, duration, speed, speeds, onSpeedChange } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return

      // The scrubber thumb owns the seek keys; skip them here to avoid a double
      // seek, but let play/speed/restart still work while the thumb is focused.
      const onSlider = isSliderTarget(event.target)
      const nudgeSeconds = event.shiftKey ? NUDGE_LARGE_SECONDS : NUDGE_SMALL_SECONDS

      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault()
          clock.toggle()
          break
        case 'ArrowLeft':
          if (onSlider) break
          event.preventDefault()
          clock.nudge(-nudgeSeconds)
          break
        case 'ArrowRight':
          if (onSlider) break
          event.preventDefault()
          clock.nudge(nudgeSeconds)
          break
        case 'Home':
          if (onSlider) break
          event.preventDefault()
          clock.seek(0)
          break
        case 'End':
          if (onSlider) break
          event.preventDefault()
          clock.seek(duration)
          break
        case 'j':
        case 'J':
          event.preventDefault()
          onSpeedChange(stepSpeed(speeds, speed, -1))
          break
        case 'l':
        case 'L':
          event.preventDefault()
          onSpeedChange(stepSpeed(speeds, speed, 1))
          break
        case 'r':
        case 'R':
          event.preventDefault()
          clock.restart()
          break
        default:
          break
      }
    }

    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [ref, clock, duration, speed, speeds, onSpeedChange])
}
