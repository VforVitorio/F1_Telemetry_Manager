import { useMemo } from 'react'
import { useReplayTime } from './useReplayClock'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'

// Compact "who's ahead, by how much" readout. While the replay is running or
// paused mid-lap, this tracks the live on-track leader and gap (`frameAt`);
// once it finishes, `frameAt`'s live gap has decayed to 0 (both cars share the
// finish distance), so the frozen `WinnerMeta` — the real lap-time delta — is
// the number worth showing instead.

const READOUT_HZ = 10

// Below this on-track separation the cars are genuinely level (mainly t=0, where
// the gap is exactly 0). A 0.05s gap is a real lead in F1, not a tie; 0.01s is
// the true "too close to call" floor.
const GAP_TIE_THRESHOLD_SECONDS = 0.01

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

  // Fixed width + right-justified so the text swapping (leader code ↔ "Level",
  // gap value ticking) never reflows the transport row — the scrubber sits on
  // the same flex line and was jittering a pixel as this readout changed size.
  return (
    <div
      className="flex w-32 shrink-0 items-center justify-end gap-2 font-mono text-sm whitespace-nowrap"
      title="Leader and on-track gap"
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium text-fg-1">{isTie ? 'Level' : code}</span>
      {/* When level there is no meaningful gap to show — a "Level" with a value
          next to it reads as a contradiction. Only render the gap when a leader
          is named. */}
      {!isTie && (
        <span className="tabular-nums text-fg-2">
          <span aria-hidden="true">▲</span> {gapText}
        </span>
      )}
    </div>
  )
}
