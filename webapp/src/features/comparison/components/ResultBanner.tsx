// Calm result banner (design spec §3, row "RESULT BANNER"): both drivers' lap
// times, the "who won by how much" headline, the Q-phase/fairness pills and
// the per-driver microsector tally — the one-glance verdict shown before the
// replay card even plays. Reads only `ReplayModel`; a resting `Card` (never
// `glow` — that elevation is reserved for the single replay card, spec §1/§3).

import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { getDriverTextColor } from '@/lib/drivers'
import type { ReplayModel } from '../replay/types'

export interface ResultBannerProps {
  model: ReplayModel
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

/** One driver's lap-time readout: team-coloured code + formatted time. */
function PilotLapTime({ code, lapTime }: { code: string; lapTime: number }) {
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-sm">
      <span style={{ color: getDriverTextColor(code) }} className="font-semibold">
        {code}
      </span>
      <span className="text-fg-2">{formatLapTime(lapTime)}</span>
    </span>
  )
}

/** "●WINNER first by N.NNNs" headline — the single-glance verdict, dot + code
 *  tinted in the winner's team colour. */
function WinnerHeadline({ model }: { model: ReplayModel }) {
  const { winner } = model
  const winnerColor = model.pilots[winner.winnerIndex].color
  return (
    <span className="flex items-center gap-1.5 text-sm text-fg-1">
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: winnerColor }}
      />
      <span className="font-semibold" style={{ color: getDriverTextColor(winner.winnerCode) }}>
        {winner.winnerCode}
      </span>
      <span>first by {winner.gapSeconds.toFixed(3)}s</span>
    </span>
  )
}

/** Per-driver microsector breakdown, team-coloured codes so "who's ahead
 *  where" reads unambiguously without the replay running (e.g. "VER 9 · LEC
 *  16 microsectors" — the two counts always sum to `nMicrosectors`). */
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
 * card: both drivers' lap times, the winner headline, the Q-phase/fairness
 * pills, and the per-driver microsector tally.
 */
export function ResultBanner({ model }: ResultBannerProps) {
  const [pilot1, pilot2] = model.pilots
  return (
    <Card elevation="resting" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <PilotLapTime code={pilot1.code} lapTime={pilot1.lapTime} />
          <PilotLapTime code={pilot2.code} lapTime={pilot2.lapTime} />
        </div>
        <WinnerHeadline model={model} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MetadataPills model={model} />
        <MicrosectorTally model={model} />
      </div>
    </Card>
  )
}
