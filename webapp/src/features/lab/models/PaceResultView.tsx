// Pace model bench: the XGBoost lap-time predictor across a lap window. Runs on
// POST /pace-range (pure ML, 45-60 s, rate-limited), shows actual vs predicted
// with a p10-p90 CI band, compound-coloured dots and stint boundaries, plus the
// last prediction / CI / window MAE. The reference ResultView the other models
// mirror: idle hero -> running (skeleton + elapsed + Cancel) -> done (verdict +
// chart + reasoning) with a stale banner when the bench moves off the run.

import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Gauge as PaceIcon } from 'lucide-react'
import { AgentModelChart, type AgentModelPoint } from '@/charts/AgentModelChart'
import { ChartCard } from '@/components/ChartCard'
import { Skeleton } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { useToast } from '@/components/Toast'
import { fetchPaceRange, type PaceRangePoint } from '@/lib/api/strategy'
import { runFailureToast } from './runError'
import { LAB_YEAR } from '../search'
import { selectActiveRun, useLabStore, type LabRun } from '../store'
import type { ModelMeta, ResultViewProps } from './types'
import {
  IdleHero,
  RanContextChip,
  RunControls,
  RunHeader,
  StaleBanner,
  useElapsedSeconds,
  VerdictRow,
} from '../components/RunFrame'

export const PACE_META: ModelMeta = {
  id: 'pace',
  Icon: PaceIcon,
  title: 'Race pace',
  modelChip: 'XGBoost',
  evalHeadline: 'MAE 0.411 s',
  blurb: 'Predicts each lap time from tyre, fuel and track state, with a p10-p90 interval.',
  control: 'window',
}

const s2 = (v: number) => `${v.toFixed(2)}s`

/** Mean absolute error over the laps where both an actual and a prediction
 *  exist. Null when no lap has both. */
function windowMae(points: PaceRangePoint[]): number | null {
  const paired = points.filter((p) => p.actual != null && p.pred != null)
  if (paired.length === 0) return null
  const total = paired.reduce(
    (sum, p) => sum + Math.abs((p.actual as number) - (p.pred as number)),
    0,
  )
  return total / paired.length
}

/** PaceRangePoint[] -> the chart's point shape, flagging a stint's first lap. */
function toChartPoints(points: PaceRangePoint[]): AgentModelPoint[] {
  let prevStint: number | null = null
  return points.map((p) => {
    // Never mark the window's first lap as a stint boundary: prevStint is null
    // there, so it would draw a phantom pit line where no stop happened.
    const stintStart = prevStint !== null && p.stint !== prevStint
    prevStint = p.stint
    return {
      lap: p.lap,
      actual: p.actual,
      pred: p.pred,
      ciLow: p.ci_p10,
      ciHigh: p.ci_p90,
      compound: p.compound,
      stintStart,
    }
  })
}

/** The last lap that carries a prediction, the verdict's headline. */
function lastPredicted(points: PaceRangePoint[]): PaceRangePoint | undefined {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].pred != null) return points[i]
  }
  return undefined
}

function sameWindow(a: [number, number] | undefined, b: [number, number] | undefined): boolean {
  if (!a || !b) return a === b
  return a[0] === b[0] && a[1] === b[1]
}

export function PaceResultView({ gp, driver, laps }: ResultViewProps) {
  const addRun = useLabStore((s) => s.addRun)
  const activeRun = useLabStore((s) => selectActiveRun(s, 'pace'))
  const { toast } = useToast()
  const abortRef = useRef<AbortController | null>(null)
  const runSeqRef = useRef(0)

  const runMut = useMutation({
    mutationFn: async ({ signal, seq }: { signal: AbortSignal; seq: number }) => {
      const range = await fetchPaceRange(gp!, driver!, laps![0], laps![1], LAB_YEAR, signal)
      return { range, seq }
    },
    onSuccess: ({ range, seq }) => {
      // Drop a run the user cancelled or superseded before it resolved.
      if (seq !== runSeqRef.current) return
      const run: LabRun = {
        id: crypto.randomUUID(),
        model: 'pace',
        context: { gp, driver, laps },
        result: { kind: 'pace', range },
        label: laps ? `Laps ${laps[0]}-${laps[1]}` : 'Pace',
        ranAt: Date.now(),
      }
      addRun(run)
    },
    onError: (error) => runFailureToast(toast, 'Pace', error),
  })

  const elapsed = useElapsedSeconds(runMut.isPending)
  const disabledReason = !gp
    ? 'Pick a Grand Prix'
    : !driver
      ? 'Pick a driver'
      : !laps
        ? 'Pick a lap window'
        : undefined

  function onRun() {
    if (disabledReason) return
    const seq = ++runSeqRef.current
    const ac = new AbortController()
    abortRef.current = ac
    runMut.mutate({ signal: ac.signal, seq })
  }
  function onCancel() {
    runSeqRef.current++
    abortRef.current?.abort()
    runMut.reset()
  }

  if (runMut.isPending) {
    const span = laps ? laps[1] - laps[0] + 1 : 0
    return (
      <div className="flex flex-col gap-4">
        <RunHeader
          title={PACE_META.title}
          modelChip={PACE_META.modelChip}
          right={<RunControls isRunning onRun={onRun} onCancel={onCancel} elapsed={elapsed} />}
        />
        <Skeleton className="h-52 w-full" />
        <p className="text-center text-xs text-fg-4">
          Scoring {span > 0 ? `~${span} laps` : 'the window'} · typically 45-60 s
        </p>
      </div>
    )
  }

  const run = activeRun?.result.kind === 'pace' ? activeRun : undefined
  if (!run) {
    return <IdleHero meta={PACE_META} disabledReason={disabledReason} onRun={onRun} />
  }

  const range = run.result.kind === 'pace' ? run.result.range : []
  const mae = windowMae(range)
  const last = lastPredicted(range)
  const stale =
    run.context.gp !== gp || run.context.driver !== driver || !sameWindow(run.context.laps, laps)

  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        title={PACE_META.title}
        modelChip={PACE_META.modelChip}
        right={
          <>
            <RanContextChip label={run.label} />
            <RunControls isRunning={false} onRun={onRun} disabledReason={disabledReason} />
          </>
        }
      />

      {stale ? (
        <StaleBanner
          message={`Result is for ${run.label}. Re-run for the current window.`}
          onRerun={onRun}
        />
      ) : null}

      <VerdictRow>
        <StatCard
          eyebrow="Last prediction"
          value={last?.pred != null ? s2(last.pred) : '-'}
          hint={last ? `Lap ${last.lap}` : undefined}
        />
        <StatCard
          eyebrow="Interval P10-P90"
          value={
            last && last.ci_p10 != null && last.ci_p90 != null
              ? `${s2(last.ci_p10)} - ${s2(last.ci_p90)}`
              : '-'
          }
        />
        <StatCard eyebrow="Window MAE" value={mae != null ? s2(mae) : '-'} />
      </VerdictRow>

      <ChartCard
        title="Actual vs predicted lap time"
        actions={
          mae != null ? (
            <span className="font-mono text-xs text-fg-3">MAE {s2(mae)}</span>
          ) : undefined
        }
      >
        <AgentModelChart
          points={toChartPoints(range)}
          actualLabel="Actual"
          predLabel="XGBoost"
          yUnit="s"
          ciBand
          compoundDots
          stintLines
          height={240}
        />
      </ChartCard>
    </div>
  )
}
