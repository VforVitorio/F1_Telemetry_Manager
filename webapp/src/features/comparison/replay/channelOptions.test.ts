// Pure-function tests for the channel grid's ECharts option builders. No
// ECharts instance, no React, no canvas — just asserting the shape of the
// plain objects channelOptions.ts returns (spec §4.5's whole point: these
// options are built once and never touched imperatively again).

import type { LineSeriesOption, PiecewiseVisualMapComponentOption } from 'echarts'
import { describe, expect, it } from 'vitest'
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
    delta: Float64Array.from([0, 0.2, -0.1, 0.3]),
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

  it('returns one line series per pilot, coloured from the payload', () => {
    const series = buildLineOption(model, 'speed').series as LineSeriesOption[]
    expect(series).toHaveLength(2)
    expect(series[0]?.lineStyle).toMatchObject({ color: PILOT_1_COLOR })
    expect(series[1]?.lineStyle).toMatchObject({ color: PILOT_2_COLOR })
  })

  it('carries one [distance, value] point per model sample, for every channel', () => {
    for (const channel of ['speed', 'brake', 'throttle'] as const) {
      const series = buildLineOption(model, channel).series as LineSeriesOption[]
      for (const s of series) expect(s.data).toHaveLength(POINT_COUNT)
    }
  })
})

describe('buildDeltaOption', () => {
  const model = fakeModel()

  it('has exactly one delta series with a dashed y=0 markLine', () => {
    const series = buildDeltaOption(model).series as LineSeriesOption[]
    expect(series).toHaveLength(1)
    expect(series[0]?.markLine?.data).toEqual([{ yAxis: 0 }])
  })

  it('carries a piecewise visualMap referencing both pilot colours', () => {
    const option = buildDeltaOption(model)
    const visualMap = option.visualMap as PiecewiseVisualMapComponentOption
    const pieceColors = visualMap.pieces?.map((piece) => piece.color)
    expect(pieceColors).toContain(PILOT_1_COLOR)
    expect(pieceColors).toContain(PILOT_2_COLOR)
  })
})

describe('channelOptions.ts never calls ECharts imperatively', () => {
  it('makes no `.setOption(`/`.dispatchAction(` CALL in the source (spec §4.5)', () => {
    // Match method CALLS, not the words in prose — the module's own docstring
    // explains that it never calls setOption, so a bare word match self-trips.
    expect(channelOptionsSource).not.toMatch(/\.(setOption|dispatchAction)\s*\(/)
  })
})
