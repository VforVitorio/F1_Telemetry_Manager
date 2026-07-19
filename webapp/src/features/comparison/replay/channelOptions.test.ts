// Pure-function tests for the channel grid's ECharts option builders. No
// ECharts instance, no React, no canvas — just asserting the shape of the
// plain objects channelOptions.ts returns (spec §4.5's whole point: these
// options are built once and never touched imperatively again).

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

  it('has one named delta line (with a dashed y=0 markLine) + two sign fills', () => {
    const series = buildDeltaOption(model).series as LineSeriesOption[]
    expect(series).toHaveLength(3)
    const line = series.find((s) => s.name === 'Δ')
    expect(line?.markLine?.data).toEqual([{ yAxis: 0 }])
    // The line carries an explicit colour so it never depends on a visualMap
    // (which silently dropped the whole series in the browser).
    expect(line?.lineStyle?.color).toBeTruthy()
  })

  it('tints each sign region by the driver AHEAD there, not the one falling behind', () => {
    // delta[i] > 0 means pilot1 is SLOWER, i.e. pilot2 is ahead — so the
    // positive fill must carry pilot2's colour and the negative fill
    // pilot1's (the original build had this inverted: it tinted the
    // positive/pilot1-slower region in pilot1's OWN colour, glowing the
    // losing driver's hue — Fable UI audit, P1).
    const fills = (buildDeltaOption(model, 'dark').series as LineSeriesOption[]).filter(
      (s) => !s.name,
    )
    expect(fills).toHaveLength(2)
    const [positiveFill, negativeFill] = fills as [LineSeriesOption, LineSeriesOption]

    // Fills clamp to one sign each: positive fill never dips below 0, negative
    // fill never rises above 0.
    const positiveData = positiveFill.data as Array<[number, number]>
    const negativeData = negativeFill.data as Array<[number, number]>
    expect(positiveData.every(([, v]) => v >= 0)).toBe(true)
    expect(negativeData.every(([, v]) => v <= 0)).toBe(true)

    expect(positiveFill.areaStyle?.color).toBe(resolvePilotColor(PILOT_2_COLOR, 'dark'))
    expect(negativeFill.areaStyle?.color).toBe(resolvePilotColor(PILOT_1_COLOR, 'dark'))
  })

  it('paints the sign fills without an entrance animation, so they never look truncated mid-sweep', () => {
    const fills = (buildDeltaOption(model).series as LineSeriesOption[]).filter((s) => !s.name)
    for (const fill of fills) expect(fill.animation).toBe(false)
  })

  it('uses a neutral (non-accent-purple) colour for the delta curve itself', () => {
    const line = (buildDeltaOption(model).series as LineSeriesOption[]).find((s) => s.name === 'Δ')
    expect(line?.lineStyle?.color).not.toBe('#6c5ce7')
  })

  it('tooltip names the driver AHEAD (team-coloured) + gap at 3dp, ignoring the raw fill series', () => {
    const option = buildDeltaOption(model)
    const tooltip = option.tooltip as { formatter?: (params: unknown) => string }
    const formatter = tooltip.formatter as (params: unknown) => string
    // delta > 0 ⇒ pilot1 slower ⇒ pilot2 (LEC) ahead. The unnamed sign fills
    // arrive as "series0"/"series1" on the axis trigger and must NOT leak.
    const html = formatter([
      { seriesName: 'series0', value: [0, 0.831] },
      { seriesName: 'series1', value: [0, 0] },
      { seriesName: 'Δ', value: [0, 0.831] },
    ])
    expect(html).toContain('LEC') // the driver ahead is named
    expect(html).toContain('0.831') // gap at 3dp
    expect(html).not.toContain('series0')
    expect(html).not.toContain('series1')
  })

  it('tooltip says "Level" when the two cars are within a few thousandths', () => {
    const option = buildDeltaOption(model)
    const formatter = (option.tooltip as { formatter: (p: unknown) => string }).formatter
    expect(formatter([{ seriesName: 'Δ', value: [0, 0.001] }])).toContain('Level')
  })
})

describe('channelOptions.ts never calls ECharts imperatively', () => {
  it('makes no `.setOption(`/`.dispatchAction(` CALL in the source (spec §4.5)', () => {
    // Match method CALLS, not the words in prose — the module's own docstring
    // explains that it never calls setOption, so a bare word match self-trips.
    expect(channelOptionsSource).not.toMatch(/\.(setOption|dispatchAction)\s*\(/)
  })
})
