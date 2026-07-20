// Tyre degradation bench (TCN + MC-Dropout). One run fires two independent
// calls: the agent verdict (POST /tire, off a single lap_state, giving deg
// rate, cliff quantiles, warning level) and the trajectory across the
// driver's whole lap window (POST /tire-range, actual vs predicted
// degradation per lap). Both are pure ML (no LLM, no rate limit), so the run
// is fast. Same idle/running/done/stale shape as PaceResultView, see that
// file's header for the state-machine rationale; this one adds a warning
// Pill and StintRunway cliff read since, unlike Pace, Tyres carries a
// verdict class.

import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Disc3 } from 'lucide-react'
import { AgentModelChart, type AgentModelPoint } from '@/charts/AgentModelChart'
import { ChartCard } from '@/components/ChartCard'
import { CompoundPill } from '@/components/CompoundPill'
import { Pill } from '@/components/Pill'
import { Skeleton } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import {
  fetchLapRange,
  fetchLapState,
  fetchTireRange,
  runAgent,
  type TireRangePoint,
} from '@/lib/api/strategy'
import { LAB_YEAR } from '../search'
import { StintRunway } from '../components/StintRunway'
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

export const TYRE_META: ModelMeta = {
  id: 'tyres',
  Icon: Disc3,
  title: 'Tyre degradation',
  modelChip: 'TCN + MC-Dropout',
  evalHeadline: 'Coverage 0.708',
  blurb: 'Projects tyre degradation and the laps until the performance cliff, with uncertainty.',
  control: 'lap',
}

/** One lap count, formatted "L18", the same shorthand StintRunway already
 *  uses for tyre age and the cliff quantiles, so the StatCards and the strip
 *  read as one vocabulary. */
function fmtLap(n: number): string {
  return `L${Math.round(n)}`
}

/** Pill tone for the agent's warning level. PIT_SOON is the only urgent call,
 *  MONITOR is a heads-up, and OK (or anything unrecognised) reads as fine. */
function warningTone(level: string): 'danger' | 'warning' | 'success' {
  if (level === 'PIT_SOON') return 'danger'
  if (level === 'MONITOR') return 'warning'
  return 'success'
}

/** TireRangePoint[] -> the chart's point shape. No CI band and no stint
 *  markers here, /tire-range carries neither, unlike /pace-range. */
function toChartPoints(points: TireRangePoint[]): AgentModelPoint[] {
  return points.map((p) => ({
    lap: p.lap,
    actual: p.actual,
    pred: p.pred,
    compound: p.compound,
  }))
}

export function TyreResultView({ gp, driver, lap }: ResultViewProps) {
  const addRun = useLabStore((s) => s.addRun)
  const activeRun = useLabStore((s) => selectActiveRun(s, 'tyres'))
  const abortRef = useRef<AbortController | null>(null)

  const runMut = useMutation({
    mutationFn: async ({ signal }: { signal: AbortSignal }) => {
      const [agent, range] = await Promise.all([
        fetchLapState(gp!, driver!, lap!, LAB_YEAR).then((lapState) => runAgent('tire', lapState)),
        fetchLapRange(gp!, driver!, LAB_YEAR).then((lapRange) =>
          fetchTireRange(gp!, driver!, lapRange.min_lap, lapRange.max_lap, LAB_YEAR, signal),
        ),
      ])
      return { agent, range }
    },
    onSuccess: ({ agent, range }) => {
      const run: LabRun = {
        id: crypto.randomUUID(),
        model: 'tyres',
        context: { gp, driver, lap },
        result: { kind: 'tyres', agent, range },
        label: lap != null ? `Lap ${lap}` : 'Tyres',
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
    const ac = new AbortController()
    abortRef.current = ac
    runMut.mutate({ signal: ac.signal })
  }
  function onCancel() {
    abortRef.current?.abort()
    runMut.reset()
  }

  if (runMut.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <RunHeader
          title={TYRE_META.title}
          modelChip={TYRE_META.modelChip}
          right={<RunControls isRunning onRun={onRun} onCancel={onCancel} elapsed={elapsed} />}
        />
        <Skeleton className="h-52 w-full" />
        <p className="text-center text-xs text-fg-4">Running the tyre model...</p>
      </div>
    )
  }

  const run = activeRun?.result.kind === 'tyres' ? activeRun : undefined
  if (!run) {
    return <IdleHero meta={TYRE_META} disabledReason={disabledReason} onRun={onRun} />
  }
  if (run.result.kind !== 'tyres') return null // unreachable, narrows the result type below
  const { agent, range } = run.result

  const stale = run.context.gp !== gp || run.context.driver !== driver || run.context.lap !== lap

  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        title={TYRE_META.title}
        modelChip={TYRE_META.modelChip}
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
        <Pill tone={warningTone(agent.warning_level)}>{agent.warning_level}</Pill>
        <CompoundPill compound={agent.compound} />
        <StatCard eyebrow="Tyre life" value={fmtLap(agent.current_tyre_life)} />
        <StatCard eyebrow="Deg rate" value={`${agent.deg_rate.toFixed(3)} s/lap`} />
        <StatCard
          eyebrow="Cliff P50"
          value={fmtLap(agent.laps_to_cliff_p50)}
          hint={`P10 ${fmtLap(agent.laps_to_cliff_p10)} · P90 ${fmtLap(agent.laps_to_cliff_p90)}`}
        />
      </VerdictRow>

      <StintRunway
        tyreLife={agent.current_tyre_life}
        cliffP10={agent.laps_to_cliff_p10}
        cliffP50={agent.laps_to_cliff_p50}
        cliffP90={agent.laps_to_cliff_p90}
      />

      <ChartCard title="Tyre degradation trajectory">
        <AgentModelChart
          points={toChartPoints(range)}
          actualLabel="Actual"
          predLabel="TCN estimate"
          yUnit=""
          compoundDots
          height={220}
        />
      </ChartCard>

      <ReasoningDisclosure reasoning={agent.reasoning} />
    </div>
  )
}
