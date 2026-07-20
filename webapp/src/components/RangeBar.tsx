// Horizontal range indicator (plain HTML/CSS, no chart lib for a handful of
// static shapes). Shared by Strategy's agent tabs and the Model Lab: a
// confidence interval (pace CI) or a P05-P95 spread (pit stop duration) reads
// the same everywhere.

export interface RangeBarProps {
  low: number | null | undefined
  mid: number | null | undefined
  high: number | null | undefined
  format: (value: number) => string
}

/** A track from `low` to `high` with a marker dot at `mid`. Null-tolerant: any
 *  missing bound falls back to a short text note instead of a broken shape. */
export function RangeBar({ low, mid, high, format }: RangeBarProps) {
  const isValid =
    low != null &&
    mid != null &&
    high != null &&
    !Number.isNaN(low) &&
    !Number.isNaN(mid) &&
    !Number.isNaN(high)
  if (!isValid) return <p className="text-xs text-fg-4">Range unavailable</p>

  const span = high - low
  const rawPct = span > 0 ? ((mid - low) / span) * 100 : 50
  const markerPct = Math.min(100, Math.max(0, rawPct))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-1.5 rounded-full bg-fg-1/10" aria-hidden="true">
        <div className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-fg-4" />
        <div className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-fg-4" />
        <div
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500"
          style={{ left: `${markerPct}%`, top: '50%' }}
        />
      </div>
      <div className="flex justify-between font-mono text-xs tabular-nums text-fg-4">
        <span>{format(low)}</span>
        <span className="text-fg-1">{format(mid)}</span>
        <span>{format(high)}</span>
      </div>
    </div>
  )
}
