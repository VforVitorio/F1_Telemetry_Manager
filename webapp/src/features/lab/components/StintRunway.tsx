// StintRunway — a lap-axis strip reading "how many laps of tyre life are left".
// Plain DOM/CSS (the RangeBar idiom, no chart lib): a track from the stint
// start to the horizon, a "now" marker at the current tyre age, and a cliff
// zone shaded from the P10 (earliest) to P90 (latest) laps-to-cliff estimate
// with a firmer P50 line. It turns three abstract cliff quantiles into one
// legible "you're here, the cliff is roughly there" read.

interface StintRunwayProps {
  /** Current tyre age in laps (the "now" position). */
  tyreLife: number
  /** Laps remaining until the degradation cliff, at the P10/P50/P90 quantiles
   *  (relative to now, so the absolute cliff lap is tyreLife + this). */
  cliffP10: number
  cliffP50: number
  cliffP90: number
}

/** Percent position of an absolute tyre-age lap on a [0, max] track. */
function pct(lap: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (lap / max) * 100))
}

export function StintRunway({ tyreLife, cliffP10, cliffP50, cliffP90 }: StintRunwayProps) {
  const nowLap = Math.max(0, tyreLife)
  const p10Lap = nowLap + Math.max(0, cliffP10)
  const p50Lap = nowLap + Math.max(0, cliffP50)
  const p90Lap = nowLap + Math.max(0, cliffP90)
  // Give the horizon a little air beyond the latest cliff estimate.
  const max = Math.max(p90Lap + 2, nowLap + 4)

  const nowPct = pct(nowLap, max)
  const zoneStart = pct(p10Lap, max)
  const zoneEnd = pct(p90Lap, max)
  const p50Pct = pct(p50Lap, max)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-3 rounded-full bg-bg-5" aria-hidden="true">
        {/* Cliff zone P10 -> P90 */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-warning/25 to-danger/35"
          style={{ left: `${zoneStart}%`, width: `${Math.max(0, zoneEnd - zoneStart)}%` }}
        />
        {/* P50 cliff line */}
        <div
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger"
          style={{ left: `${p50Pct}%` }}
        />
        {/* "now" marker */}
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-2 bg-purple-500"
          style={{ left: `${nowPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-fg-4">
        <span className="text-fg-2">now L{Math.round(nowLap)}</span>
        <span>
          cliff <span className="text-fg-1">~L{Math.round(p50Lap)}</span> (P10 L{Math.round(p10Lap)}{' '}
          · P90 L{Math.round(p90Lap)})
        </span>
      </div>
    </div>
  )
}
