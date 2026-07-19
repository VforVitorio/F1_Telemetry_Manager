import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Keyboard, Pause, Play, Repeat, RotateCcw, Share2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/cn'
import { REPLAY_SPEEDS, type ReplaySpeed } from '../store'
import { ReplayScrubber } from './ReplayScrubber'
import { LiveGapReadout } from './LiveGapReadout'
import type { ReplayClock, ReplayModel, ReplayStatus, TrackMode } from './types'

// The "ready" pulse (M3, spec §3: name the primary action without a redesign)
// follows the same hand-rolled-`@keyframes` + `.f1-anim` convention as
// Modal/Toast/Tooltip (see Tooltip.tsx's file banner) — `.f1-anim` collapses
// the animation to ~0 under reduced motion instead of skipping it outright,
// so `onAnimationEnd` still fires and clears the one-shot state.
const PLAY_PULSE_KEYFRAMES = `
@keyframes f1-play-ready-pulse {
  0% { box-shadow: 0 0 0 0 rgba(108, 92, 231, 0.55); }
  70% { box-shadow: 0 0 0 10px rgba(108, 92, 231, 0); }
  100% { box-shadow: 0 0 0 0 rgba(108, 92, 231, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .f1-anim { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

/** Groups controls with intent (P2 "parking lot" fix): tight `gap-1` inside a
 *  cluster, a hairline divider between clusters. */
const GROUP_CLASSNAME = 'flex items-center gap-1'
const DIVIDER_CLASSNAME = 'hidden h-6 w-px shrink-0 bg-hairline sm:inline-block'

const KEYBOARD_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space / K', action: 'Play · pause' },
  { keys: '← / →', action: 'Seek ±0.5s (Shift ±5s)' },
  { keys: 'J / L', action: 'Speed down · up' },
  { keys: 'Home / End', action: 'Jump to start · end' },
  { keys: 'R', action: 'Restart' },
]

/** Tooltip content for the keyboard-hint button (H10: the shortcut map
 *  previously lived only in an aria-label, so sighted keyboard users had no
 *  way to discover it). */
function KeyboardShortcutsHint() {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 whitespace-nowrap">
      {KEYBOARD_SHORTCUTS.map(({ keys, action }) => (
        <div key={keys} className="contents">
          <dt className="font-mono text-[11px] font-medium text-fg-1">{keys}</dt>
          <dd className="text-[11px] text-fg-3">{action}</dd>
        </div>
      ))}
    </dl>
  )
}

// Real HTML transport controls for the replay (spec §4.6, fixes dossier #33 —
// Playwright/axe must be able to click Play and drive the scrubber directly).
// Speed and track-mode selectors are hand-rolled button rows rather than
// Radix `Tabs`: Tabs' roving-tabindex arrow-key navigation would fight
// `useReplayKeyboard`'s own ←/→ seek shortcut the instant focus lands inside
// one (both would fire on the same keypress). Plain buttons have no built-in
// arrow-key behaviour, so there is nothing to collide with.
//
// `useReplayKeyboard` itself is NOT wired up here — it needs the replay
// card's ref, which only the page owns. The page imports it directly from
// `./useReplayKeyboard` and attaches it to that ref; this file only renders
// controls.

const TRACK_MODE_OPTIONS: { value: TrackMode; label: string }[] = [
  { value: 'dominance', label: 'Dominance' },
  { value: 'speed', label: 'Speed' },
  { value: 'gain', label: 'Gain' },
]

export interface ReplayTransportProps {
  model: ReplayModel
  clock: ReplayClock
  status: ReplayStatus
  speed: ReplaySpeed
  onSpeedChange: (s: ReplaySpeed) => void
  loop: boolean
  onToggleLoop: () => void
  trackMode: TrackMode
  onTrackModeChange: (m: TrackMode) => void
  onShareMoment: () => void
}

interface SegmentOption<T extends string | number> {
  value: T
  label: string
}

/** Position + width of the sliding thumb, in CSS pixels — measured from the
 *  active button's own box, so content-sized labels ("Dominance" vs "Gain")
 *  each get an exact-fit pill rather than a fixed-width one. */
interface ThumbStyle {
  transform: string
  width: string
}

/** Small pressed-state button row — the shared shape behind the speed and
 *  track-mode selectors (see the file banner for why this isn't Radix Tabs).
 *  T1 (Comparison #36 backlog M7): an absolutely-positioned `bg-purple-600`
 *  pill slides/resizes under the active button via CSS `transform`+`width`
 *  instead of the background jumping between buttons — the buttons themselves
 *  keep only the text-colour swap, which `transition-colors` already
 *  crossfades in sync with the slide. */
function SegmentedControl<T extends string | number>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T
  options: SegmentOption<T>[]
  ariaLabel: string
  onChange: (next: T) => void
}) {
  const groupRef = useRef<HTMLDivElement | null>(null)
  // Persists across renders without re-triggering the measurement effect —
  // callback refs below keep it in sync with whichever buttons are mounted.
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>())
  const [thumbStyle, setThumbStyle] = useState<ThumbStyle | null>(null)

  // Read fresh by the (stable) measurer below without forcing it to depend on
  // — and re-create itself whenever — `value` changes.
  const valueRef = useRef(value)
  valueRef.current = value

  const measureThumb = useCallback(() => {
    const activeButton = buttonRefs.current.get(valueRef.current)
    if (!activeButton) return
    setThumbStyle({
      transform: `translateX(${activeButton.offsetLeft}px)`,
      width: `${activeButton.offsetWidth}px`,
    })
  }, [])

  // Re-measure whenever the active option (or the option set/labels) changes.
  // The group div is `relative`, so `offsetLeft` is exactly the thumb's target
  // translateX (it already accounts for the group's own `p-0.5` padding).
  useLayoutEffect(() => {
    measureThumb()
  }, [value, options, measureThumb])

  // Catches box changes the value/options deps above can't see — a webfont
  // (JetBrains Mono) finishing its load, or the group's container resizing.
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const observer = new ResizeObserver(measureThumb)
    observer.observe(group)
    return () => observer.disconnect()
  }, [measureThumb])

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      className="relative flex items-center gap-0.5 rounded-lg bg-bg-3 p-0.5"
    >
      {thumbStyle && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0 z-0 rounded-md bg-purple-600 transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
          style={thumbStyle}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          ref={(el) => {
            if (el) buttonRefs.current.set(option.value, el)
            else buttonRefs.current.delete(option.value)
          }}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors',
            'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
            option.value === value ? 'text-fg-1' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** `aria-valuetext` for the scrubber thumb — e.g. "34.2s of 70.3 — VER ahead 0.32s". */
function buildAriaValueText(model: ReplayModel) {
  return (t: number) => {
    const frame = model.frameAt(t)
    const leader = model.pilots[frame.leaderIndex]
    const gap = frame.gapSeconds.toFixed(2)
    return `${t.toFixed(1)}s of ${model.duration.toFixed(1)} — ${leader.code} ahead ${gap}s`
  }
}

/**
 * Transport bar for the replay card, grouped with intent rather than one flat
 * row (P2 "parking lot" fix): `[restart · play]` · scrubber · speed · a
 * hairline divider · track-mode · a hairline divider · `[loop · share ·
 * keyboard-hint]` · the live gap readout. Play is the one filled/primary
 * control — everything else is `ghost` — and pulses once the instant the
 * replay first reaches `ready` (M3). Every control is a real HTML `<button>`
 * so Playwright and axe can drive and inspect it directly. Tab order still
 * follows visual (left-to-right) order: restart → play → scrubber → speed →
 * track-mode → loop → share → keyboard-hint (spec §4.6).
 */
export function ReplayTransport({
  model,
  clock,
  status,
  speed,
  onSpeedChange,
  loop,
  onToggleLoop,
  trackMode,
  onTrackModeChange,
  onShareMoment,
}: ReplayTransportProps) {
  const isPlaying = status === 'playing'
  const speedOptions: SegmentOption<ReplaySpeed>[] = REPLAY_SPEEDS.map((s) => ({
    value: s,
    label: `${s}×`,
  }))

  // One-shot pulse the instant the replay first becomes `ready` (spec §3, M3)
  // — fires on the ready TRANSITION, not on every render, and self-clears via
  // `onAnimationEnd` so it never replays on a later ready (e.g. a fresh
  // compare remounts this component, so `prevStatusRef` starts `null` again).
  const prevStatusRef = useRef<ReplayStatus | null>(null)
  const [showReadyPulse, setShowReadyPulse] = useState(false)
  useEffect(() => {
    if (status === 'ready' && prevStatusRef.current !== 'ready') {
      setShowReadyPulse(true)
    }
    prevStatusRef.current = status
  }, [status])

  return (
    <div className="flex flex-wrap items-center gap-4">
      <style>{PLAY_PULSE_KEYFRAMES}</style>

      <div className={GROUP_CLASSNAME}>
        <Tooltip content="Restart">
          <Button variant="ghost" size="sm" aria-label="Restart" onClick={() => clock.restart()}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>

        <Button
          variant="primary"
          size="sm"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          className={cn(
            'h-11 min-w-11',
            showReadyPulse && 'f1-anim animate-[f1-play-ready-pulse_900ms_ease-out]',
          )}
          onClick={() => clock.toggle()}
          onAnimationEnd={() => setShowReadyPulse(false)}
        >
          {isPlaying ? (
            <Pause className="size-5" aria-hidden="true" />
          ) : (
            <Play className="size-5" aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="min-w-48 flex-1">
        <ReplayScrubber
          duration={model.duration}
          clock={clock}
          sectorTimes={model.sectorTimes}
          ariaValueText={buildAriaValueText(model)}
        />
      </div>

      <SegmentedControl
        ariaLabel="Playback speed"
        value={speed}
        options={speedOptions}
        onChange={onSpeedChange}
      />

      <span aria-hidden="true" className={DIVIDER_CLASSNAME} />

      <SegmentedControl
        ariaLabel="Track color mode"
        value={trackMode}
        options={TRACK_MODE_OPTIONS}
        onChange={onTrackModeChange}
      />

      <span aria-hidden="true" className={DIVIDER_CLASSNAME} />

      <div className={GROUP_CLASSNAME}>
        <Tooltip content={loop ? 'Loop on' : 'Loop off'}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle loop"
            aria-pressed={loop}
            onClick={onToggleLoop}
          >
            <Repeat className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>

        <Tooltip content="Copy a link that reopens the replay paused at this exact moment (adds &t= to the URL)">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Copy a link to this paused moment"
            onClick={onShareMoment}
          >
            <Share2 className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>

        <Tooltip content={<KeyboardShortcutsHint />}>
          <Button variant="ghost" size="sm" aria-label="Keyboard shortcuts">
            <Keyboard className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>

      <LiveGapReadout model={model} clock={clock} status={status} />
    </div>
  )
}
