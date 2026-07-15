import { ChevronRight, Download, Scale, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActionBadge } from '@/components/ActionBadge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CompoundPill } from '@/components/CompoundPill'
import { ConfidenceDial } from '@/components/ConfidenceDial'
import { Markdown } from '@/components/Markdown'
import { Pill } from '@/components/Pill'
import { cn } from '@/lib/cn'
import { getDriverTextColor } from '@/lib/drivers'
import type { LapState, RiskPosture, StrategyRecommendation } from '@/lib/api/strategy'
import { ContingencyList } from './ContingencyList'

// The Decision Card is the Strategy tab's HERO surface: the full 14-field v2
// orchestrator recommendation as one scannable "pit wall" brief. The
// Streamlit predecessor rendered action + reasoning + a raw JSON dump — about
// 40% of the schema; every section below recreates a field that UI threw
// away. A no-LLM / degraded `/recommend` run still returns only the 3
// required fields (action, reasoning, confidence) with everything else
// null/empty, so EVERY section past the header is gated on its own data
// being present rather than assumed — a sparse run reads as a shorter brief,
// never as a broken one.

/** Season used to tint driver codes (rival, undercut target) — matches the
 *  `/recommend` endpoint's own default year (see lib/api/strategy.ts `YEAR`). */
const DRIVER_COLOR_YEAR = 2025

const RISK_POSTURE_TONE: Record<RiskPosture, 'danger' | 'neutral' | 'info'> = {
  AGGRESSIVE: 'danger',
  BALANCED: 'neutral',
  DEFENSIVE: 'info',
}

/** Map a risk posture to the Pill tone that best conveys its aggressiveness. */
function riskPostureTone(posture: RiskPosture): 'danger' | 'neutral' | 'info' {
  return RISK_POSTURE_TONE[posture] ?? 'neutral'
}

/**
 * Small uppercase eyebrow + purple tick, mirroring the Dashboard's
 * `SectionHeader` idiom but sized for a card interior rather than a page
 * section. Kept as a local copy of the pattern (not a cross-feature import)
 * because features stay decoupled siblings in this codebase — see the
 * comment atop `lib/drivers.ts`.
 */
function SubHeading({ label }: { label: string }) {
  return (
    <h3 className="flex items-center gap-2 font-display text-xs font-medium uppercase tracking-widest text-fg-3">
      <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-purple-600" />
      {label}
    </h3>
  )
}

interface DisclosureProps {
  icon: LucideIcon
  label: string
  /** Whether the icon rotates 90deg on open. True for the chevron on the
   *  engineer's note (it doubles as the expand/collapse cue); false for the
   *  static Scale icon on regulation context, which is a content marker, not
   *  an affordance. */
  rotateIcon?: boolean
  children: ReactNode
}

/**
 * Native `<details>` disclosure styled to the design tokens — used for the
 * engineer's note and regulation context panels. Native disclosure is
 * accessible and keyboard-operable for free; no accordion dependency is
 * worth pulling in for two static panels.
 */
function Disclosure({ icon: Icon, label, rotateIcon = false, children }: DisclosureProps) {
  return (
    <details className="group rounded-lg border border-hairline open:bg-bg-4/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
        <Icon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-fg-3',
            rotateIcon && 'transition-transform duration-200 group-open:rotate-90',
          )}
        />
        {label}
      </summary>
      <div className="border-t border-hairline px-3 py-3">{children}</div>
    </details>
  )
}

export interface DecisionCardProps {
  result: StrategyRecommendation
  lapState: LapState
  rival?: string
  onDownloadJson: () => void
}

/**
 * The strategy brief: headline action + confidence, the pace/risk
 * instruction, the pit plan, key risks, the IF-THEN playbook, and two
 * collapsible panels (engineer's reasoning, regulation context). See the
 * module docstring above for why every section past the header is
 * conditional.
 */
export function DecisionCard({ result, lapState, rival, onDownloadJson }: DecisionCardProps) {
  const hasPitPlan =
    result.pit_lap_target != null || result.compound_next != null || result.undercut_target != null

  return (
    <Card elevation="glow" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-widest text-fg-4">
          Lap {lapState.lap_number} / {lapState.session_meta.total_laps} ·{' '}
          {lapState.session_meta.gp_name} {lapState.session_meta.year}
        </p>
        {rival ? (
          <p className="text-xs uppercase tracking-widest text-fg-3">
            Battling{' '}
            <span
              className="font-mono font-semibold"
              style={{ color: getDriverTextColor(rival, DRIVER_COLOR_YEAR) }}
            >
              {rival}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4">
        <ActionBadge action={result.action} size="hero" />
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <ConfidenceDial value={result.confidence} />
            <span className="text-[10px] uppercase tracking-widest text-fg-4">self-assessed</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Download strategy JSON"
            onClick={onDownloadJson}
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className="font-semibold tracking-wide text-fg-1">{result.pace_mode}</span>
        {result.target_lap_time_s != null ? (
          <span className="tabular-nums text-fg-3">
            · TARGET {result.target_lap_time_s.toFixed(3)}s
          </span>
        ) : null}
        <Pill tone={riskPostureTone(result.risk_posture)} className="ml-auto">
          {result.risk_posture}
        </Pill>
      </div>

      {hasPitPlan ? (
        <div className="flex flex-col gap-1 rounded-lg bg-bg-4/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
            {result.pit_lap_target != null ? (
              <span>
                Box lap{' '}
                <span className="font-mono font-semibold text-fg-1">{result.pit_lap_target}</span>
              </span>
            ) : null}
            {result.compound_next ? (
              <>
                <span aria-hidden="true">→</span>
                <CompoundPill compound={result.compound_next} />
              </>
            ) : null}
            {result.undercut_target ? (
              <span>
                undercut{' '}
                <span
                  className="font-mono font-semibold"
                  style={{ color: getDriverTextColor(result.undercut_target, DRIVER_COLOR_YEAR) }}
                >
                  {result.undercut_target}
                </span>
              </span>
            ) : null}
          </div>
          {result.expected_stint_end != null ? (
            <p className="text-xs text-fg-3">stint ends ~lap {result.expected_stint_end}</p>
          ) : null}
        </div>
      ) : null}

      {result.key_risks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SubHeading label="Key risks" />
          <ul className="flex flex-col gap-1.5">
            {result.key_risks.map((risk, index) => (
              <li key={`${risk}-${index}`} className="flex items-start gap-2 text-sm text-fg-2">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.contingencies.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SubHeading label="Playbook" />
          <ContingencyList contingencies={result.contingencies} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {result.reasoning ? (
          <Disclosure icon={ChevronRight} label="Engineer's note" rotateIcon>
            <Markdown>{result.reasoning}</Markdown>
          </Disclosure>
        ) : null}
        {result.regulation_context ? (
          <Disclosure icon={Scale} label="Regulation context">
            <Markdown>{result.regulation_context}</Markdown>
          </Disclosure>
        ) : null}
      </div>
    </Card>
  )
}
