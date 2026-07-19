// Pure-function tests for the channel grid's ECharts option builders. No
// ECharts instance, no React, no canvas — just asserting the shape of the
// plain objects channelOptions.ts returns. These options are built once and
// never touched imperatively again, which the final test pins.

import type { LineSeriesOption } from 'echarts'
import { describe, expect, it } from 'vitest'
import { resolvePilotColor } from '@/lib/drivers'
import { buildDeltaOption, buildLineOption } from './channelOptions'
// Vite `?raw`: the module's own source as a string (typed by vite/client) — lets
// the guard below assert on it without node:fs.
import channelOptionsSource from './channelOptions.ts?raw'
import type { PilotModel, ReplayModel } from './types'

const DISTANCE = Float64Array.from([0, 100, 200, 300])
const POINT_COUNT = DISTANCE.length

const PILOT_1_COLOR = '#3671C6'
const PILOT_2_COLOR = '#E8002D'

/** A minimal pilot: only the fields channelOptions.ts actually reads
 *  (code/color/speed/brake/throttle) — no time-domain samplers needed. */
function fakePilot(code: string, color: string, speedBase: number): PilotModel {
  return {
    code,
    name: code,
    color,
    lap: 1,
    lapTime: 90,
    distance: DISTANCE,
    x: new Float32Array(POINT_COUNT),
    y: new Float32Array(POINT_COUNT),
    speed: Float32Array.from({ length: POINT_COUNT }, (_, i) => speedBase + i),
    throttle: Float32Array.from({ length: POINT_COUNT }, () => 80),
    brake: Float32Array.from({ length: POINT_COUNT }, () => 0),
    timeAtDistance: new Float64Array(POINT_COUNT),
    distanceAtTime: () => 0,
    xAtTime: () => 0,
    yAtTime: () => 0,
    indexAtTime: () => 0,
  }
}

/** A minimal ReplayModel: only distance/pilots/delta are read by the option
 *  builders under test — circuit/winner/metadata/frameAt are never touched. */
function fakeModel(): ReplayModel {
  const pilots: [PilotModel, PilotModel] = [
    fakePilot('VER', PILOT_1_COLOR, 200),
    fakePilot('LEC', PILOT_2_COLOR, 190),
  ]
  return {
    duration: 90,
    distance: DISTANCE,
    pilots,
    // VER (pilot1/index0) is the winner, so delta (= pilot1 − pilot2) nets
    // negative and ends at −gapSeconds (VER 1s faster). The oriented delta curve
    // must therefore end at +gapSeconds.
    delta: Float64Array.from([0, -0.2, 0.1, -1]),
    circuit: {
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      outline: new Float32Array(),
      segments: [],
    },
    microsectorTally: [1, 1],
    nMicrosectors: 25,
    winner: {
      winnerIndex: 0,
      winnerCode: 'VER',
      winnerLapTime: 90,
      loserCode: 'LEC',
      loserLapTime: 91,
      gapSeconds: 1,
    },
    metadata: { rotation: 0, aspect_ratio: 1 },
    sectorTimes: [30, 60],
    frameAt: () => ({
      t: 0,
      leaderIndex: 0,
      leaderDistance: 0,
      gapSeconds: 0,
      separationMeters: 0,
    }),
  }
}

describe('buildLineOption', () => {
  const model = fakeModel()

  it('returns one line series per pilot, coloured via resolvePilotColor(theme)', () => {
    const series = buildLineOption(model, 'speed', undefined, 'dark').series as LineSeriesOption[]
    expect(series).toHaveLength(2)
    expect(series[0]?.lineStyle).toMatchObject({ color: resolvePilotColor(PILOT_1_COLOR, 'dark') })
    expect(series[1]?.lineStyle).toMatchObject({ color: resolvePilotColor(PILOT_2_COLOR, 'dark') })
  })

  it('carries one [distance, value] point per model sample, for every channel', () => {
    for (const channel of ['speed', 'brake', 'throttle'] as const) {
      const series = buildLineOption(model, channel).series as LineSeriesOption[]
      for (const s of series) expect(s.data).toHaveLength(POINT_COUNT)
    }
  })

  it('shows no in-plot ECharts legend (driver identity moved to ChannelPane header chips)', () => {
    const option = buildLineOption(model, 'speed')
    expect(option.legend).toMatchObject({ show: false })
  })
})

describe('buildDeltaOption', () => {
  const model = fakeModel()
  const FASTER = resolvePilotColor(PILOT_1_COLOR, 'dark') // VER (winner)
  const SLOWER = resolvePilotColor(PILOT_2_COLOR, 'dark') // LEC

  it('draws two team-coloured lines (faster flat baseline + slower deficit curve), no markLine', () => {
    const series = buildDeltaOption(model, 'dark').series as LineSeriesOption[]
    expect(series).toHaveLength(4) // 2 sign fills + faster line + slower line
    for (const s of series) expect(s.markLine).toBeUndefined()

    const fasterLine = series.find((s) => s.name === 'VER')
    const slowerLine = series.find((s) => s.name === 'LEC')
    // Faster = a flat baseline at y=0 in their colour.
    expect(fasterLine?.lineStyle?.color).toBe(FASTER)
    const baseline = fasterLine?.data as Array<[number, number]>
    expect(baseline.every(([, v]) => v === 0)).toBe(true)
    // Slower = the oriented deficit curve in their colour, ending at +gapSeconds.
    expect(slowerLine?.lineStyle?.color).toBe(SLOWER)
    const curve = slowerLine?.data as Array<[number, number]>
    expect(curve[curve.length - 1][1]).toBeCloseTo(model.winner.gapSeconds, 6)
  })

  it('flips the orientation sign when the winner is pilot2 (curve = raw delta)', () => {
    const flipped = fakeModel()
    flipped.delta = Float64Array.from([0, 0.2, -0.1, 1]) // LEC now wins by 1s (pilot1 slower)
    flipped.winner = { ...flipped.winner, winnerIndex: 1, winnerCode: 'LEC', loserCode: 'VER' }
    const series = buildDeltaOption(flipped, 'dark').series as LineSeriesOption[]
    const slowerLine = series.find((s) => s.name === 'VER') // VER is now the slower
    const curve = slowerLine?.data as Array<[number, number]>
    // winnerIndex===1 -> sign +1 -> oriented === raw delta.
    expect(curve[curve.length - 1][1]).toBeCloseTo(1, 6)
  })

  it('tints the two zero-anchored fills by the driver ahead (above 0 = faster, below = slower), no animation', () => {
    const fills = (buildDeltaOption(model, 'dark').series as LineSeriesOption[]).filter(
      (s) => !s.name,
    )
    expect(fills).toHaveLength(2)
    const [positiveFill, negativeFill] = fills as [LineSeriesOption, LineSeriesOption]
    expect((positiveFill.data as Array<[number, number]>).every(([, v]) => v >= 0)).toBe(true)
    expect((negativeFill.data as Array<[number, number]>).every(([, v]) => v <= 0)).toBe(true)
    expect(positiveFill.areaStyle?.color).toBe(FASTER)
    expect(negativeFill.areaStyle?.color).toBe(SLOWER)
    for (const fill of fills) expect(fill.animation).toBe(false)
  })

  it('tooltip names the driver ahead (faster when curve>0, slower when <0), keyed off the slower series', () => {
    const formatter = (
      buildDeltaOption(model, 'dark').tooltip as { formatter: (p: unknown) => string }
    ).formatter
    // curve read off the SLOWER's (LEC) series: +0.3 = slower behind -> VER (faster) ahead.
    const ahead = formatter([{ seriesName: 'LEC', value: [0, 0.3] }])
    expect(ahead).toContain('VER')
    expect(ahead).toContain('0.300')
    // negative -> the slower (LEC) is ahead here.
    expect(formatter([{ seriesName: 'LEC', value: [0, -0.3] }])).toContain('LEC')
  })

  it('tooltip says "Level" only within a thousandth (0.0004), not at a real 0.004 lead', () => {
    const formatter = (
      buildDeltaOption(model, 'dark').tooltip as { formatter: (p: unknown) => string }
    ).formatter
    expect(formatter([{ seriesName: 'LEC', value: [0, 0.0004] }])).toContain('Level')
    expect(formatter([{ seriesName: 'LEC', value: [0, 0.004] }])).not.toContain('Level')
  })
})

describe('channelOptions.ts never calls ECharts imperatively', () => {
  it('makes no `.setOption(`/`.dispatchAction(` CALL in the source', () => {
    // Match method CALLS, not the words in prose — the module's own docstring
    // explains that it never calls setOption, so a bare word match self-trips.
    expect(channelOptionsSource).not.toMatch(/\.(setOption|dispatchAction)\s*\(/)
  })
})
