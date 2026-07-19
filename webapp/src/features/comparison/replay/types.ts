// Frozen cross-worker contracts for the Comparison replay engine. buildReplayModel
// produces the ReplayModel (pure, unit-tested); the clock, canvas, channel grid,
// transport and readouts all consume THESE types — nothing imports another
// worker's component. Keep this file free of React and of comparison-specific UI
// so `useReplayClock` + `ReplayTransport` stay reusable seams (spec §5).

import type { ComparisonMetadata } from '@/lib/api/comparison'

/** Track colour mode (spec §7 rank 2). `dominance` = microsector parity. */
export type TrackMode = 'dominance' | 'speed' | 'gain'

/** Replay lifecycle inside a loaded comparison (page adds idle/comparing/error). */
export type ReplayStatus = 'ready' | 'playing' | 'paused' | 'finished'

/** One driver, baked to Float32Arrays with time-domain samplers. All arrays share
 *  the common 500-pt distance grid; `timeAtDistance` is strictly increasing and
 *  scaled to the real lap time (spec §4.1). */
export interface PilotModel {
  code: string
  name: string
  color: string
  lap: number
  lapTime: number
  /** Shared distance grid (m). Float64 — it and timeAtDistance are the sampling
   *  backbone, where Float32's ~1e-5 resolution on lap-scale values would blur. */
  distance: Float64Array
  x: Float32Array
  y: Float32Array
  speed: Float32Array
  throttle: Float32Array
  brake: Float32Array
  /** Cumulative elapsed time (s) at each distance index; strictly increasing. */
  timeAtDistance: Float64Array
  /** Distance travelled at elapsed time `t` (inverse of timeAtDistance, clamped). */
  distanceAtTime(t: number): number
  /** This pilot's racing-line x at elapsed time `t` (for the moving dot / trail). */
  xAtTime(t: number): number
  yAtTime(t: number): number
  /** Largest sample index reached by elapsed time `t` (for trail slicing). */
  indexAtTime(t: number): number
}

/** One drawable centreline segment point[i]→point[i+1], already y-flipped, with
 *  the microsector-dominant colour and the distance at its END (for the
 *  progressive dominance reveal: stroke when endDistance < leader distance). */
export interface TrackSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  endDistance: number
  /** Mean speed across this segment (both pilots avg), for the speed heatmap mode. */
  speed: number
}

/** Bounding box in (already y-flipped) track units. */
export interface TrackBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Static track geometry for the canvas: a faint outline + coloured segments. */
export interface TrackGeometry {
  bounds: TrackBounds
  /** Flat [x0,y0,x1,y1,…] flipped centreline for the grey base ribbon. */
  outline: Float32Array
  segments: TrackSegment[]
}

/** Who was faster over the lap (the result banner's headline). */
export interface WinnerMeta {
  winnerIndex: 0 | 1
  winnerCode: string
  winnerLapTime: number
  loserCode: string
  loserLapTime: number
  /** abs(lapTime1 − lapTime2). */
  gapSeconds: number
}

/** Everything one rendered frame needs — computed once per tick by frameAt. */
export interface ReplayFrame {
  t: number
  /** Pilot physically ahead on track at `t` (greater distance). */
  leaderIndex: 0 | 1
  /** The leader's distance at `t` — where the shared distance-axis cursor sits. */
  leaderDistance: number
  /** On-track time separation (s): how long until the trailing car reaches the
   *  leader's current distance. 0 at the start and at the very end. */
  gapSeconds: number
  /** On-track distance separation (m). */
  separationMeters: number
}

/** The immutable, memoized replay model. Pure product of the compare payload. */
export interface ReplayModel {
  /** max(lapTime1, lapTime2) — the faster car parks while the slower finishes. */
  duration: number
  /** Shared distance grid (m). */
  distance: Float64Array
  pilots: [PilotModel, PilotModel]
  /** Speed-integrated, lap-time-scaled delta; + = pilot1 slower (spec §6). */
  delta: Float64Array
  circuit: TrackGeometry
  /** Microsectors won: [pilot1, pilot2]. Sums to nMicrosectors. */
  microsectorTally: [number, number]
  nMicrosectors: number
  winner: WinnerMeta
  metadata: ComparisonMetadata
  /** Times (s) of sector boundaries for scrubber ticks. Placeholder 25/50/75% of
   *  duration when official splits are absent (spec §4.6). */
  sectorTimes: number[]
  /** Resolve the render frame at elapsed time `t`. */
  frameAt(t: number): ReplayFrame
}

// ── The clock seam (worker E implements the hook returning this) ─────────────

/** Imperative one-clock transport. Playhead time lives in a ref (never React
 *  state); `subscribe` fires every rAF frame. Reusable — no comparison types. */
export interface ReplayClock {
  play(): void
  pause(): void
  toggle(): void
  /** Absolute seek, clamped to [0, duration]; stays playing if it was playing. */
  seek(t: number): void
  /** Relative seek (seek(now + dt)). */
  nudge(dt: number): void
  /** seek(0) then play. */
  restart(): void
  /** Register a per-frame callback; returns an unsubscribe. Fires on seek too. */
  subscribe(cb: (t: number) => void): () => void
  /** Current playhead time (read from the ref; cheap). */
  getTime(): number
  isPlaying(): boolean
}
