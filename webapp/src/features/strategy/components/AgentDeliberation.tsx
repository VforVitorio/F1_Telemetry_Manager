import { X } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusStepper, type StatusStep } from '@/components/StatusStepper'
import { Pill } from '@/components/Pill'
import { cn } from '@/lib/cn'

// The loading/running experience while POST /recommend is in flight. The
// endpoint has no progress channel of its own — it returns exactly once, at
// the very end — so this narrates a SCRIPTED four-stage pipeline derived from
// `elapsedMs` (ticked by the page) rather than any real signal from the
// backend. The stages mirror N31's actual phases (lap-state fetch -> 4 ML
// sub-agents -> 500-sample Monte-Carlo scoring -> LLM synthesis), so the
// narration stays truthful even though its timing is only approximate. The
// synthesis stage has no upper threshold: it is the long, variable tail (a
// few seconds to ~30s), and the page unmounts this component the moment the
// real result lands — there is deliberately no "done" state to render here.

const DELIBERATION_STEPS: StatusStep[] = [
  { id: 'lap-state', label: 'Building lap state…' },
  { id: 'sub-agents', label: 'Running agents (Pace · Tire · Pit · SC · Radio)…' },
  { id: 'monte-carlo', label: 'Scoring 500 Monte-Carlo × 4 scenarios…' },
  { id: 'synthesis', label: 'Synthesizing recommendation…' },
]

const AGENT_CHIP_LABELS = ['Pace', 'Tire', 'Pit', 'SC', 'Radio'] as const

// Millisecond thresholds between the scripted stages above, chosen from the
// pipeline's known relative costs (a parquet lookup is near-instant, the 4
// sub-agents are cheap ML calls, Monte-Carlo scoring is in-memory, LLM
// synthesis is the slow part) rather than any measured distribution — good
// enough to feel alive without pretending to know the true progress.
const STAGE_1_START_MS = 700
const STAGE_2_START_MS = 6_500
const STAGE_3_START_MS = 9_000

/** Resolve which of the 4 scripted stages is active for a given elapsed time.
 *  Pure and file-local so the thresholds above stay easy to eyeball and tune. */
function deliberationStage(elapsedMs: number): number {
  if (elapsedMs < STAGE_1_START_MS) return 0
  if (elapsedMs < STAGE_2_START_MS) return 1
  if (elapsedMs < STAGE_3_START_MS) return 2
  return 3
}

/** "12.3s" — the elapsed run timer. */
function formatElapsed(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`
}

interface AgentChipsProps {
  stage: number
}

/** Five pulsing pills standing in for the sub-agent council. Purely
 *  decorative — the StatusStepper above already carries the accessible
 *  narration — so these are `aria-hidden`. They stay dim and still during the
 *  lap-state stage, then pulse with a small stagger from stage 1 onward so
 *  the row reads as several agents working concurrently rather than one
 *  blinking light. */
function AgentChips({ stage }: AgentChipsProps) {
  const isDeliberating = stage >= 1
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {AGENT_CHIP_LABELS.map((label, index) => (
        <Pill
          key={label}
          tone={isDeliberating ? 'purple' : 'neutral'}
          className={cn(isDeliberating && 'motion-safe:animate-pulse')}
          style={isDeliberating ? { animationDelay: `${index * 150}ms` } : undefined}
        >
          {label}
        </Pill>
      ))}
    </div>
  )
}

export interface AgentDeliberationProps {
  /** Milliseconds since the run started; the page ticks this while the
   *  mutation is in flight. */
  elapsedMs: number
  /** Cancel the in-flight run (aborts the underlying request). */
  onCancel: () => void
}

/**
 * The N31 orchestrator run's loading state — deliberately not a generic
 * skeleton. Shows a scripted stage narration, a pulsing agent council, and an
 * elapsed timer so a 5-30s LLM-backed wait reads as visible progress instead
 * of a stalled spinner.
 */
export function AgentDeliberation({ elapsedMs, onCancel }: AgentDeliberationProps) {
  const stage = deliberationStage(elapsedMs)

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg text-fg-1">Deliberating…</p>
          <p className="text-sm text-fg-3">The pit wall council is scoring your strategy.</p>
        </div>
        <span className="font-mono text-sm tabular-nums text-fg-3">{formatElapsed(elapsedMs)}</span>
      </div>

      <div aria-live="polite">
        <StatusStepper steps={DELIBERATION_STEPS} activeIndex={stage} />
      </div>

      <AgentChips stage={stage} />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </Card>
  )
}
