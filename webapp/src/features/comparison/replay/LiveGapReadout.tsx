import { useMemo } from 'react'
import { useReplayTime } from './useReplayClock'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'

// Compact "who's ahead, by how much" readout (spec §4.6). While the replay is
// running or paused mid-lap, this tracks the live on-track leader and gap
// (`frameAt`); once it finishes, `frameAt`'s live gap has decayed to 0 (both
// cars share the finish distance), so the frozen `WinnerMeta` — the real
// lap-time delta — is the number worth showing instead.

const READOUT_HZ = 10

export interface LiveGapReadoutProps {
  model: ReplayModel
  clock: ReplayClock
  status: ReplayStatus
}

interface GapDisplay {
  code: string
  color: string
  gapText: string
}

/** Live leader + on-track gap mid-replay, or the frozen winner + final
 *  lap-time delta once `status` is 'finished'. */
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
  const leader = model.pilots[frame.leaderIndex]
  return { code: leader.code, color: leader.color, gapText: `${frame.gapSeconds.toFixed(2)}s` }
}

/** Team-coloured leader code + live/final gap, mono and compact. */
export function LiveGapReadout({ model, clock, status }: LiveGapReadoutProps) {
  const t = useReplayTime(clock, READOUT_HZ)
  const { code, color, gapText } = useMemo(
    () => resolveGapDisplay(model, status, t),
    [model, status, t],
  )

  return (
    <div className="flex items-center gap-2 font-mono text-sm" title="Leader and on-track gap">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium text-fg-1">{code}</span>
      <span className="tabular-nums text-fg-2">
        <span aria-hidden="true">▲</span> {gapText}
      </span>
    </div>
  )
}
