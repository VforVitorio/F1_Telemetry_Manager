// Race-situation bench (LightGBM). ONE /situation run feeds two lenses: Overtake
// (overtake_prob, action threshold 0.80) and Safety car (sc_prob_3lap, alert
// threshold 0.30, plus a lift-over-season-base compare). Both lenses read the
// same SituationFacts strip (gap/DRS, pace delta, SC/VSC flags) because a
// single backend call answers both questions in one shot.

import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ShieldAlert, Swords } from 'lucide-react'
import { Gauge } from '@/charts/Gauge'
import { ChartCard } from '@/components/ChartCard'
import { MetricRow } from '@/components/StatCard'
import { Pill } from '@/components/Pill'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { fetchLapState, runAgent, type SituationResult } from '@/lib/api/strategy'
import { runFailureToast } from './runError'
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

export const OVERTAKE_META: ModelMeta = {
  id: 'overtake',
  Icon: Swords,
  title: 'Overtake',
  modelChip: 'LightGBM',
  evalHeadline: 'AUC-PR 0.549',
  blurb: 'Estimates the probability the driver completes an overtake within the window.',
  control: 'lap',
}

export const SAFETYCAR_META: ModelMeta = {
  id: 'safetycar',
  Icon: ShieldAlert,
  title: 'Safety car',
  modelChip: 'LightGBM',
  evalHeadline: 'AUC-PR 0.072 (lift 1.67x)',
  blurb: 'Estimates the probability of a safety car within the next three laps.',
  control: 'lap',
}

export type SituationLens = 'overtake' | 'safetycar'

/** Approximate season prevalence of "safety car within the next 3 laps",
 *  used only as the "season base" bar the current lap's sc_prob_3lap gets
 *  compared against so the number reads as a lift over normal odds instead
 *  of in isolation. This is a rough figure; verify the exact prevalence
 *  against the technical report's safety-car dataset stats before quoting it
 *  anywhere outside this comparison. */
const SC_BASE_RATE_3LAP = 0.043

const THREAT_TONE: Record<string, 'danger' | 'warning' | 'success'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
}

/** Pill tone for a threat_level string. Falls back to a neutral-reading
 *  "success" tone for any value the backend hasn't defined yet, so an
 *  unexpected label never renders as an alarming red by accident. */
function threatTone(level: string): 'danger' | 'warning' | 'success' {
  return THREAT_TONE[level] ?? 'success'
}

/** The gap/DRS, pace-delta and SC/VSC facts both lenses share, so a viewer
 *  reads the same race context whether the bench is showing Overtake or
 *  Safety car odds. */
function SituationFacts({ agent }: { agent: SituationResult }) {
  const inDrsWindow = agent.gap_ahead_s < 1.0
  const paceRising = agent.pace_delta_s > 0
  const PaceArrow = paceRising ? ArrowUp : ArrowDown
  const paceText = `${paceRising ? '+' : ''}${agent.pace_delta_s.toFixed(2)}s/lap`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MetricRow
        items={[
          { label: 'Gap ahead', value: `${agent.gap_ahead_s.toFixed(1)}s` },
          {
            label: 'Pace delta',
            value: (
              <span className="inline-flex items-center gap-0.5">
                <PaceArrow className="size-3" aria-hidden="true" />
                {paceText}
              </span>
            ),
          },
        ]}
      />
      {inDrsWindow ? <Pill tone="info">DRS</Pill> : null}
      {agent.sc_currently_active ? (
        <Pill tone="danger">SC</Pill>
      ) : agent.vsc_active ? (
        <Pill tone="warning">VSC</Pill>
      ) : (
        <span className="text-xs text-fg-4">Green flag</span>
      )}
    </div>
  )
}

/** One horizontal bar in the baseline-lift compare: a label, a track scaled
 *  to `scaleMax`, and a mono percentage readout. */
function BarRow({
  label,
  value,
  scaleMax,
  tone,
}: {
  label: string
  value: number
  scaleMax: number
  tone: string
}) {
  const pct = (value / scaleMax) * 100
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-fg-4">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-fg-1/10" aria-hidden="true">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-fg-1">
        {`${Math.round(value * 100)}%`}
      </span>
    </div>
  )
}

/** Two-bar compare of this lap's 3-lap safety-car probability against the
 *  season base rate, plus a lift caption. Plain CSS bars, no chart lib, for a
 *  single static shape that only the Safety car lens needs. */
function BaselineLiftBar({ current }: { current: number }) {
  const scaleMax = Math.max(current, SC_BASE_RATE_3LAP, 0.0001) // floor avoids a 0/0 width when both are 0
  const lift = SC_BASE_RATE_3LAP > 0 ? current / SC_BASE_RATE_3LAP : 0

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-widest text-fg-3 uppercase">
        Vs. season base rate
      </span>
      <BarRow label="This lap" value={current} scaleMax={scaleMax} tone="bg-purple-500" />
      <BarRow label="Season base" value={SC_BASE_RATE_3LAP} scaleMax={scaleMax} tone="bg-fg-4" />
      <p className="text-xs text-fg-3">
        Lift <span className="font-mono text-fg-1">{lift.toFixed(2)}x</span> over the season base
        rate
      </p>
    </div>
  )
}

function sameLap(a: LabRun['context'], gp?: string, driver?: string, lap?: number): boolean {
  return a.gp === gp && a.driver === driver && a.lap === lap
}

export function SituationResultView({
  gp,
  driver,
  lap,
  lens,
}: ResultViewProps & { lens: SituationLens }) {
  const meta = lens === 'overtake' ? OVERTAKE_META : SAFETYCAR_META
  const addRun = useLabStore((s) => s.addRun)
  const activeRun = useLabStore((s) => selectActiveRun(s, lens))
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
    }): Promise<{ agent: SituationResult; seq: number }> => {
      const lapState = await fetchLapState(gp!, driver!, lap!, LAB_YEAR, signal)
      const agent = await runAgent('situation', lapState, signal)
      return { agent, seq }
    },
    onSuccess: ({ agent, seq }) => {
      // Drop a run the user cancelled or superseded before it resolved.
      if (seq !== runSeqRef.current) return
      const run: LabRun = {
        id: crypto.randomUUID(),
        model: lens,
        context: { gp, driver, lap },
        result: { kind: 'situation', agent },
        label: `Lap ${lap}`,
        ranAt: Date.now(),
      }
      addRun(run)
    },
    onError: (error) => runFailureToast(toast, meta.title, error),
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
          title={meta.title}
          modelChip={meta.modelChip}
          right={<RunControls isRunning onRun={onRun} onCancel={onCancel} elapsed={elapsed} />}
        />
        <Skeleton className="h-48 w-full" />
        <p className="text-center text-xs text-fg-4">Running the situation model...</p>
      </div>
    )
  }

  const run = activeRun?.result.kind === 'situation' ? activeRun : undefined
  if (!run) {
    return <IdleHero meta={meta} disabledReason={disabledReason} onRun={onRun} />
  }

  const agent = run.result.kind === 'situation' ? run.result.agent : undefined
  if (!agent) return null

  const stale = !sameLap(run.context, gp, driver, lap)

  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        title={meta.title}
        modelChip={meta.modelChip}
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
        <Pill tone={threatTone(agent.threat_level)}>{agent.threat_level} threat</Pill>
      </VerdictRow>

      <ChartCard
        title={lens === 'overtake' ? 'Overtake probability' : 'SC probability (3 laps)'}
        maximizable={false}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-center">
          <div className="mx-auto w-full max-w-xs">
            <Gauge
              value={lens === 'overtake' ? agent.overtake_prob : agent.sc_prob_3lap}
              label={lens === 'overtake' ? 'Overtake' : 'SC in 3 laps'}
              threshold={lens === 'overtake' ? 0.8 : 0.3}
              thresholdLabel={lens === 'overtake' ? 'Action threshold 80%' : 'Alert threshold 30%'}
              height={170}
            />
          </div>
          <div className="flex flex-col gap-3">
            <SituationFacts agent={agent} />
            {lens === 'safetycar' ? <BaselineLiftBar current={agent.sc_prob_3lap} /> : null}
          </div>
        </div>
      </ChartCard>

      <p className="text-xs text-fg-4">
        One run scores both lenses. Overtake and Safety car share the situation agent.
      </p>

      <ReasoningDisclosure reasoning={agent.reasoning} />
    </div>
  )
}
