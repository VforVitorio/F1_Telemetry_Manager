import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { Card } from '@/components/Card'
import { cn } from '@/lib/cn'

// Number-first tile for a single metric (lap delta, tyre life, pit loss...).
// The eyebrow names the metric, the value is the headline (mono + tabular-nums
// so digits don't jitter as data streams in), and an optional delta/hint gives
// at-a-glance direction. `MetricRow` is the companion for when several small
// values belong together on one line (e.g. gap / tyre age / ERS%) instead of
// each earning a full StatCard.

type DeltaTone = 'success' | 'danger' | 'neutral'

const DELTA_TONES: Record<DeltaTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-fg-3',
}

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Small uppercase label naming the metric, e.g. "Lap delta". */
  eyebrow: string
  /** Headline value, rendered mono + tabular-nums. Accepts a node so callers
   *  can compose a unit suffix without breaking number alignment. */
  value: ReactNode
  /** Short trend string, e.g. "+0.3s" or "-2 laps". Colored by `deltaTone`. */
  delta?: string
  deltaTone?: DeltaTone
  /** Secondary caption under the value, e.g. "vs. last lap". */
  hint?: string
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { eyebrow, value, delta, deltaTone = 'neutral', hint, className, ...props },
  ref,
) {
  return (
    <Card ref={ref} className={cn('flex flex-col gap-2 p-4', className)} {...props}>
      <span className="text-xs font-medium uppercase tracking-widest text-fg-3">{eyebrow}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl tabular-nums text-fg-1">{value}</span>
        {delta ? (
          <span className={cn('font-mono text-sm tabular-nums', DELTA_TONES[deltaTone])}>
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? <span className="text-xs text-fg-4">{hint}</span> : null}
    </Card>
  )
})

export interface MetricRowItem {
  label: string
  value: ReactNode
}

export interface MetricRowProps extends HTMLAttributes<HTMLDivElement> {
  items: MetricRowItem[]
}

/** Horizontal strip of small `label: value` pairs for dense telemetry rows
 *  (a chart header, a driver summary line) where a full StatCard grid would
 *  be too heavy. */
export const MetricRow = forwardRef<HTMLDivElement, MetricRowProps>(function MetricRow(
  { items, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}
      {...props}
    >
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-baseline gap-1 font-mono text-xs tabular-nums text-fg-3"
        >
          <span className="text-fg-4">{item.label}</span>
          <span className="text-fg-1">{item.value}</span>
        </span>
      ))}
    </div>
  )
})
