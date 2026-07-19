// buildReplayModel — the PURE, memoized heart of the Comparison replay. Turns a
// compare payload into the ReplayModel (baked Float32 channels, per-driver
// time-domain samplers, delta, track geometry, winner) the whole replay renders
// from. No React, no DOM, no allocation in the per-frame samplers → unit-testable
// against a Python golden fixture (buildReplayModel.test.ts, spec §6).
//
// The two ported bits of thesis-validated maths (both from
// comparison_service.py) and their SIGN/UNIT contracts:
//   1. Per-driver time synthesis (spec §4.1): tᵢ[k] = Σ Δd/(vᵢ/3.6), then scale
//      so tᵢ[last] == real lap_time. Units: v is km/h → ÷3.6 = m/s; Δd in m.
//   2. Delta (calculate_delta_time): cumsum(t1−t2) scaled by (lap_time1−lap_time2).
//      POSITIVE = pilot1 SLOWER (the backend docstring is wrong; the math and
//      spec §6 agree on this sign). We recompute it here so the golden test pins
//      the port to the backend output to 1e-6 — the app then uses this value.

import { interp } from '@/lib/interp'
import { flipY } from '@/features/dashboard/components/circuitDraw'
import type { ComparisonPayload } from '@/lib/api/comparison'
import type {
  PilotModel,
  ReplayFrame,
  ReplayModel,
  TrackBounds,
  TrackGeometry,
  TrackSegment,
  WinnerMeta,
} from './types'

/** Same epsilon the backend uses to avoid /0 on a stopped car (speed→0). */
const EPS = 1e-6
/** Microsectors the backend divides the lap into (comparison_service default). */
const N_MICROSECTORS = 25

function toF32(a: number[]): Float32Array {
  return Float32Array.from(a)
}

function toF64(a: number[]): Float64Array {
  return Float64Array.from(a)
}

/**
 * Per-driver cumulative elapsed time on the distance grid, scaled to the real
 * lap time (spec §4.1). Strictly increasing for a monotone distance grid with
 * positive speeds. Returns a length-N array (t[0] = 0, t[last] = lapTime).
 * Float64 — cumulative + lap-scale, so Float32 rounding (~1e-5 s) would show up.
 */
function synthesizeTime(distance: number[], speed: number[], lapTime: number): Float64Array {
  const n = distance.length
  const t = new Float64Array(n)
  let acc = 0
  for (let i = 1; i < n; i++) {
    const dd = distance[i] - distance[i - 1]
    const v = speed[i - 1] / 3.6 + EPS // km/h → m/s, guarded like the backend
    acc += dd / v
    t[i] = acc
  }
  const raw = t[n - 1]
  if (raw > EPS && lapTime) {
    const scale = lapTime / raw
    for (let i = 0; i < n; i++) t[i] *= scale
  }
  return t
}

/**
 * Time delta between the two drivers on the shared grid — TS port of
 * calculate_delta_time. `delta[i] > 0` ⇒ pilot1 slower up to point i. Scaled so
 * `delta[last]` equals the real lap-time gap (lap_time1 − lap_time2).
 */
function computeDelta(
  distance: number[],
  speed1: number[],
  speed2: number[],
  lapTime1: number,
  lapTime2: number,
): Float64Array {
  const n = distance.length
  const delta = new Float64Array(n)
  let acc = 0
  for (let i = 1; i < n; i++) {
    const dd = distance[i] - distance[i - 1]
    const t1 = dd / (speed1[i - 1] / 3.6 + EPS)
    const t2 = dd / (speed2[i - 1] / 3.6 + EPS)
    acc += t1 - t2
    delta[i] = acc
  }
  const rawFinal = delta[n - 1]
  const realDelta = lapTime1 - lapTime2
  if (Math.abs(rawFinal) > EPS) {
    const scale = realDelta / rawFinal
    for (let i = 0; i < n; i++) delta[i] *= scale
  } else {
    // Degenerate (identical speeds): spread the real gap linearly, like numpy's
    // np.linspace(0, real_delta, n) fallback.
    for (let i = 0; i < n; i++) delta[i] = (realDelta * i) / (n - 1)
  }
  return delta
}

/** Build one pilot's baked model with its time-domain samplers. */
function buildPilot(raw: ComparisonPayload['pilot1'], sharedDistance: Float64Array): PilotModel {
  const distance = sharedDistance
  const x = toF32(raw.x)
  // Flip y into the SAME frame as the track geometry (outline/segments are
  // y-flipped for canvas drawing). Keeping the whole model in one coordinate
  // frame means every consumer — dots, trails, a future ghost dot — aligns with
  // the ribbon without re-flipping. x is not flipped (track flips y only).
  const y = Float32Array.from(raw.y, flipY)
  const speed = toF32(raw.speed)
  const throttle = toF32(raw.throttle)
  const brake = toF32(raw.brake)
  const timeAtDistance = synthesizeTime(raw.distance, raw.speed, raw.lap_time)

  const distanceAtTime = (t: number): number => interp(t, timeAtDistance, distance)
  const xAtTime = (t: number): number => interp(distanceAtTime(t), distance, x)
  const yAtTime = (t: number): number => interp(distanceAtTime(t), distance, y)
  const indexAtTime = (t: number): number => {
    // Largest index whose reach-time ≤ t (binary search on the increasing array).
    const last = timeAtDistance.length - 1
    if (t <= timeAtDistance[0]) return 0
    if (t >= timeAtDistance[last]) return last
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (timeAtDistance[mid] <= t) lo = mid
      else hi = mid
    }
    return lo
  }

  return {
    code: raw.name,
    name: raw.name,
    color: raw.color,
    lap: raw.lap,
    lapTime: raw.lap_time,
    distance,
    x,
    y,
    speed,
    throttle,
    brake,
    timeAtDistance,
    distanceAtTime,
    xAtTime,
    yAtTime,
    indexAtTime,
  }
}

/** Flatten the averaged centreline into a flipped [x0,y0,x1,y1,…] outline. */
function buildOutline(cx: number[], cy: number[]): Float32Array {
  const n = Math.min(cx.length, cy.length)
  const flat = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    flat[i * 2] = cx[i]
    flat[i * 2 + 1] = flipY(cy[i])
  }
  return flat
}

/** One coloured segment per centreline edge, carrying its END distance (for the
 *  dominance reveal) and its mean speed (for the speed heatmap mode). */
function buildSegments(
  cx: number[],
  cy: number[],
  colors: string[],
  distance: number[],
  speed1: number[],
  speed2: number[],
): TrackSegment[] {
  const n = Math.min(cx.length, cy.length) - 1
  const segments: TrackSegment[] = []
  for (let i = 0; i < n; i++) {
    segments.push({
      x1: cx[i],
      y1: flipY(cy[i]),
      x2: cx[i + 1],
      y2: flipY(cy[i + 1]),
      color: colors[i] ?? '#94a3b8',
      endDistance: distance[i + 1],
      speed: (speed1[i] + speed2[i]) / 2,
    })
  }
  return segments
}

/** Bounding box of the flipped outline (degenerate-safe). */
function outlineBounds(outline: Float32Array): TrackBounds {
  if (outline.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < outline.length; i += 2) {
    const px = outline[i]
    const py = outline[i + 1]
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }
  return { minX, maxX, minY, maxY }
}

/** Count microsectors each driver won, sampling one colour per sector exactly as
 *  the backend sectorises (points_per_sector = floor(n / 25)). */
function microsectorTally(colors: string[], color1: string): [number, number] {
  const n = colors.length
  if (n === 0) return [0, 0]
  const perSector = Math.max(1, Math.floor(n / N_MICROSECTORS))
  let p1 = 0
  let p2 = 0
  for (let s = 0; s < N_MICROSECTORS; s++) {
    const idx = Math.min(s * perSector, n - 1)
    if (colors[idx] === color1) p1++
    else p2++
  }
  return [p1, p2]
}

function buildWinner(p1: PilotModel, p2: PilotModel): WinnerMeta {
  const oneFaster = p1.lapTime <= p2.lapTime
  const [win, lose] = oneFaster ? [p1, p2] : [p2, p1]
  return {
    winnerIndex: oneFaster ? 0 : 1,
    winnerCode: win.code,
    winnerLapTime: win.lapTime,
    loserCode: lose.code,
    loserLapTime: lose.lapTime,
    gapSeconds: Math.abs(p1.lapTime - p2.lapTime),
  }
}

/**
 * Build the immutable replay model from a compare payload. Pure — safe to
 * memoize on the payload identity (queries.ts keeps the payload immutable).
 */
export function buildReplayModel(payload: ComparisonPayload): ReplayModel {
  const { pilot1, pilot2, circuit, metadata } = payload
  const sharedDistance = toF64(pilot1.distance)

  const p1 = buildPilot(pilot1, sharedDistance)
  const p2 = buildPilot(pilot2, sharedDistance)
  const pilots: [PilotModel, PilotModel] = [p1, p2]

  const delta = computeDelta(
    pilot1.distance,
    pilot1.speed,
    pilot2.speed,
    pilot1.lap_time,
    pilot2.lap_time,
  )

  const outline = buildOutline(circuit.x, circuit.y)
  const geometry: TrackGeometry = {
    bounds: outlineBounds(outline),
    outline,
    segments: buildSegments(
      circuit.x,
      circuit.y,
      circuit.colors,
      pilot1.distance,
      pilot1.speed,
      pilot2.speed,
    ),
  }

  const duration = Math.max(p1.lapTime, p2.lapTime)
  const sectorTimes = [duration / 3, (2 * duration) / 3]

  const frameAt = (t: number): ReplayFrame => {
    const d1 = p1.distanceAtTime(t)
    const d2 = p2.distanceAtTime(t)
    const leaderIndex: 0 | 1 = d1 >= d2 ? 0 : 1
    const leaderDistance = leaderIndex === 0 ? d1 : d2
    const trailing = leaderIndex === 0 ? p2 : p1
    // When does the trailing car reach the leader's current distance? That time
    // minus now is the on-track time gap (≥ 0; 0 at the start and the finish).
    const tTrailingHere = interp(leaderDistance, trailing.distance, trailing.timeAtDistance)
    return {
      t,
      leaderIndex,
      leaderDistance,
      gapSeconds: Math.max(0, tTrailingHere - t),
      separationMeters: Math.abs(d1 - d2),
    }
  }

  return {
    duration,
    distance: sharedDistance,
    pilots,
    delta,
    circuit: geometry,
    microsectorTally: microsectorTally(circuit.colors, pilot1.color),
    nMicrosectors: N_MICROSECTORS,
    winner: buildWinner(p1, p2),
    metadata,
    sectorTimes,
    frameAt,
  }
}
