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
import { useToast } from '@/components/Toast'
import {
  fetchLapRange,
  fetchLapState,
  fetchTireRange,
  runAgent,
  type TireRangePoint,
  type TireResult,
} from '@/lib/api/strategy'
import { compoundVariant } from '@/lib/compounds'
import { runFailureToast } from './runError'
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

/** Formats an ABSOLUTE lap number as "L46", the same shorthand the runway
 *  strip and the rest of the app use for a specific lap. Reserved strictly
 *  for absolute laps: a relative count (tyre age, laps-to-cliff) is a number
 *  of laps FROM NOW, not a lap on the calendar, and printing it as "L<n>"
 *  reads as the wrong lap entirely (see the cliff StatCard below). */
function fmtLap(n: number): string {
  return `L${Math.round(n)}`
}

/** True when the agent's compound verdict is a Pirelli C-number ("C4")
 *  rather than a named compound ("SOFT"). The tyre model reports whichever
 *  one it was trained on; the branded CompoundPill only knows named
 *  compounds, so a C-number verdict needs the lap's own compound name to
 *  pick its colour (see `compoundName` below). */
function isCNumber(compound: string): boolean {
  return /^C\d$/i.test(compound)
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
  const { toast } = useToast()
  const abortRef = useRef<AbortController | null>(null)
  const runSeqRef = useRef(0)

  const runMut = useMutation({
    mutationFn: async ({
      signal,
      seq,
    }: {
      signal: AbortSignal
      seq: number
    }): Promise<{ agent: TireResult; range: TireRangePoint[]; seq: number }> => {
      const [agent, range] = await Promise.all([
        fetchLapState(gp!, driver!, lap!, LAB_YEAR, signal).then((lapState) =>
          runAgent('tire', lapState, signal),
        ),
        fetchLapRange(gp!, driver!, LAB_YEAR).then((lapRange) =>
          fetchTireRange(gp!, driver!, lapRange.min_lap, lapRange.max_lap, LAB_YEAR, signal),
        ),
      ])
      return { agent, range, seq }
    },
    onSuccess: ({ agent, range, seq }) => {
      // Drop a run the user cancelled or superseded before it resolved.
      if (seq !== runSeqRef.current) return
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
    onError: (error) => runFailureToast(toast, 'Tyres', error),
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

  // The compound name for the run's own lap, read back from the trajectory
  // points already fetched for the chart (no extra call). When the agent's
  // verdict is a C-number, this is the only way to know which brand colour
  // it refers to; otherwise the agent's own compound string is used as-is.
  const rangeCompoundAtLap = range.find((p) => p.lap === run.context.lap)?.compound
  const compoundName = isCNumber(agent.compound) ? rangeCompoundAtLap : agent.compound
  const brandedVariant = isCNumber(agent.compound)
    ? compoundVariant(rangeCompoundAtLap ?? '')
    : null

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
        <div className="flex flex-col items-start justify-center gap-1.5 rounded-2xl border border-hairline bg-bg-3 px-4 py-3 shadow-[var(--shadow-card)]">
          <span className="text-xs font-medium uppercase tracking-widest text-fg-3">Verdict</span>
          <div className="flex items-center gap-1.5">
            <Pill tone={warningTone(agent.warning_level)}>{agent.warning_level}</Pill>
            {brandedVariant ? (
              <Pill compound={brandedVariant}>{agent.compound}</Pill>
            ) : (
              <CompoundPill compound={agent.compound} />
            )}
          </div>
        </div>
        <StatCard eyebrow="Tyre life" value={`${Math.round(agent.current_tyre_life)} laps`} />
        <StatCard eyebrow="Deg rate" value={`${agent.deg_rate.toFixed(3)} s/lap`} />
        <StatCard
          eyebrow="Laps to cliff"
          value={`+${Math.round(agent.laps_to_cliff_p50)}`}
          hint={
            run.context.lap != null
              ? `≈ ${fmtLap(run.context.lap + agent.laps_to_cliff_p50)} · P10 +${Math.round(agent.laps_to_cliff_p10)} · P90 +${Math.round(agent.laps_to_cliff_p90)}`
              : `P10 +${Math.round(agent.laps_to_cliff_p10)} · P90 +${Math.round(agent.laps_to_cliff_p90)}`
          }
        />
      </VerdictRow>

      <StintRunway
        tyreLife={agent.current_tyre_life}
        cliffP10={agent.laps_to_cliff_p10}
        cliffP50={agent.laps_to_cliff_p50}
        cliffP90={agent.laps_to_cliff_p90}
        compound={compoundName}
      />

      <ChartCard title="Tyre degradation trajectory (s vs. fresh tyre)">
        <AgentModelChart
          points={toChartPoints(range)}
          actualLabel="Actual"
          predLabel="TCN estimate"
          yUnit="s"
          compoundDots
          height={220}
        />
      </ChartCard>

      <ReasoningDisclosure reasoning={agent.reasoning} />
    </div>
  )
}
