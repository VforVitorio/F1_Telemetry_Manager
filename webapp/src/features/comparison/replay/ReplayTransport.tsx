import { Pause, Play, Repeat, RotateCcw, Share2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/cn'
import { REPLAY_SPEEDS, type ReplaySpeed } from '../store'
import { ReplayScrubber } from './ReplayScrubber'
import { LiveGapReadout } from './LiveGapReadout'
import type { ReplayClock, ReplayModel, ReplayStatus, TrackMode } from './types'

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

/** Small pressed-state button row — the shared shape behind the speed and
 *  track-mode selectors (see the file banner for why this isn't Radix Tabs). */
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
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-lg bg-bg-3 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors',
            'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
            option.value === value ? 'bg-purple-600 text-fg-1' : 'text-fg-3 hover:text-fg-2',
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
 * Transport bar for the replay card: restart / play-pause / scrubber / speed /
 * loop / track-mode / share, plus the live gap readout. Every control is a
 * real HTML `<button>` so Playwright and axe can drive and inspect it
 * directly. Tab order follows visual (left-to-right) order: restart → play →
 * scrubber → speed → loop/track-mode/share (spec §4.6).
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip content="Restart">
        <Button variant="ghost" size="sm" aria-label="Restart" onClick={() => clock.restart()}>
          <RotateCcw className="size-4" aria-hidden="true" />
        </Button>
      </Tooltip>

      <Button
        variant="ghost"
        size="sm"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        className="h-11 min-w-11"
        onClick={() => clock.toggle()}
      >
        {isPlaying ? (
          <Pause className="size-5" aria-hidden="true" />
        ) : (
          <Play className="size-5" aria-hidden="true" />
        )}
      </Button>

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

      <SegmentedControl
        ariaLabel="Track color mode"
        value={trackMode}
        options={TRACK_MODE_OPTIONS}
        onChange={onTrackModeChange}
      />

      <Tooltip content="Copy a link to this moment">
        <Button variant="ghost" size="sm" aria-label="Share this moment" onClick={onShareMoment}>
          <Share2 className="size-4" aria-hidden="true" />
        </Button>
      </Tooltip>

      <LiveGapReadout model={model} clock={clock} status={status} />
    </div>
  )
}
