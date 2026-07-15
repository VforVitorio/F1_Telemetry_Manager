import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DecisionBanner } from './DecisionBanner'
import { DecisionDetails } from './DecisionDetails'
import type { LapState, StrategyRecommendation } from '@/lib/api/strategy'

// The Decision Banner (hero call + Monte-Carlo evidence) and Decision Details
// (key risks, playbook, reasoning, regulation context) together surface the
// full v2 schema WHILE staying null-tolerant: a no-LLM / degraded run returns
// only action + reasoning + confidence with every other field null/empty, and
// that must read as a shorter brief, never a broken one. These renders (rich
// + sparse) pin that contract across both components — the same contract
// `DecisionCard` used to pin as one combined surface.

const lapState: LapState = {
  lap_number: 30,
  driver: {
    driver: 'VER',
    team: 'Red Bull',
    lap_number: 30,
    lap_time_s: 78.912,
    position: 1,
    compound: 'MEDIUM',
    compound_id: 2,
    tyre_life: 14,
    stint: 2,
    fresh_tyre: false,
    speed_i1: 300,
    speed_i2: 280,
    speed_fl: 320,
    speed_st: 330,
    fuel_load: 40,
    driver_number: 1,
    sector1_s: 25,
    sector2_s: 28,
    sector3_s: 25.9,
    gap_ahead_s: 2.4,
  },
  rivals: [],
  weather: { air_temp: 25, track_temp: 40, humidity: 50, rainfall: 0 },
  session_meta: { gp_name: 'Austin', year: 2025, driver: 'VER', team: 'Red Bull', total_laps: 56 },
}

const richResult: StrategyRecommendation = {
  action: 'PIT_NOW',
  reasoning: 'Tyres are past the cliff; boxing now protects track position.',
  confidence: 0.82,
  pit_lap_target: 31,
  compound_next: 'HARD',
  undercut_target: 'LEC',
  pace_mode: 'PUSH',
  target_lap_time_s: 78.45,
  risk_posture: 'AGGRESSIVE',
  contingencies: [
    {
      trigger: 'Safety car within 3 laps',
      switch_to: 'STAY_OUT',
      priority: 'HIGH',
      rationale: 'Free stop.',
    },
  ],
  key_risks: ['Cliff risk rising in the last three laps'],
  expected_stint_end: 52,
  scenario_scores: {
    PIT_NOW: { E: 0.61, P10: 0.4, P90: 0.8, score: 0.61 },
    STAY_OUT: { E: 0.44, P10: 0.2, P90: 0.6, score: 0.44 },
  },
  regulation_context: 'Article 30.5 governs the mandatory tyre-compound rule.',
}

/** The minimum a degraded / no-LLM run returns: 3 required fields, rest empty. */
const sparseResult: StrategyRecommendation = {
  action: 'STAY_OUT',
  reasoning: 'Hold position; no undercut threat.',
  confidence: 0.5,
  pace_mode: 'NEUTRAL',
  risk_posture: 'BALANCED',
  contingencies: [],
  key_risks: [],
  scenario_scores: {},
  regulation_context: '',
}

describe('DecisionBanner', () => {
  it('surfaces the full hero call when every field is present', () => {
    render(
      <DecisionBanner
        result={richResult}
        lapState={lapState}
        rival="LEC"
        onDownloadJson={vi.fn()}
      />,
    )
    expect(screen.getByText('PIT NOW')).toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByText('PUSH')).toBeInTheDocument()
    expect(screen.getByText(/TARGET 78\.450/)).toBeInTheDocument()
    expect(screen.getByText('AGGRESSIVE')).toBeInTheDocument()
    expect(screen.getByText(/Box lap/)).toBeInTheDocument()
    expect(screen.getByText(/stint ends ~lap 52/)).toBeInTheDocument()
  })

  it('degrades to the minimum hero call when optional fields are absent — no broken sections', () => {
    render(<DecisionBanner result={sparseResult} lapState={lapState} onDownloadJson={vi.fn()} />)
    expect(screen.getByText('STAY OUT')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    // The pit-plan block should not render at all for a sparse result.
    expect(screen.queryByText(/Box lap/)).not.toBeInTheDocument()
    // Never leak literal null/undefined/NaN into the DOM.
    expect(screen.queryByText(/undefined|NaN|null/)).not.toBeInTheDocument()
  })
})

describe('DecisionDetails', () => {
  it('surfaces key risks, the playbook, and both disclosures when present', () => {
    render(<DecisionDetails result={richResult} />)
    expect(screen.getByText('Key risks')).toBeInTheDocument()
    expect(screen.getByText(/Cliff risk rising/)).toBeInTheDocument()
    expect(screen.getByText('Playbook')).toBeInTheDocument()
    expect(screen.getByText("Engineer's note")).toBeInTheDocument()
    expect(screen.getByText('Regulation context')).toBeInTheDocument()
  })

  it('degrades to a shorter brief when optional fields are absent — no broken sections', () => {
    render(<DecisionDetails result={sparseResult} />)
    // `reasoning` is a required field, so the engineer's note still renders.
    expect(screen.getByText("Engineer's note")).toBeInTheDocument()
    // None of the optional sections should render for a sparse result.
    expect(screen.queryByText('Key risks')).not.toBeInTheDocument()
    expect(screen.queryByText('Playbook')).not.toBeInTheDocument()
    expect(screen.queryByText('Regulation context')).not.toBeInTheDocument()
    // Never leak literal null/undefined/NaN into the DOM.
    expect(screen.queryByText(/undefined|NaN|null/)).not.toBeInTheDocument()
  })
})
