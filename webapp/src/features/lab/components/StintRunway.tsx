// StintRunway: a lap-axis strip reading "how many laps of tyre life are left".
// Plain DOM/CSS (the RangeBar idiom, no chart lib): a track from the stint
// start to the horizon, a "now" marker at the current tyre age, and a cliff
// zone shaded from the P10 (earliest) to P90 (latest) laps-to-cliff estimate
// with a firmer P50 line. It turns three abstract cliff quantiles into one
// legible "you're here, the cliff is roughly there" read. It is the Lab's
// only bespoke instrument, so it carries a little more craft than a plain
// bar: lap ticks give it a ruler, and the "now" marker is filled with the
// tyre's own compound colour when the caller knows it.

interface StintRunwayProps {
  /** Current tyre age in laps (the "now" position). */
  tyreLife: number
  /** Laps remaining until the degradation cliff, at the P10/P50/P90 quantiles
   *  (relative to now, so the absolute cliff lap is tyreLife + this). */
  cliffP10: number
  cliffP50: number
  cliffP90: number
  /** The compound currently fitted (FastF1 name, e.g. "soft"/"medium"/"hard"/
   *  "intermediate"/"wet", case-insensitive). Colours the "now" marker with
   *  its brand hue; an unknown or omitted compound keeps the default purple. */
  compound?: string
}

/** Percent position of an absolute tyre-age lap on a [0, max] track. */
function pct(lap: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (lap / max) * 100))
}

const MARKER_CLASS_BY_COMPOUND: Record<string, string> = {
  soft: 'bg-tire-soft',
  medium: 'bg-tire-medium',
  hard: 'bg-tire-hard',
  intermediate: 'bg-tire-inter',
  inter: 'bg-tire-inter',
  wet: 'bg-tire-wet',
}

/** Background class for the "now" marker: the compound's brand colour when
 *  recognised, the default accent purple otherwise. */
function markerClass(compound: string | undefined): string {
  if (!compound) return 'bg-purple-500'
  return MARKER_CLASS_BY_COMPOUND[compound.toLowerCase()] ?? 'bg-purple-500'
}

const TICK_STEP_LAPS = 10

/** Lap numbers for the ruler ticks: every `TICK_STEP_LAPS` laps from 0 up to
 *  the track's horizon, so the strip reads as a ruler, not just two dots. */
function tickLaps(max: number): number[] {
  const ticks: number[] = []
  for (let lap = 0; lap <= max; lap += TICK_STEP_LAPS) {
    ticks.push(lap)
  }
  return ticks
}

export function StintRunway({
  tyreLife,
  cliffP10,
  cliffP50,
  cliffP90,
  compound,
}: StintRunwayProps) {
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
  const ticks = tickLaps(max)

  // Degenerate-zone guard: when the quantiles collapse (P10 = P50 = P90) the
  // raw zone has zero width and the whole uncertainty band disappears. Force
  // a minimum sliver, centred on the P50 line rather than pinned to its start,
  // so the read stays "there's a cliff roughly here" instead of vanishing.
  const rawZoneWidth = zoneEnd - zoneStart
  const zoneWidth = Math.max(rawZoneWidth, 1.5)
  const zoneLeft =
    rawZoneWidth < 1.5 ? Math.min(Math.max(p50Pct - zoneWidth / 2, 0), 100 - zoneWidth) : zoneStart

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-fg-3">
          Stint runway
        </span>
        <span className="font-mono text-xs text-fg-4">laps</span>
      </div>
      <div
        className="relative h-4 rounded-full border border-hairline bg-fg-1/10"
        aria-hidden="true"
      >
        {/* Lap ruler ticks */}
        {ticks.map((lap) => (
          <div
            key={lap}
            className="absolute top-0 bottom-0 w-px bg-fg-1/15"
            style={{ left: `${pct(lap, max)}%` }}
          />
        ))}
        {/* Cliff zone P10 -> P90, with a subtle dot-matrix texture layered
            under the gradient so the uncertainty band reads as textured risk,
            not just a flat fill. */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-warning/25 to-danger/35"
          style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
        />
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${zoneLeft}%`,
            width: `${zoneWidth}%`,
            backgroundImage: 'radial-gradient(circle, var(--danger) 35%, transparent 36%)',
            backgroundSize: '4px 4px',
            opacity: 0.5,
          }}
        />
        {/* P50 cliff line */}
        <div
          className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger"
          style={{ left: `${p50Pct}%` }}
        />
        {/* "now" marker, filled with the current compound's colour */}
        <div
          className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-2 ${markerClass(compound)}`}
          style={{ left: `${nowPct}%` }}
        />
      </div>
      <div className="relative h-3" aria-hidden="true">
        {ticks.map((lap) => (
          <span
            key={lap}
            className="absolute -translate-x-1/2 font-mono text-[10px] text-fg-4"
            style={{ left: `${pct(lap, max)}%` }}
          >
            {lap}
          </span>
        ))}
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
