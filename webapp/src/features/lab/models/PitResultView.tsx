// Pit bench (HistGBT stop duration + LightGBM undercut). Verdict: action badge
// (incl. REACTIVE_SC), compound rec, rec lap; viz: stop-duration RangeBar +
// undercut Gauge (threshold 0.522) + a small target/lap detail line.

import { useMutation } from '@tanstack/react-query'
import { Wrench } from 'lucide-react'
import { Gauge } from '@/charts/Gauge'
import { ActionBadge } from '@/components/ActionBadge'
import { ChartCard } from '@/components/ChartCard'
import { CompoundPill } from '@/components/CompoundPill'
import { Pill } from '@/components/Pill'
import { RangeBar } from '@/components/RangeBar'
import { Skeleton } from '@/components/Skeleton'
import { MetricRow, StatCard, type MetricRowItem } from '@/components/StatCard'
import { fetchLapState, runAgent, type PitResult } from '@/lib/api/strategy'
import { LAB_YEAR } from '../search'
import { selectActiveRun, useLabStore, type LabRun } from '../store'
import type { ModelMeta, ResultViewProps } from './types'
import {
  IdleHero,
  RanContextChip,
  ReasoningDisclosure,
  RunControls,
  RunHeader,
  StaleBanner,
  useElapsedSeconds,
  VerdictRow,
} from '../components/RunFrame'

export const PIT_META: ModelMeta = {
  id: 'pit',
  Icon: Wrench,
  title: 'Pit strategy',
  modelChip: 'HistGBT + LightGBM',
  evalHeadline: 'Stop P50 MAE 0.489 s',
  blurb: 'Recommends a pit action and predicts the stop duration and undercut probability.',
  control: 'lap',
}

/** The LightGBM undercut model's operating point, the same 0.522 used by the
 *  Strategy agent tab so the two surfaces read the probability against the
 *  same line. */
const UNDERCUT_THRESHOLD = 0.522

const s2 = (v: number) => `${v.toFixed(2)}s`

export function PitResultView({ gp, driver, lap }: ResultViewProps) {
  const addRun = useLabStore((s) => s.addRun)
  const activeRun = useLabStore((s) => selectActiveRun(s, 'pit'))

  const runMut = useMutation({
    mutationFn: async (): Promise<PitResult> => {
      const lapState = await fetchLapState(gp!, driver!, lap!, LAB_YEAR)
      return runAgent('pit', lapState)
    },
    onSuccess: (agent) => {
      const run: LabRun = {
        id: crypto.randomUUID(),
        model: 'pit',
        context: { gp, driver, lap },
        result: { kind: 'pit', agent },
        label: lap != null ? `Lap ${lap}` : 'Pit',
        ranAt: Date.now(),
      }
      addRun(run)
    },
  })

  const elapsed = useElapsedSeconds(runMut.isPending)
  const disabledReason = !gp
    ? 'Pick a Grand Prix'
    : !driver
      ? 'Pick a driver'
      : lap == null
        ? 'Pick a lap'
        : undefined

  function onRun() {
    if (disabledReason) return
    runMut.mutate()
  }
  function onCancel() {
    runMut.reset()
  }

  if (runMut.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <RunHeader
          title={PIT_META.title}
          modelChip={PIT_META.modelChip}
          right={<RunControls isRunning onRun={onRun} onCancel={onCancel} elapsed={elapsed} />}
        />
        <Skeleton className="h-52 w-full" />
        <p className="text-center text-xs text-fg-4">Running the pit model...</p>
      </div>
    )
  }

  const run = activeRun?.result.kind === 'pit' ? activeRun : undefined
  if (!run) {
    return <IdleHero meta={PIT_META} disabledReason={disabledReason} onRun={onRun} />
  }

  const agent = run.result.kind === 'pit' ? run.result.agent : undefined
  if (!agent) return null

  const stale = run.context.gp !== gp || run.context.driver !== driver || run.context.lap !== lap

  // The undercut detail line: target driver and the lap the model is timing
  // the undercut against. Both are nullable independently of undercut_prob
  // itself, so each earns its own guard rather than assuming the pair.
  const undercutItems: MetricRowItem[] = []
  if (agent.undercut_target) {
    undercutItems.push({
      label: 'Target',
      value: <Pill tone="info">{agent.undercut_target}</Pill>,
    })
  }
  if (agent.recommended_lap != null) {
    undercutItems.push({ label: 'Lap', value: `L${agent.recommended_lap}` })
  }

  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        title={PIT_META.title}
        modelChip={PIT_META.modelChip}
        right={
          <>
            <RanContextChip label={run.label} />
            <RunControls isRunning={false} onRun={onRun} disabledReason={disabledReason} />
          </>
        }
      />

      {stale ? (
        <StaleBanner
          message={`Result is for ${run.label}. Re-run for the current lap.`}
          onRerun={onRun}
        />
      ) : null}

      <VerdictRow>
        <ActionBadge action={agent.action} />
        <CompoundPill compound={agent.compound_recommendation} />
        <StatCard
          eyebrow="Recommended lap"
          value={agent.recommended_lap != null ? `L${agent.recommended_lap}` : 'None'}
        />
      </VerdictRow>

      <ChartCard title="Stop duration (s)">
        <RangeBar
          low={agent.stop_duration_p05}
          mid={agent.stop_duration_p50}
          high={agent.stop_duration_p95}
          format={s2}
        />
      </ChartCard>

      {agent.undercut_prob != null ? (
        <ChartCard title="Undercut probability">
          <div className="flex flex-col items-center gap-3">
            <Gauge
              value={agent.undercut_prob}
              label="Undercut"
              threshold={UNDERCUT_THRESHOLD}
              thresholdLabel="Operating point 52%"
            />
            {undercutItems.length > 0 ? <MetricRow items={undercutItems} /> : null}
          </div>
        </ChartCard>
      ) : null}

      <ReasoningDisclosure reasoning={agent.reasoning} />
    </div>
  )
}
