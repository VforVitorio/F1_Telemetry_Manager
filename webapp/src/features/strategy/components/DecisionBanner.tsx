import { Download } from 'lucide-react'
import { ActionBadge } from '@/components/ActionBadge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CompoundPill } from '@/components/CompoundPill'
import { ConfidenceDial } from '@/components/ConfidenceDial'
import { Pill } from '@/components/Pill'
import { getDriverTextColor } from '@/lib/drivers'
import type { LapState, RiskPosture, StrategyRecommendation } from '@/lib/api/strategy'
import { ScoresPlot } from '@/charts/ScenarioScoresChart'

// The Decision Banner is the Strategy tab's HERO surface: the headline call
// (action + confidence + pace/risk instruction + pit plan) co-located with its
// own Monte-Carlo evidence in one two-column card, so a reader never has to
// glance away from the decision to see what backs it. The all-in-one
// `DecisionCard` this replaces put the MC scores chart in a separate 1/3-width
// column that read as an unrelated "extra" panel and left a lot of dead space
// next to a sparse (no-LLM) run — this banner closes that gap by making the
// chart part of the hero card itself. Everything that isn't part of the
// headline call (key risks, playbook, reasoning, regulation context) now
// lives in the sibling `DecisionDetails` component below it.
//
// A no-LLM / degraded `/recommend` run still returns only the 3 required
// fields (action, reasoning, confidence) with everything else null/empty, so
// every section here past the header stays gated on its own data being
// present — a sparse run reads as a shorter brief, never a broken one.

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

export interface DecisionBannerProps {
  result: StrategyRecommendation
  lapState: LapState
  rival?: string
  onDownloadJson: () => void
}

/**
 * The headline strategy call: context eyebrow, the hero action badge +
 * confidence dial + JSON download, the pace/risk instruction, and the pit
 * plan on the left; the Monte-Carlo scenario-scores plot on the right. This
 * is the ONE `elevation="glow"` card on the Strategy tab. Every field past
 * `action`/`reasoning`/`confidence` is optional on the wire (a no-LLM run
 * omits them), so each block below is independently gated on its own data.
 */
export function DecisionBanner({ result, lapState, rival, onDownloadJson }: DecisionBannerProps) {
  const hasPitPlan =
    result.pit_lap_target != null || result.compound_next != null || result.undercut_target != null

  return (
    <Card elevation="glow" className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-5 p-6">
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
      </div>

      <div className="flex flex-col gap-3 p-5 xl:border-l border-hairline">
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-4">
          Monte Carlo · 500 samples
        </p>
        <ScoresPlot scores={result.scenario_scores} chosenAction={result.action} />
      </div>
    </Card>
  )
}
