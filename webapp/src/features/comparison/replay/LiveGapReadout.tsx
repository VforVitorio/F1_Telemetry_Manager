import { useMemo } from 'react'
import { useReplayTime } from './useReplayClock'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'

// Compact "who's ahead, by how much" readout (spec §4.6). While the replay is
// running or paused mid-lap, this tracks the live on-track leader and gap
// (`frameAt`); once it finishes, `frameAt`'s live gap has decayed to 0 (both
// cars share the finish distance), so the frozen `WinnerMeta` — the real
// lap-time delta — is the number worth showing instead.

const READOUT_HZ = 10

// Below this on-track separation, calling either car "leader" is a coin-flip
// tie-break dressed up as a claim (P3: at t=0 the gap is exactly 0, so the
// old code always named pilot 0 the "leader" of a race that hadn't started).
const GAP_TIE_THRESHOLD_SECONDS = 0.05

export interface LiveGapReadoutProps {
  model: ReplayModel
  clock: ReplayClock
  status: ReplayStatus
}

interface GapDisplay {
  /** Null when the on-track gap is within the tie threshold — no leader to name. */
  code: string | null
  color: string
  gapText: string
}

/** Live leader + on-track gap mid-replay (or "level" within the tie
 *  threshold), or the frozen winner + final lap-time delta once `status` is
 *  'finished' — the finished delta is a real lap-time result, never a tie. */
function resolveGapDisplay(model: ReplayModel, status: ReplayStatus, t: number): GapDisplay {
  if (status === 'finished') {
    const { winner } = model
    return {
      code: winner.winnerCode,
      color: model.pilots[winner.winnerIndex].color,
      gapText: `${winner.gapSeconds.toFixed(2)}s`,
    }
  }
  const frame = model.frameAt(t)
  const gapText = `${frame.gapSeconds.toFixed(2)}s`
  if (frame.gapSeconds < GAP_TIE_THRESHOLD_SECONDS) {
    return { code: null, color: 'var(--fg-4)', gapText }
  }
  const leader = model.pilots[frame.leaderIndex]
  return { code: leader.code, color: leader.color, gapText }
}

/** Team-coloured leader code + live/final gap, mono and compact — or "Level"
 *  when the on-track gap is too small to attribute a leader. */
export function LiveGapReadout({ model, clock, status }: LiveGapReadoutProps) {
  const t = useReplayTime(clock, READOUT_HZ)
  const { code, color, gapText } = useMemo(
    () => resolveGapDisplay(model, status, t),
    [model, status, t],
  )
  const isTie = code === null

  return (
    <div className="flex items-center gap-2 font-mono text-sm" title="Leader and on-track gap">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium text-fg-1">{isTie ? 'Level' : code}</span>
      <span className="tabular-nums text-fg-2">
        <span aria-hidden="true">{isTie ? '=' : '▲'}</span> {gapText}
      </span>
    </div>
  )
}
