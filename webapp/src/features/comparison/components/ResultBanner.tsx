// Calm result banner: the one-glance verdict shown before the replay card even
// plays. The winner code + gap is the HERO (mono, 24px, semibold,
// team-coloured), "first by" is a tracked eyebrow, and both lap times + the
// microsector tally step down to secondary/tertiary — hierarchy comes from
// type, not glow, so this stays a resting `Card` (glow is reserved for the
// single replay card). The hero gap also counts up on mount, a tiny rAF loop
// with no new deps.

import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { cn } from '@/lib/cn'
import { getDriverTextColor } from '@/lib/drivers'
import type { ReplayModel } from '../replay/types'

export interface ResultBannerProps {
  model: ReplayModel
}

const COUNT_UP_MS = 600

/**
 * True when the OS prefers reduced motion, or when `matchMedia` isn't
 * available at all (older environments, or a test runner that hasn't
 * polyfilled it). Either way the safe default is "skip the animation" —
 * never leave a user or a test waiting on a rAF loop that may not run.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animates a display value from 0 up to `target` over `durationMs` via
 * requestAnimationFrame — the gap number *arrives* instead of popping in flat.
 * Tabular-nums on the caller keeps the digits
 * from shifting width mid-count. Resolves straight to `target` under
 * `prefersReducedMotion()`, both for accessibility and so the value is
 * assertable synchronously in tests.
 */
function useCountUp(target: number, durationMs: number = COUNT_UP_MS): number {
  const [value, setValue] = useState<number>(() => (prefersReducedMotion() ? target : 0))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    const startTime = performance.now()
    let frameId: number
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1)
      setValue(target * progress)
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [target, durationMs])

  return value
}

/**
 * Format a lap time in seconds as `m:ss.mmm` (broadcast-graphic convention,
 * matching the Streamlit source). Pure, unit-tested — the one thing in this
 * file worth a runnable check independent of rendering.
 */
export function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const remainderMs = totalMs - minutes * 60000
  const wholeSeconds = Math.floor(remainderMs / 1000)
  const milliseconds = remainderMs - wholeSeconds * 1000
  const secondsLabel = String(wholeSeconds).padStart(2, '0')
  const millisecondsLabel = String(milliseconds).padStart(3, '0')
  return `${minutes}:${secondsLabel}.${millisecondsLabel}`
}

/** The hero: "{winnerCode} +{gap}s" at 24px mono/semibold, winner-coloured,
 *  with "first by" demoted to an 11px tracked eyebrow above it. This is the
 *  tab's one-glance answer — everything else in the banner is secondary to
 *  this line. */
function VerdictHero({ model }: { model: ReplayModel }) {
  const { winner } = model
  const winnerColor = getDriverTextColor(winner.winnerCode)
  const gap = useCountUp(winner.gapSeconds)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-widest text-fg-3">first by</span>
      <span className="flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums">
        <span style={{ color: winnerColor }}>{winner.winnerCode}</span>
        <span className="text-fg-1">+{gap.toFixed(3)}s</span>
      </span>
    </div>
  )
}

/** One driver's lap-time readout: team-coloured code + formatted time. The
 *  winner's time is `font-semibold text-fg-1`; the loser's is regular-weight
 *  and muted (`text-fg-3`) — a secondary pair, clearly subordinate to the
 *  hero verdict above it. */
function PilotLapTime({
  code,
  lapTime,
  isWinner,
}: {
  code: string
  lapTime: number
  isWinner: boolean
}) {
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-sm">
      <span className="font-semibold" style={{ color: getDriverTextColor(code) }}>
        {code}
      </span>
      <span className={cn('tabular-nums', isWinner ? 'font-semibold text-fg-1' : 'text-fg-3')}>
        {formatLapTime(lapTime)}
      </span>
    </span>
  )
}

/** Per-driver microsector breakdown, team-coloured codes so "who's ahead
 *  where" reads unambiguously without the replay running (e.g. "VER 9 · LEC
 *  16 microsectors" — the two counts always sum to `nMicrosectors`). Stays
 *  the smallest text in the banner — tertiary, below the lap-time pair. */
function MicrosectorTally({ model }: { model: ReplayModel }) {
  const [pilot1, pilot2] = model.pilots
  const [tally1, tally2] = model.microsectorTally
  return (
    <span className="text-xs text-fg-3">
      <span style={{ color: getDriverTextColor(pilot1.code) }}>
        {pilot1.code} {tally1}
      </span>
      {' · '}
      <span style={{ color: getDriverTextColor(pilot2.code) }}>
        {pilot2.code} {tally2}
      </span>
      {' microsectors'}
    </span>
  )
}

/** Q-phase / fairness pills (spec row 8) — real domain logic surfaced
 *  verbatim. Present only for Q sessions; Race/Sprint/Practice ship both
 *  `null` in `metadata`, so this renders nothing for them. */
function MetadataPills({ model }: { model: ReplayModel }) {
  const { qualifying_phase: qualifyingPhase, warning } = model.metadata
  if (!qualifyingPhase && !warning) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {qualifyingPhase && <Pill tone="success">fastest laps from {qualifyingPhase}</Pill>}
      {warning && <Pill tone="warning">{warning}</Pill>}
    </div>
  )
}

/**
 * The calm result banner sitting between the context bar and the replay
 * card: the winner verdict (hero), both drivers' lap times (secondary), the
 * Q-phase/fairness pills, and the per-driver microsector tally (tertiary).
 */
export function ResultBanner({ model }: ResultBannerProps) {
  const [pilot1, pilot2] = model.pilots
  const { winner } = model
  return (
    <Card elevation="resting" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <VerdictHero model={model} />
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] font-medium uppercase tracking-widest text-fg-3">
            lap time
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <PilotLapTime
              code={pilot1.code}
              lapTime={pilot1.lapTime}
              isWinner={winner.winnerIndex === 0}
            />
            <PilotLapTime
              code={pilot2.code}
              lapTime={pilot2.lapTime}
              isWinner={winner.winnerIndex === 1}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MetadataPills model={model} />
        <MicrosectorTally model={model} />
      </div>
    </Card>
  )
}
