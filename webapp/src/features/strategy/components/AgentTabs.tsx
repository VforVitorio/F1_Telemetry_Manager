// The Strategy tab's per-agent evidence pane (#35's "pit wall"). Segmented
// tabs — Pace / Tyres / Situation / Pit — each surface that sub-agent's raw ML
// output underneath the LLM-synthesised recommendation, so a strategist can
// audit *why* the orchestrator decided what it decided, not just *what* it
// decided. Sibling to `ScenarioBar` in this same directory: same "pure
// presentational, page owns the data" idiom.
//
// Lazy-fetch contract: a tab's `useAgent` call only becomes `enabled` once
// BOTH the master gate (`enabled` — a run has completed) AND that specific
// tab has been opened at least once are true. TanStack Query then caches the
// result keyed on (gp, driver, lap) — see `useAgent` in `../queries` — so
// flipping back and forth between tabs never re-fetches. The default 'pace'
// tab counts as opened the instant this component mounts, matching what the
// user actually sees on screen.
//
// Null tolerance: the 4 result shapes in `lib/api/strategy.ts` are hand-typed
// over a backend that returns `Dict[str, Any]` with no response-model
// validation, so a field being `null`/missing at runtime despite its TS type
// claiming `number`/`string` is a real case, not just type-checker paranoia.
// Every numeric read goes through `fmt`/`fmtSigned`; every categorical field
// goes through `levelConfig`; both degrade to a placeholder instead of
// crashing.

import { useState, type ReactNode } from 'react'
import type { LapState } from '@/lib/api/strategy'
import { useAgent } from '../queries'
import { Card } from '@/components/Card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/Tabs'
import { StatCard, MetricRow } from '@/components/StatCard'
import { ConfidenceDial } from '@/components/ConfidenceDial'
import { CompoundPill } from '@/components/CompoundPill'
import { Pill } from '@/components/Pill'
import { Skeleton } from '@/components/Skeleton'

// ── Formatting helpers ───────────────────────────────────────────────────

/**
 * Fixed-point formatter tolerant of null/undefined/NaN. Renders an em dash
 * instead of crashing `.toFixed()` — see the module docstring for why a
 * "number" field can still be missing at runtime.
 */
function fmt(value: number | null | undefined, digits: number, unit = ''): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}${unit}`
}

/** Same as `fmt`, but always shows a leading sign so direction reads at a
 *  glance (e.g. "+0.12s" vs "-0.08s"). */
function fmtSigned(value: number | null | undefined, digits: number, unit = ''): string {
  if (value == null || Number.isNaN(value)) return '—'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(digits)}${unit}`
}

type DeltaTone = 'success' | 'danger' | 'neutral'

const DELTA_COLOR: Record<DeltaTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-fg-1',
}

/** Tone for a signed delta: negative = faster/better (green), positive =
 *  slower/worse (red), zero or missing = neutral. */
function deltaTone(value: number | null | undefined): DeltaTone {
  if (value == null || Number.isNaN(value) || value === 0) return 'neutral'
  return value < 0 ? 'success' : 'danger'
}

// ── Categorical level → Pill label + tone ───────────────────────────────
//
// The 3 categorical fields (tyre warning_level, situation threat_level, pit
// action) are plain strings over an untyped backend dict — the exact literal
// sets come straight from the Python agents (tire_agent.py, race_situation_
// agent.py, pit_strategy_agent.py) rather than a shared TS enum, so each gets
// its own small config map here, mirroring `ActionBadge.tsx`'s ActionConfig
// pattern for the same reason: a value outside the known set must degrade
// gracefully, never crash.

type PillTone = 'neutral' | 'purple' | 'success' | 'warning' | 'danger' | 'info'

interface LevelConfig {
  label: string
  tone: PillTone
}

const TIRE_WARNING_CONFIG: Record<string, LevelConfig> = {
  OK: { label: 'OK', tone: 'success' },
  MONITOR: { label: 'Monitor', tone: 'warning' },
  PIT_SOON: { label: 'Pit soon', tone: 'danger' },
}

const THREAT_CONFIG: Record<string, LevelConfig> = {
  LOW: { label: 'Low', tone: 'success' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  HIGH: { label: 'High', tone: 'danger' },
}

const PIT_ACTION_CONFIG: Record<string, LevelConfig> = {
  STAY_OUT: { label: 'Stay out', tone: 'success' },
  PIT_NOW: { label: 'Pit now', tone: 'danger' },
  UNDERCUT: { label: 'Undercut', tone: 'warning' },
  OVERCUT: { label: 'Overcut', tone: 'warning' },
  REACTIVE_SC: { label: 'Reactive SC', tone: 'danger' },
}

const UNKNOWN_LEVEL: LevelConfig = { label: 'Unknown', tone: 'neutral' }

/** Look up a categorical level's Pill label + tone. Case-tolerant; a value
 *  outside the known set still renders (its raw text, neutral tone) instead
 *  of disappearing or throwing. */
function levelConfig(
  map: Record<string, LevelConfig>,
  level: string | null | undefined,
): LevelConfig {
  if (!level) return UNKNOWN_LEVEL
  return map[level.toUpperCase()] ?? { label: level, tone: 'neutral' }
}

// ── Micro-charts (plain HTML/CSS — no chart lib for a handful of static shapes) ──

interface RangeBarProps {
  low: number | null | undefined
  mid: number | null | undefined
  high: number | null | undefined
  format: (value: number) => string
}

/** Horizontal range indicator: a track from `low` to `high` with a marker dot
 *  at `mid` (a confidence interval, or a P05-P95 spread). Null-tolerant: any
 *  missing bound falls back to a short text note instead of a broken shape. */
function RangeBar({ low, mid, high, format }: RangeBarProps) {
  const isValid =
    low != null &&
    mid != null &&
    high != null &&
    !Number.isNaN(low) &&
    !Number.isNaN(mid) &&
    !Number.isNaN(high)
  if (!isValid) return <p className="text-xs text-fg-4">Range unavailable</p>

  const span = high - low
  const rawPct = span > 0 ? ((mid - low) / span) * 100 : 50
  const markerPct = Math.min(100, Math.max(0, rawPct))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-1.5 rounded-full bg-bg-5" aria-hidden="true">
        <div className="absolute left-0 top-1/2 h-2 w-px -translate-y-1/2 bg-fg-4" />
        <div className="absolute right-0 top-1/2 h-2 w-px -translate-y-1/2 bg-fg-4" />
        <div
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500"
          style={{ left: `${markerPct}%`, top: '50%' }}
        />
      </div>
      <div className="flex justify-between font-mono text-xs tabular-nums text-fg-4">
        <span>{format(low)}</span>
        <span className="text-fg-1">{format(mid)}</span>
        <span>{format(high)}</span>
      </div>
    </div>
  )
}

interface MiniBarItem {
  label: string
  value: number | null | undefined
}

interface MiniBarsProps {
  items: MiniBarItem[]
  format: (value: number) => string
}

/** A handful of small vertical bars scaled to their shared max, for a quick
 *  visual compare (e.g. laps-to-cliff P10/P50/P90). Drops any item whose
 *  value is missing rather than rendering a broken bar. */
function MiniBars({ items, format }: MiniBarsProps) {
  const valid = items.filter(
    (item): item is { label: string; value: number } =>
      item.value != null && !Number.isNaN(item.value),
  )
  if (valid.length === 0) return <p className="text-xs text-fg-4">No data</p>

  const max = Math.max(1, ...valid.map((item) => item.value))

  return (
    <div className="flex items-end gap-4">
      {valid.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1.5">
          <div className="flex h-16 w-6 items-end rounded bg-bg-5">
            <div
              className="w-full rounded bg-purple-500"
              style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-xs font-medium tabular-nums text-fg-2">
            {format(item.value)}
          </span>
          <span className="text-[11px] text-fg-4">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Small lowercase caption above a micro-chart. Deliberately quiet (no
 *  uppercase/tracking) — it's a per-chart label, not a section title. */
function ChartLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-fg-4">{label}</span>
      {children}
    </div>
  )
}

// ── Shared per-tab states (loading / error / idle / reasoning) ──────────

/** Structural loading placeholder — `cards` approximates the number of
 *  StatCard-sized blocks the real content will show once it arrives. */
function AgentTabSkeleton({ cards }: { cards: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function AgentUnavailable() {
  return <p className="text-sm text-fg-4">Agent unavailable.</p>
}

function AgentIdle() {
  return <p className="text-sm text-fg-4">Run a scenario to see this agent&rsquo;s evidence.</p>
}

/** The agent's free-text reasoning, tucked behind a `<details>` disclosure so
 *  the tab's headline numbers stay the focus. Renders nothing for an empty
 *  reasoning string rather than an empty disclosure. */
function ReasoningDisclosure({ reasoning }: { reasoning: string | null | undefined }) {
  if (!reasoning) return null
  return (
    <details className="group rounded-lg border border-hairline bg-bg-4 p-3">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-widest text-fg-3 group-open:text-fg-1">
        Reasoning
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{reasoning}</p>
    </details>
  )
}

// ── Per-agent tabs ───────────────────────────────────────────────────────
//
// Each tab calls its own `useAgent` unconditionally (rules of hooks) and
// gates only the *fetch* via the `enabled` argument — never the hook call
// itself. State order is always: error → data → (enabled ? skeleton : idle).

interface AgentTabPanelProps {
  lapState: LapState
  enabled: boolean
}

/** Pace evidence: predicted lap time plus both deltas as StatCards, and the
 *  agent's reasoning. The confidence interval now lives on the full-width
 *  Race Trace chart (with real lap-by-lap context), so this tab stays lean
 *  instead of repeating a tiny duplicate range bar. */
function PaceTab({ lapState, enabled }: AgentTabPanelProps) {
  const query = useAgent('pace', lapState, enabled)

  if (query.isError) return <AgentUnavailable />
  if (!query.data) return enabled ? <AgentTabSkeleton cards={3} /> : <AgentIdle />

  const pace = query.data

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard eyebrow="Lap time" value={fmt(pace.lap_time_pred, 3, 's')} />
        <StatCard
          eyebrow="Δ vs median"
          value={
            <span className={DELTA_COLOR[deltaTone(pace.delta_vs_median)]}>
              {fmtSigned(pace.delta_vs_median, 2, 's')}
            </span>
          }
          hint="Negative = faster than the field median"
        />
        <StatCard
          eyebrow="Δ vs previous"
          value={
            <span className={DELTA_COLOR[deltaTone(pace.delta_vs_prev)]}>
              {fmtSigned(pace.delta_vs_prev, 2, 's')}
            </span>
          }
          hint="Negative = faster than the last lap"
        />
      </div>
      <ReasoningDisclosure reasoning={pace.reasoning} />
    </div>
  )
}

/** Tyre evidence: compound + warning-level pills, tyre-life/degradation
 *  StatCards, and a laps-to-cliff P10/P50/P90 mini bar chart. */
function TyresTab({ lapState, enabled }: AgentTabPanelProps) {
  const query = useAgent('tire', lapState, enabled)

  if (query.isError) return <AgentUnavailable />
  if (!query.data) return enabled ? <AgentTabSkeleton cards={2} /> : <AgentIdle />

  const tire = query.data
  const warning = levelConfig(TIRE_WARNING_CONFIG, tire.warning_level)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {tire.compound ? <CompoundPill compound={tire.compound} /> : null}
        <Pill tone={warning.tone}>{warning.label}</Pill>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard eyebrow="Tyre life" value={fmt(tire.current_tyre_life, 0, ' laps')} />
        <StatCard eyebrow="Degradation rate" value={fmt(tire.deg_rate, 3, 's/lap')} />
      </div>
      <ChartLabel label="Laps to cliff (P10 / P50 / P90)">
        <MiniBars
          items={[
            { label: 'P10', value: tire.laps_to_cliff_p10 },
            { label: 'P50', value: tire.laps_to_cliff_p50 },
            { label: 'P90', value: tire.laps_to_cliff_p90 },
          ]}
          format={(value) => value.toFixed(0)}
        />
      </ChartLabel>
      <ReasoningDisclosure reasoning={tire.reasoning} />
    </div>
  )
}

/** Situation evidence: a threat-level pill, side-by-side confidence dials for
 *  overtake probability and 3-lap safety-car probability, and the
 *  surrounding gap/pace-delta context. */
function SituationTab({ lapState, enabled }: AgentTabPanelProps) {
  const query = useAgent('situation', lapState, enabled)

  if (query.isError) return <AgentUnavailable />
  if (!query.data) return enabled ? <AgentTabSkeleton cards={2} /> : <AgentIdle />

  const situation = query.data
  const threat = levelConfig(THREAT_CONFIG, situation.threat_level)

  return (
    <div className="flex flex-col gap-4">
      <Pill tone={threat.tone} className="w-fit">
        {threat.label} threat
      </Pill>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col items-center gap-2">
          <ConfidenceDial
            value={situation.overtake_prob ?? 0}
            note="Calibrated model probability"
          />
          <span className="text-[11px] text-fg-4">Overtake</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ConfidenceDial value={situation.sc_prob_3lap ?? 0} note="Calibrated model probability" />
          <span className="text-[11px] text-fg-4">Safety car (3 laps)</span>
        </div>
      </div>
      <MetricRow
        items={[
          { label: 'Gap ahead', value: fmt(situation.gap_ahead_s, 1, 's') },
          { label: 'Pace Δ', value: fmtSigned(situation.pace_delta_s, 2, 's') },
        ]}
      />
      <ReasoningDisclosure reasoning={situation.reasoning} />
    </div>
  )
}

/** Pit evidence: recommended action + compound pills, recommended-lap/stop-
 *  duration StatCards, a P05-P95 stop-duration range bar, and — only when the
 *  agent actually returned one — an undercut-probability dial against its
 *  target rival. */
function PitTab({ lapState, enabled }: AgentTabPanelProps) {
  const query = useAgent('pit', lapState, enabled)

  if (query.isError) return <AgentUnavailable />
  if (!query.data) return enabled ? <AgentTabSkeleton cards={2} /> : <AgentIdle />

  const pit = query.data
  const action = levelConfig(PIT_ACTION_CONFIG, pit.action)
  const hasUndercut = pit.undercut_prob != null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={action.tone}>{action.label}</Pill>
        {pit.compound_recommendation ? (
          <CompoundPill compound={pit.compound_recommendation} />
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          eyebrow="Recommended lap"
          value={pit.recommended_lap != null ? `Lap ${pit.recommended_lap}` : '—'}
        />
        <StatCard eyebrow="Stop duration (P50)" value={fmt(pit.stop_duration_p50, 1, 's')} />
      </div>
      <ChartLabel label="Stop duration range (P05 / P95)">
        <RangeBar
          low={pit.stop_duration_p05}
          mid={pit.stop_duration_p50}
          high={pit.stop_duration_p95}
          format={(value) => `${value.toFixed(1)}s`}
        />
      </ChartLabel>
      {hasUndercut ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <ConfidenceDial value={pit.undercut_prob ?? 0} note="Calibrated model probability" />
            <span className="text-[11px] text-fg-4">Undercut</span>
          </div>
          {pit.undercut_target ? (
            <span className="text-sm text-fg-3">
              vs <span className="font-mono text-fg-1">{pit.undercut_target}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <ReasoningDisclosure reasoning={pit.reasoning} />
    </div>
  )
}

// ── The tab set ──────────────────────────────────────────────────────────

type AgentTabKey = 'pace' | 'tire' | 'situation' | 'pit'

const TAB_LABELS: Record<AgentTabKey, string> = {
  pace: 'Pace',
  tire: 'Tyres',
  situation: 'Situation',
  pit: 'Pit',
}

/** 'pace' is the default active tab, so it counts as opened the moment this
 *  component mounts — no click needed to fire its first fetch. */
const INITIAL_OPENED: Record<AgentTabKey, boolean> = {
  pace: true,
  tire: false,
  situation: false,
  pit: false,
}

export interface AgentTabsProps {
  lapState: LapState
  /** Master gate: only fetch once a run has completed (the page passes
   *  `true` when complete). */
  enabled: boolean
}

/**
 * Segmented tab set exposing each sub-agent's raw ML evidence behind the
 * synthesised recommendation. See the module docstring for the lazy-fetch
 * and null-tolerance contracts.
 */
export function AgentTabs({ lapState, enabled }: AgentTabsProps) {
  const [opened, setOpened] = useState<Record<AgentTabKey, boolean>>(INITIAL_OPENED)

  function markOpened(value: string) {
    const key = value as AgentTabKey
    setOpened((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold text-fg-1">Agent breakdown</h3>
      <Tabs defaultValue="pace" onValueChange={markOpened}>
        <TabsList variant="segmented">
          <TabsTrigger value="pace">{TAB_LABELS.pace}</TabsTrigger>
          <TabsTrigger value="tire">{TAB_LABELS.tire}</TabsTrigger>
          <TabsTrigger value="situation">{TAB_LABELS.situation}</TabsTrigger>
          <TabsTrigger value="pit">{TAB_LABELS.pit}</TabsTrigger>
        </TabsList>
        <TabsContent value="pace" className="pt-4">
          <PaceTab lapState={lapState} enabled={enabled && opened.pace} />
        </TabsContent>
        <TabsContent value="tire" className="pt-4">
          <TyresTab lapState={lapState} enabled={enabled && opened.tire} />
        </TabsContent>
        <TabsContent value="situation" className="pt-4">
          <SituationTab lapState={lapState} enabled={enabled && opened.situation} />
        </TabsContent>
        <TabsContent value="pit" className="pt-4">
          <PitTab lapState={lapState} enabled={enabled && opened.pit} />
        </TabsContent>
      </Tabs>
    </Card>
  )
}
