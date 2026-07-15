import { cn } from '@/lib/cn'

// Radial SVG dial for the orchestrator's self-assessed confidence (0-1). The
// value is the LLM's own certainty — qualitative, NOT a calibrated probability
// — so the dial carries a `title` note saying exactly that, to stop a reader
// mistaking 82% for a validated 82% chance. Pure SVG (no chart lib) since it's
// one static arc.

const QUALITATIVE_NOTE = 'LLM self-assessed confidence — qualitative, not a calibrated probability'

export interface ConfidenceDialProps {
  /** Confidence in [0, 1]. */
  value: number
  size?: number
  className?: string
  /** Footnote explaining what the value means — defaults to the LLM
   *  self-assessment caveat. Callers wrapping a calibrated model probability
   *  (overtake / safety-car / undercut) should override this, since the
   *  default note is factually wrong for those cases. */
  note?: string
}

/** Circular confidence gauge: an accent arc sweeping `value` of a full turn. */
export function ConfidenceDial({
  value,
  size = 64,
  className,
  note = QUALITATIVE_NOTE,
}: ConfidenceDialProps) {
  const pct = Math.min(1, Math.max(0, value))
  const stroke = size >= 56 ? 6 : 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = circumference * pct

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      title={note}
      role="img"
      aria-label={`Confidence ${Math.round(pct * 100)} percent. ${note}.`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-bg-5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="stroke-purple-500 transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span
        className="absolute font-mono font-semibold tabular-nums text-fg-1"
        style={{ fontSize: size * 0.28 }}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}
