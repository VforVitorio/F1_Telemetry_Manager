import { describe, it, expect } from 'vitest'
import {
  validateStrategySearch,
  applyStrategyPatch,
  fromRaw,
  toRaw,
  analysedLap,
  DEFAULT_RISK,
  type StrategySearch,
} from './search'

describe('validateStrategySearch — cascade + coercion', () => {
  it('drops an orphan driver when no GP is set', () => {
    const out = validateStrategySearch({ driver: 'NOR', rival: 'PIA' })
    expect(out.driver).toBeUndefined()
    expect(out.rival).toBeUndefined()
  })

  it('keeps a driver + rival once a GP is present', () => {
    const out = validateStrategySearch({ gp: 'Hungarian Grand Prix', driver: 'NOR', rival: 'PIA' })
    expect(out).toMatchObject({ gp: 'Hungarian Grand Prix', driver: 'NOR', rival: 'PIA' })
  })

  it('drops a rival equal to the driver (you cannot duel yourself)', () => {
    const out = validateStrategySearch({ gp: 'GP', driver: 'VER', rival: 'VER' })
    expect(out.rival).toBeUndefined()
  })

  it('parses and orders a lap window, dropping it without a driver', () => {
    expect(validateStrategySearch({ gp: 'GP', driver: 'VER', laps: '28-8' }).laps).toBe('8-28')
    expect(validateStrategySearch({ gp: 'GP', laps: '8-28' }).laps).toBeUndefined()
  })

  it('omits risk when absent and clamps it to [0,1] when present', () => {
    expect(validateStrategySearch({}).risk).toBeUndefined()
    expect(validateStrategySearch({ risk: 5 }).risk).toBe(1)
    expect(validateStrategySearch({ risk: -2 }).risk).toBe(0)
  })
})

describe('fromRaw / toRaw — round trip', () => {
  it('round-trips a full scenario', () => {
    const raw = { gp: 'GP', driver: 'NOR', rival: 'PIA', laps: '8-28', risk: 0.55 }
    const search = fromRaw(raw)
    expect(search).toEqual({
      gp: 'GP',
      driver: 'NOR',
      rival: 'PIA',
      laps: [8, 28],
      risk: 0.55,
    })
    expect(toRaw(search)).toEqual(raw)
  })

  it('applies the default risk on the way in and drops it on the way out', () => {
    expect(fromRaw({ gp: 'GP' }).risk).toBe(DEFAULT_RISK)
    expect(toRaw({ gp: 'GP', risk: DEFAULT_RISK }).risk).toBeUndefined()
  })
})

describe('applyStrategyPatch — cascade + no-op identity', () => {
  const base: StrategySearch = {
    gp: 'GP',
    driver: 'NOR',
    rival: 'PIA',
    laps: [8, 28],
    risk: 0.5,
  }

  it('returns the SAME reference when re-picking an unchanged upstream value', () => {
    expect(applyStrategyPatch(base, { gp: 'GP' })).toBe(base)
    expect(applyStrategyPatch(base, { driver: 'NOR' })).toBe(base)
  })

  it('clears driver/rival/laps when the GP changes', () => {
    const next = applyStrategyPatch(base, { gp: 'Other GP' })
    expect(next).toMatchObject({
      gp: 'Other GP',
      driver: undefined,
      rival: undefined,
      laps: undefined,
    })
  })

  it('clears rival/laps but keeps GP when the driver changes', () => {
    const next = applyStrategyPatch(base, { driver: 'VER' })
    expect(next).toMatchObject({ gp: 'GP', driver: 'VER', rival: undefined, laps: undefined })
  })

  it('drops a rival that would equal the new driver', () => {
    const next = applyStrategyPatch({ ...base, rival: 'VER' }, { driver: 'VER' })
    expect(next.rival).toBeUndefined()
  })
})

describe('analysedLap', () => {
  it('is the right edge of the lap window, or undefined', () => {
    expect(analysedLap({ risk: 0.5, laps: [8, 28] })).toBe(28)
    expect(analysedLap({ risk: 0.5 })).toBeUndefined()
  })
})
