import type { ReactNode } from 'react'
import type { LapState, LapStateDriver, LapStateRival, SituationResult } from '@/lib/api/strategy'
import { CompoundPill } from '@/components/CompoundPill'
import { getDriverTextColor } from '@/lib/drivers'
import { useAgent } from '../queries'
import { STRATEGY_YEAR } from '../search'

// The lap readout — a pit-wall timing-screen row replacing SituationStrip's
// 5-StatCard grid. A real timing screen doesn't box every number in its own
// tile; it reads as one dense line, hierarchy carried by weight and colour
// (LAP number bold, labels faint mono, values bright) instead of by borders.
// Data logic is unchanged from SituationStrip: same `lap_state` fields, the
// same `situation` agent prefetch for SC risk, and the same rival lookup for
// an optional duel line — only the layout is de-slopped.

/** "+X.Xs" — a gap is always framed as a positive interval to the car ahead,
 *  so the sign is decorative, not a direction indicator (unlike `formatSigned`).
 *  A zero gap means there's no car ahead at all, so it reads as "Leader"
 *  rather than the meaningless "+0.0s". */
function formatGap(seconds: number): string {
  if (seconds === 0) return 'Leader'
  return `+${seconds.toFixed(1)}s`
}

/** Lap time to 3 decimals with a trailing unit, e.g. "92.345s". */
function formatLapTime(seconds: number): string {
  return `${seconds.toFixed(3)}s`
}

/** Sign-prefixed number for a duel delta (e.g. "+2" or "-1"). A bare negative
 *  already reads as negative, so only the `+` case needs adding explicitly. */
function formatSigned(value: number, decimals = 0): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

/** Δgap for the duel line: a zero delta means both cars have identical
 *  breathing room, so it reads as "Level" rather than the meaningless "+0.0s". */
function formatGapDelta(value: number): string {
  if (value === 0) return 'Level'
  return `${formatSigned(value, 1)}s`
}

/** SC probability as a percentage, or an em dash while the `situation` agent
 *  query is loading OR has errored — the caller never branches on query
 *  status itself, just renders this string. */
function scProbabilityLabel(result: SituationResult | undefined): string {
  if (result == null) return '—'
  return `${(result.sc_prob_3lap * 100).toFixed(1)}%`
}

/** Find the rival by driver code among the timing-screen-only rivals array.
 *  Returns undefined for an unknown code — the caller renders the readout
 *  without a duel line rather than crashing. */
function findRival(lapState: LapState, code: string): LapStateRival | undefined {
  return lapState.rivals.find((candidate) => candidate.driver === code)
}

/** A middot divider between metric groups — a hairline character, not a card
 *  border, so the row reads as one continuous instrument strip. Decorative
 *  only (screen readers already get the label/value text either side). */
function Separator() {
  return (
    <span aria-hidden="true" className="text-fg-4">
      ·
    </span>
  )
}

interface MetricProps {
  /** Tiny lowercase name for the metric, e.g. "tyre" or "SC(3)". */
  label: string
  children: ReactNode
}

/** One `label value` group — the atomic unit of the readout row. Weight and
 *  colour alone separate label from value; no per-metric box. */
function Metric({ label, children }: MetricProps) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-fg-4">{label}</span>
      <span className="font-medium tabular-nums text-fg-1">{children}</span>
    </span>
  )
}

interface DuelLineProps {
  driver: LapStateDriver
  rival: LapStateRival
}

/**
 * Head-to-head comparison line for the optional rival duel — same mono,
 * middot-separated idiom as the main row, rendered as a second line rather
 * than a bordered card so it reads as part of the same instrument strip.
 *
 * Δtyre and Δgap are framed from our driver's perspective (positive = fresher
 * tyres / more gap in hand) so the sign alone tells the story without a
 * legend. Δgap compares each car's own "gap to the car ahead of them" — the
 * contract has no literal driver-to-rival interval (rivals are
 * timing-screen data only), so this is the best available proxy.
 */
function DuelLine({ driver, rival }: DuelLineProps) {
  const tyreDelta = driver.tyre_life - rival.tyre_life
  const gapDelta = driver.gap_ahead_s - rival.gap_ahead_s
  const driverColor = getDriverTextColor(driver.driver, STRATEGY_YEAR)
  const rivalColor = getDriverTextColor(rival.driver, STRATEGY_YEAR)

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm">
      <span className="flex items-baseline gap-1.5 font-medium">
        <span style={{ color: driverColor }}>{driver.driver}</span>
        <span className="text-fg-4">vs</span>
        <span style={{ color: rivalColor }}>{rival.driver}</span>
      </span>
      <Separator />
      <Metric label="Δtyre">{formatSigned(tyreDelta)} laps</Metric>
      <Separator />
      <Metric label="Δgap">{formatGapDelta(gapDelta)}</Metric>
      <Separator />
      <Metric label={`${rival.driver} tyre`}>
        <CompoundPill compound={rival.compound} />
      </Metric>
      <Separator />
      <Metric label={`${rival.driver} last`}>{formatLapTime(rival.lap_time_s)}</Metric>
    </div>
  )
}

export interface LapReadoutProps {
  lapState: LapState
  /** Optional rival driver code for the duel line below the main row. */
  rival?: string
  /** true when the readout shows a PREVIEW lap (the decision cursor) that differs
   *  from the active run's lap — prefix it "PREVIEW ·" in amber. */
  isPreview?: boolean
}

/**
 * The lap readout: our driver's compound/tyre age/gap/lap time/SC risk as one
 * pit-wall timing-screen row, plus an optional rival duel line. Reads directly
 * off `lapState` (no derived store), so it always mirrors the exact lap the
 * orchestrator is about to analyse.
 */
export function LapReadout({ lapState, rival, isPreview }: LapReadoutProps) {
  const driver = lapState.driver
  const situationQuery = useAgent('situation', lapState, true)
  const scLabel = scProbabilityLabel(situationQuery.data)
  const rivalMatch = rival ? findRival(lapState, rival) : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm">
        {isPreview ? (
          <>
            <span className="text-[11px] font-semibold tracking-wide text-warning">PREVIEW</span>
            <Separator />
          </>
        ) : null}
        <span className="font-bold tabular-nums text-fg-1">LAP {lapState.lap_number}</span>
        <CompoundPill compound={driver.compound} />
        <Separator />
        <Metric label="tyre">{driver.tyre_life} laps</Metric>
        <Separator />
        <Metric label="gap">{formatGap(driver.gap_ahead_s)}</Metric>
        <Separator />
        <Metric label="last">{formatLapTime(driver.lap_time_s)}</Metric>
        <Separator />
        <Metric label="SC(3)">{scLabel}</Metric>
      </div>
      {rivalMatch ? <DuelLine driver={driver} rival={rivalMatch} /> : null}
    </div>
  )
}
