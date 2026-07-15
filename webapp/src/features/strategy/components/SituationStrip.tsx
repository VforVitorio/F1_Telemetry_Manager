import type { LapState, LapStateDriver, LapStateRival, SituationResult } from '@/lib/api/strategy'
import { StatCard, MetricRow } from '@/components/StatCard'
import { CompoundPill } from '@/components/CompoundPill'
import { Card } from '@/components/Card'
import { getDriverTextColor } from '@/lib/drivers'
import { useAgent } from '../queries'
import { STRATEGY_YEAR } from '../search'

// The lap snapshot strip — our driver's live telemetry as a row of StatCards,
// plus an optional rival duel comparison. It reads directly off `lapState`
// (no derived store), so it always mirrors the exact lap the orchestrator is
// about to analyse. The SC-probability card fires its own `situation` agent
// query rather than waiting on the full orchestrator run, since that
// sub-agent is pure ML (no LLM, no rate limit) and cheap to prefetch the
// moment a lap state exists.

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

/** Δgap for the duel row: a zero delta means both cars have identical
 *  breathing room, so it reads as "Level" rather than the meaningless
 *  "+0.0s". */
function formatGapDelta(value: number): string {
  if (value === 0) return 'Level'
  return `${formatSigned(value, 1)}s`
}

/** SC probability as a percentage, or an em dash while the `situation` agent
 *  query is loading OR has errored — the caller never needs to branch on
 *  query status itself, just render this string. */
function scProbabilityLabel(result: SituationResult | undefined): string {
  if (result == null) return '—'
  return `${(result.sc_prob_3lap * 100).toFixed(1)}%`
}

/** Find the rival by driver code among the timing-screen-only rivals array.
 *  Returns undefined for an unknown code — the caller renders the strip
 *  without a duel row rather than crashing. */
function findRival(lapState: LapState, code: string): LapStateRival | undefined {
  return lapState.rivals.find((candidate) => candidate.driver === code)
}

interface DuelRowProps {
  driver: LapStateDriver
  rival: LapStateRival
}

/**
 * Head-to-head comparison card for the optional rival duel. Δtyre and Δgap
 * are framed from our driver's perspective (positive = fresher tyres / more
 * gap in hand) so the sign alone tells the story without a legend.
 *
 * Δgap compares each car's own "gap to the car ahead of them" — the contract
 * has no literal driver-to-rival interval (rivals are timing-screen data
 * only), so this is the best available proxy: it reads as "who has more
 * breathing room right now", not a precise on-track distance between the two.
 */
function DuelRow({ driver, rival }: DuelRowProps) {
  const tyreDelta = driver.tyre_life - rival.tyre_life
  const gapDelta = driver.gap_ahead_s - rival.gap_ahead_s
  const driverColor = getDriverTextColor(driver.driver, STRATEGY_YEAR)
  const rivalColor = getDriverTextColor(rival.driver, STRATEGY_YEAR)

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1.5 font-body text-sm">
        <span className="font-semibold" style={{ color: driverColor }}>
          {driver.driver}
        </span>
        <span className="text-fg-4">vs</span>
        <span className="font-semibold" style={{ color: rivalColor }}>
          {rival.driver}
        </span>
      </div>
      <MetricRow
        items={[
          { label: 'Δtyre', value: `${formatSigned(tyreDelta)} laps` },
          { label: 'Δgap', value: formatGapDelta(gapDelta) },
          { label: `${rival.driver} tyre`, value: <CompoundPill compound={rival.compound} /> },
          { label: `${rival.driver} lap`, value: formatLapTime(rival.lap_time_s) },
        ]}
      />
    </Card>
  )
}

export interface SituationStripProps {
  lapState: LapState
  /** Optional rival driver code for the duel row below the strip. */
  rival?: string
}

/** The lap snapshot header: our driver's compound/tyre age/gap/lap time/SC
 *  risk as a row of StatCards, plus an optional rival duel comparison. */
export function SituationStrip({ lapState, rival }: SituationStripProps) {
  const driver = lapState.driver
  const situationQuery = useAgent('situation', lapState, true)
  const scLabel = scProbabilityLabel(situationQuery.data)
  const rivalMatch = rival ? findRival(lapState, rival) : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard eyebrow="Compound" value={<CompoundPill compound={driver.compound} />} />
        <StatCard eyebrow="Tyre age" value={driver.tyre_life} hint="laps" />
        <StatCard eyebrow="Gap ahead" value={formatGap(driver.gap_ahead_s)} />
        <StatCard eyebrow="Last lap" value={formatLapTime(driver.lap_time_s)} />
        <StatCard eyebrow="SC prob (3 laps)" value={scLabel} />
      </div>
      {rivalMatch ? <DuelRow driver={driver} rival={rivalMatch} /> : null}
    </div>
  )
}
