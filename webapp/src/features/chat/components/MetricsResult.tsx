import { Gauge } from '@/charts/Gauge'
import { Card } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { RangeBar } from '@/components/RangeBar'
import { StatCard } from '@/components/StatCard'
import type { ToolResult } from '@/lib/api/chat'
import { RawDataDisclosure } from './RawDataDisclosure'
import { toPaceMetrics, toSituationMetrics } from './toolResultParsing'

// The `metrics` display_type: N25 pace and N27 overtake/safety-car, the two
// tools the chat allowlist tags this way. Both reuse the exact viz the Model
// Lab benches already ship for the same models, just for a single lap
// instead of a window/lens toggle.

const THREAT_TONE: Record<string, 'danger' | 'warning' | 'success'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
}

const formatSeconds = (value: number): string => `${value.toFixed(3)}s`

/** N25's pace prediction for one lap: the three headline deltas plus the
 *  P10-P90 bootstrap band, the same fields the Model Lab pace bench plots
 *  (`features/lab/models/PaceResultView.tsx`) for a whole lap window. */
function PaceMetrics({ data }: { data: ToolResult['data'] }) {
  const metrics = toPaceMetrics(data)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <StatCard
          eyebrow="Predicted lap time"
          value={metrics.lapTimePred != null ? formatSeconds(metrics.lapTimePred) : '—'}
        />
        <StatCard
          eyebrow="Delta vs previous"
          value={metrics.deltaVsPrev != null ? formatSeconds(metrics.deltaVsPrev) : '—'}
        />
        <StatCard
          eyebrow="Delta vs median"
          value={metrics.deltaVsMedian != null ? formatSeconds(metrics.deltaVsMedian) : '—'}
        />
      </div>
      <RangeBar
        low={metrics.ciP10}
        mid={metrics.lapTimePred}
        high={metrics.ciP90}
        format={formatSeconds}
      />
    </div>
  )
}

/** N27's overtake + safety-car read for one lap. Same gauge operating points
 *  the Model Lab situation bench uses — 0.80 action threshold for overtake,
 *  0.30 alert threshold for a safety car within 3 laps
 *  (`features/lab/models/SituationResultView.tsx`) — so a probability reads
 *  against the same line everywhere in the app. */
function SituationMetrics({ data }: { data: ToolResult['data'] }) {
  const metrics = toSituationMetrics(data)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        {metrics.overtakeProb != null ? (
          <div className="min-w-40 flex-1">
            <Gauge
              value={metrics.overtakeProb}
              label="Overtake"
              threshold={0.8}
              thresholdLabel="Action threshold 80%"
              height={170}
            />
          </div>
        ) : null}
        {metrics.scProb3Lap != null ? (
          <div className="min-w-40 flex-1">
            <Gauge
              value={metrics.scProb3Lap}
              label="SC in 3 laps"
              threshold={0.3}
              thresholdLabel="Alert threshold 30%"
              height={170}
            />
          </div>
        ) : null}
      </div>
      {metrics.threatLevel ? (
        <Pill tone={THREAT_TONE[metrics.threatLevel] ?? 'success'} className="self-start">
          {metrics.threatLevel} threat
        </Pill>
      ) : null}
    </div>
  )
}

const METRICS_TITLE: Record<string, string> = {
  predict_pace: 'Pace prediction',
  predict_situation: 'Overtake / safety car',
}

export interface MetricsResultProps {
  toolResult: ToolResult
}

/** Dispatches the `metrics` display_type by tool name inside the shared card
 *  shell every tool-result family uses. Falls back to a raw JSON disclosure
 *  for any tool this chat build has no specific renderer for yet, so a
 *  future addition to the backend allowlist never renders blank. */
export function MetricsResult({ toolResult }: MetricsResultProps) {
  const title = METRICS_TITLE[toolResult.tool_name]
  return (
    <Card className="flex flex-col gap-3 p-4">
      {title ? (
        <span className="text-xs font-medium tracking-widest text-fg-3 uppercase">{title}</span>
      ) : null}
      {toolResult.tool_name === 'predict_pace' ? (
        <PaceMetrics data={toolResult.data} />
      ) : toolResult.tool_name === 'predict_situation' ? (
        <SituationMetrics data={toolResult.data} />
      ) : (
        <RawDataDisclosure data={toolResult.data} />
      )}
    </Card>
  )
}
