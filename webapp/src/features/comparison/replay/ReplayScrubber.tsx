import * as SliderPrimitive from '@radix-ui/react-slider'
import { useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useReplayTime } from './useReplayClock'
import type { ReplayClock } from './types'

// Time-domain scrubber for the replay clock. Built directly on
// `@radix-ui/react-slider` rather than the shared `Slider` — the scrubber needs
// `aria-valuetext` and S1/S2/S3 sector ticks that `Slider` deliberately doesn't
// support (see Slider.tsx's own comment).
//
// While the user is NOT dragging, the thumb mirrors `useReplayTime` (the
// throttled clock mirror, bumped to 30Hz here — smooth enough for a single
// visual element without re-rendering the whole tree). While dragging, a local
// `dragTime` state takes over: `onValueChange` seeks the clock live so the
// redraw is O(1), and playback pauses for the drag, resuming on release only if
// it was actually playing.

const SCRUBBER_HZ = 30
const STEP_SECONDS = 0.05

const ROOT_CLASSNAME = 'relative flex h-5 w-full touch-none select-none items-center'
const TRACK_CLASSNAME = 'relative h-1.5 w-full grow overflow-hidden rounded-full bg-bg-5'
const RANGE_CLASSNAME = 'absolute h-full rounded-full bg-purple-600'
const THUMB_CLASSNAME = cn(
  'block size-4 rounded-full bg-fg-1 shadow-[var(--shadow-card)]',
  'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
)

export interface ReplayScrubberProps {
  duration: number
  clock: ReplayClock
  /** Sector boundary times (s), for the S1/S2/S3 ticks — placeholder 25/50/75%
   *  of duration when the model has no official splits. */
  sectorTimes: number[]
  /** Builds the thumb's `aria-valuetext` for a given elapsed time. */
  ariaValueText: (t: number) => string
}

/** `m:ss.s` — the compact current/duration readout above the track. */
function formatClock(t: number): string {
  const clamped = Math.max(0, t)
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

/** Left-offset percentage for a sector time, shared by its tick and label. */
function sectorPercent(sectorTime: number, duration: number): string {
  const fraction = duration > 0 ? sectorTime / duration : 0
  return `${Math.min(Math.max(fraction, 0), 1) * 100}%`
}

/** Shared hover title for a sector tick/label — honestly discloses that the
 *  split is the 25/50/75%-of-duration placeholder (`buildReplayModel`'s
 *  `sectorTimes`), not an official S1/S2/S3 boundary. */
function sectorTitle(index: number): string {
  return `S${index + 1} split (est.)`
}

export function ReplayScrubber({
  duration,
  clock,
  sectorTimes,
  ariaValueText,
}: ReplayScrubberProps) {
  const throttledTime = useReplayTime(clock, SCRUBBER_HZ)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const resumeOnReleaseRef = useRef(false)

  const displayTime = dragTime ?? throttledTime

  function handlePointerDown() {
    resumeOnReleaseRef.current = clock.isPlaying()
    clock.pause()
    setDragTime(clock.getTime())
  }

  function handleValueChange([next]: number[]) {
    if (next === undefined) return
    setDragTime(next)
    clock.seek(next)
  }

  function handleValueCommit() {
    setDragTime(null)
    // Capture-and-reset: without clearing the ref, a later KEYBOARD commit (Radix
    // fires onValueCommit on arrow keys too, with no preceding pointerDown to
    // re-arm the ref) would replay the last pointer-drag's "was playing" verdict
    // and spuriously resume playback.
    const resume = resumeOnReleaseRef.current
    resumeOnReleaseRef.current = false
    if (resume) clock.play()
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="tabular-nums text-fg-2">{formatClock(displayTime)}</span>
        <span className="tabular-nums text-fg-3">{formatClock(duration)}</span>
      </div>

      <SliderPrimitive.Root
        min={0}
        max={duration}
        step={STEP_SECONDS}
        value={[displayTime]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        onPointerDown={handlePointerDown}
        className={ROOT_CLASSNAME}
      >
        <SliderPrimitive.Track className={TRACK_CLASSNAME}>
          <SliderPrimitive.Range className={RANGE_CLASSNAME} />
          {sectorTimes.map((t, i) => (
            <span
              key={t}
              aria-hidden="true"
              title={sectorTitle(i)}
              className="absolute top-0 h-full w-0.5 bg-fg-3"
              style={{ left: sectorPercent(t, duration) }}
            />
          ))}
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Replay position"
          aria-valuetext={ariaValueText(displayTime)}
          className={THUMB_CLASSNAME}
        />
      </SliderPrimitive.Root>

      <div className="relative h-3 w-full" aria-hidden="true">
        {sectorTimes.map((t, i) => (
          <span
            key={t}
            title={sectorTitle(i)}
            className="absolute -translate-x-1/2 font-mono text-[11px] text-fg-3"
            style={{ left: sectorPercent(t, duration) }}
          >
            S{i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}
