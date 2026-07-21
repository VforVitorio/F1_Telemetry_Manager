import { Gauge } from '@/charts/Gauge'
import { ScoresPlot } from '@/charts/ScenarioScoresChart'
import { ActionBadge } from '@/components/ActionBadge'
import { Card } from '@/components/Card'
import { CompoundPill } from '@/components/CompoundPill'
import { ConfidenceDial } from '@/components/ConfidenceDial'
import { Pill } from '@/components/Pill'
import { StatCard } from '@/components/StatCard'
import type { ToolResult } from '@/lib/api/chat'
import type { StrategyAction } from '@/lib/api/strategy'
import { RawDataDisclosure } from './RawDataDisclosure'
import { toPitCard, toRecommendationCard, toTireCard } from './toolResultParsing'

// The `strategy_card` display_type: N26 tyres, N28+N16 pit, and N31's full
// recommendation, the three tools the chat allowlist tags this way. Each
// reuses the exact viz its Model Lab bench (or, for the recommendation, the
// Strategy tab's Decision Banner) already ships for the same model.

const WARNING_TONE: Record<string, 'danger' | 'warning' | 'success'> = {
  PIT_SOON: 'danger',
  MONITOR: 'warning',
  OK: 'success',
}

const formatSeconds = (value: number): string => `${value.toFixed(2)}s`

/** The LLM/sub-agent's narrative reasoning, collapsed by default so it never
 *  competes with the structured verdict above it — same pattern as
 *  `RadioResultCard`'s own reasoning disclosure. */
function ReasoningDisclosure({ reasoning }: { reasoning: string | undefined }) {
  if (!reasoning) return null
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium tracking-wide text-fg-3 uppercase marker:content-none">
        Reasoning
      </summary>
      <p className="mt-2 rounded-lg bg-bg-2 px-3 py-2 text-sm leading-relaxed text-fg-2">
        {reasoning}
      </p>
    </details>
  )
}

/** N26's tyre-degradation verdict: compound, degradation rate, the median
 *  laps-to-cliff estimate, and the categorical warning level — matching the
 *  Model Lab tyre bench (`features/lab/models/TyreResultView.tsx`). */
function TireCard({ data }: { data: ToolResult['data'] }) {
  const card = toTireCard(data)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {card.compound ? <CompoundPill compound={card.compound} /> : null}
        {card.warningLevel ? (
          <Pill tone={WARNING_TONE[card.warningLevel] ?? 'success'}>{card.warningLevel}</Pill>
        ) : null}
        {/* Not a field of TireOutput today (src/agents/tire_agent.py) — renders
         *  automatically the moment the backend starts sending one. */}
        {card.confidence != null ? <ConfidenceDial value={card.confidence} size={40} /> : null}
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <StatCard
          eyebrow="Deg rate"
          value={card.degRate != null ? `${card.degRate.toFixed(4)} s/lap` : '—'}
        />
        <StatCard
          eyebrow="Cliff P50"
          value={card.lapsToCliffP50 != null ? `+${Math.round(card.lapsToCliffP50)} laps` : '—'}
        />
      </div>
      <ReasoningDisclosure reasoning={card.reasoning} />
    </div>
  )
}

/** N28 + N16's pit-stop verdict: median stop duration, the recommended lap,
 *  and the undercut probability at the same 0.522 operating point the Model
 *  Lab pit bench gauges against (`features/lab/models/PitResultView.tsx`). */
function PitCard({ data }: { data: ToolResult['data'] }) {
  const card = toPitCard(data)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <StatCard
          eyebrow="Stop P50"
          value={card.stopDurationP50 != null ? formatSeconds(card.stopDurationP50) : '—'}
        />
        <StatCard
          eyebrow="Recommended lap"
          value={card.recommendedLap != null ? `L${card.recommendedLap}` : '—'}
        />
      </div>
      {card.undercutProb != null ? (
        <Gauge
          value={card.undercutProb}
          label="Undercut"
          threshold={0.522}
          thresholdLabel="Operating point 52%"
          height={170}
        />
      ) : null}
      <ReasoningDisclosure reasoning={card.reasoning} />
    </div>
  )
}

/** N31's full recommendation: the hero action badge + the LLM's
 *  self-assessed confidence, the Monte-Carlo scenario-scores plot backing
 *  it, and the narrative reasoning — the same trio the Strategy tab's
 *  Decision Banner leads with (`features/strategy/components/
 *  DecisionBanner.tsx`), condensed for a chat bubble. */
function RecommendationCard({ data }: { data: ToolResult['data'] }) {
  const card = toRecommendationCard(data)
  const hasScores = Object.keys(card.scenarioScores).length > 0
  const action = card.action ?? 'UNKNOWN'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActionBadge action={action} size="hero" />
        {card.confidence != null ? (
          <div className="flex flex-col items-center gap-1">
            <ConfidenceDial value={card.confidence} />
            <span className="text-[10px] tracking-widest text-fg-4 uppercase">self-assessed</span>
          </div>
        ) : null}
      </div>
      {hasScores ? (
        <ScoresPlot scores={card.scenarioScores} chosenAction={action as StrategyAction} />
      ) : null}
      <ReasoningDisclosure reasoning={card.reasoning} />
    </div>
  )
}

const STRATEGY_TITLE: Record<string, string> = {
  predict_tire: 'Tyre degradation',
  predict_pit: 'Pit strategy',
  recommend_strategy: 'Strategy recommendation',
}

export interface StrategyCardResultProps {
  toolResult: ToolResult
}

/** Dispatches the `strategy_card` display_type by tool name inside the
 *  shared card shell every tool-result family uses. Falls back to a raw
 *  JSON disclosure for any tool this chat build has no specific renderer
 *  for yet. */
export function StrategyCardResult({ toolResult }: StrategyCardResultProps) {
  const title = STRATEGY_TITLE[toolResult.tool_name]
  return (
    <Card className="flex flex-col gap-3 p-4">
      {title ? (
        <span className="text-xs font-medium tracking-widest text-fg-3 uppercase">{title}</span>
      ) : null}
      {toolResult.tool_name === 'predict_tire' ? (
        <TireCard data={toolResult.data} />
      ) : toolResult.tool_name === 'predict_pit' ? (
        <PitCard data={toolResult.data} />
      ) : toolResult.tool_name === 'recommend_strategy' ? (
        <RecommendationCard data={toolResult.data} />
      ) : (
        <RawDataDisclosure data={toolResult.data} />
      )}
    </Card>
  )
}
