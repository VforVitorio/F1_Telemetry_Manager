// Pure canvas-drawing layer for the Comparison TrackCanvas (spec §4.4). No
// React here — every function either (a) is a plain, unit-testable predicate/
// mapper over model data, or (b) paints one layer onto a 2D context the caller
// already sized and transformed (see TrackCanvas.tsx). Keeping the two apart
// means the interesting logic (what gets revealed, what colour a segment is,
// when the gap-link shows) is testable without ever touching a canvas.
//
// Coordinate frame: the whole ReplayModel is y-flipped (down = positive, canvas
// convention) — buildReplayModel flips both TrackGeometry (outline/segments) AND
// PilotModel.x/y at build time, so dots/trails and the ribbon share one frame.
// `toPilotPx` is therefore a straight `fit.toPx`, no per-point flip.

import type { CanvasFit } from '@/features/dashboard/components/circuitDraw'
import type { PilotModel, ReplayFrame, ReplayModel, TrackMode, TrackSegment } from './types'

// ── Static ribbon ────────────────────────────────────────────────────────────

const BASE_RIBBON_COLOR = '#94a3b8'
const BASE_RIBBON_ALPHA = 0.28
const BASE_RIBBON_WIDTH_PX = 9

// ── Segment reveal / colour modes ───────────────────────────────────────────

const SEGMENT_STROKE_WIDTH_PX = 5

/** Slow end of the speed heatmap (blue-500-ish). */
const SPEED_COLOR_SLOW = { r: 59, g: 130, b: 246 }
/** Fast end of the speed heatmap (red-500-ish). */
const SPEED_COLOR_FAST = { r: 239, g: 68, b: 68 }

/** Below this local delta-derivative (seconds) a stretch reads as a dead heat
 *  — not worth tinting toward either pilot, so `gain` mode falls back to the
 *  segment's dominance colour instead of a near-invisible tint. */
const GAIN_NEUTRAL_THRESHOLD_S = 1e-3

// ── Trails ───────────────────────────────────────────────────────────────────

/** How far back each pilot's racing-line trail extends, in seconds. */
const TRAIL_DURATION_S = 2.5
const TRAIL_WIDTH_PX = 3
const TRAIL_MIN_ALPHA = 0.05
const TRAIL_MAX_ALPHA = 0.5

// ── Dots ─────────────────────────────────────────────────────────────────────

const DOT_RADIUS_PX = 7
const DOT_RING_WIDTH_PX = 2
const DOT_RING_COLOR = '#ffffff'
const DOT_GLOW_BLUR_PX = 14
/** Breathing amplitude around DOT_GLOW_BLUR_PX (±35%), not an on/off flicker. */
const DOT_GLOW_PULSE_AMPLITUDE = 0.35
/** Pulse cycles per second — slow enough to read as "alive", not distracting. */
const DOT_GLOW_PULSE_HZ = 0.8

// ── Gap link ─────────────────────────────────────────────────────────────────

/** Show the dashed gap-link once the two cars are within this fraction of the
 *  lap length of each other on track — close enough to read as "side by side". */
const GAP_LINK_THRESHOLD_RATIO = 0.08
const GAP_LINK_DASH: [number, number] = [5, 4]
const GAP_LINK_WIDTH_PX = 1.5
const GAP_LINK_COLOR = 'rgba(226,232,240,0.7)'
const GAP_LABEL_COLOR = '#e2e8f0'
const GAP_LABEL_FONT_SIZE_PX = 11
const GAP_LABEL_OFFSET_PX = 6
const MONO_FONT_STACK =
  '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

// ── Small numeric helpers ────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function toHexByte(value: number): string {
  const byte = Math.round(Math.min(255, Math.max(0, value)))
  return byte.toString(16).padStart(2, '0')
}

// ── Pure helpers (unit-tested in trackDraw.test.ts) ─────────────────────────

export interface SpeedRange {
  min: number
  max: number
}

/**
 * Min/max mean-speed across every track segment — the domain for the speed
 * heatmap colour scale. Segments don't change frame-to-frame, so callers
 * compute this once per model (TrackCanvas memoizes it) instead of re-scanning
 * ~500 segments every tick.
 */
export function computeSpeedRange(segments: TrackSegment[]): SpeedRange {
  if (segments.length === 0) return { min: 0, max: 1 }
  let min = Infinity
  let max = -Infinity
  for (const segment of segments) {
    if (segment.speed < min) min = segment.speed
    if (segment.speed > max) max = segment.speed
  }
  return { min, max }
}

/**
 * Maps a speed onto a blue(slow) → red(fast) heatmap, linearly interpolated
 * per RGB channel across `[min, max]`. A degenerate range (min === max, e.g. a
 * single-segment track) clamps to the slow end rather than dividing by zero.
 */
export function speedHeatColor(speed: number, min: number, max: number): string {
  const range = max - min
  const ratio = range > 0 ? clamp01((speed - min) / range) : 0
  const r = lerp(SPEED_COLOR_SLOW.r, SPEED_COLOR_FAST.r, ratio)
  const g = lerp(SPEED_COLOR_SLOW.g, SPEED_COLOR_FAST.g, ratio)
  const b = lerp(SPEED_COLOR_SLOW.b, SPEED_COLOR_FAST.b, ratio)
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

/** A segment is revealed once the leader has passed its end distance — the
 *  progressive dominance-reveal predicate shared by every track mode (only
 *  the COLOUR differs by mode; visibility is the same everywhere). */
export function isSegmentRevealed(segment: TrackSegment, leaderDistance: number): boolean {
  return segment.endDistance < leaderDistance
}

/**
 * `delta[index+1] − delta[index]`, bounds-clamped — the local (per-segment)
 * derivative of the cumulative delta. Positive ⇒ pilot1 lost time across this
 * stretch (pilot2 gained it); used to tint a segment in `gain` track mode.
 */
export function localDeltaGain(delta: Float64Array, index: number): number {
  const last = delta.length - 1
  const from = Math.min(Math.max(index, 0), last)
  const to = Math.min(from + 1, last)
  return delta[to] - delta[from]
}

/** Draw the dashed gap-link once the two cars are within `GAP_LINK_THRESHOLD_RATIO`
 *  of the lap length of each other. */
export function shouldShowGapLink(separationMeters: number, trackLengthMeters: number): boolean {
  return separationMeters < GAP_LINK_THRESHOLD_RATIO * trackLengthMeters
}

export interface GainContext {
  /** `localDeltaGain(model.delta, segmentIndex)` for this segment. */
  localGain: number
  pilot1Color: string
  pilot2Color: string
}

function pickGainColor(gain: GainContext, fallbackColor: string): string {
  if (Math.abs(gain.localGain) < GAIN_NEUTRAL_THRESHOLD_S) return fallbackColor
  return gain.localGain > 0 ? gain.pilot2Color : gain.pilot1Color
}

/** Resolves one segment's stroke colour for the active track mode: its own
 *  microsector-dominance colour, a speed-heatmap colour, or a tint toward
 *  whichever pilot gained time across it. */
export function pickSegmentColor(
  segment: TrackSegment,
  trackMode: TrackMode,
  speedRange: SpeedRange,
  gain: GainContext,
): string {
  if (trackMode === 'speed') return speedHeatColor(segment.speed, speedRange.min, speedRange.max)
  if (trackMode === 'gain') return pickGainColor(gain, segment.color)
  return segment.color // 'dominance'
}

// ── Canvas drawing (not unit-tested — see trackDraw.test.ts header) ─────────

/**
 * Map a pilot coordinate to a pixel. PilotModel.x/y are already in the same
 * y-flipped frame as TrackGeometry (buildReplayModel flips pilot y at build
 * time), so this is a straight `fit.toPx` — no per-point flip needed.
 */
function toPilotPx(fit: CanvasFit, x: number, y: number): [number, number] {
  return fit.toPx(x, y)
}

function clearCanvas(ctx: CanvasRenderingContext2D, fit: CanvasFit): void {
  const cssWidth = ctx.canvas.width / fit.dpr
  const cssHeight = ctx.canvas.height / fit.dpr
  ctx.clearRect(0, 0, cssWidth, cssHeight)
}

function strokeBaseRibbon(ctx: CanvasRenderingContext2D, model: ReplayModel, fit: CanvasFit): void {
  const outline = model.circuit.outline
  const pointCount = outline.length / 2
  if (pointCount < 2) return

  ctx.save()
  ctx.globalAlpha = BASE_RIBBON_ALPHA
  ctx.strokeStyle = BASE_RIBBON_COLOR
  ctx.lineWidth = BASE_RIBBON_WIDTH_PX
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const [startX, startY] = fit.toPx(outline[0], outline[1])
  ctx.moveTo(startX, startY)
  for (let i = 1; i < pointCount; i++) {
    const [x, y] = fit.toPx(outline[i * 2], outline[i * 2 + 1])
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Clears and repaints the faint grey base ribbon. Called on mount, resize,
 *  and whenever `model` changes — never on a per-tick basis (the dynamic
 *  layer below owns everything that changes with the playhead). */
export function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  fit: CanvasFit,
): void {
  clearCanvas(ctx, fit)
  strokeBaseRibbon(ctx, model, fit)
}

function drawRevealedSegments(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  leaderDistance: number,
  fit: CanvasFit,
  trackMode: TrackMode,
  speedRange: SpeedRange,
): void {
  const segments = model.circuit.segments
  const [pilot1, pilot2] = model.pilots
  ctx.save()
  ctx.lineWidth = SEGMENT_STROKE_WIDTH_PX
  ctx.lineCap = 'round'
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!isSegmentRevealed(segment, leaderDistance)) continue
    const gain: GainContext = {
      localGain: localDeltaGain(model.delta, i),
      pilot1Color: pilot1.color,
      pilot2Color: pilot2.color,
    }
    ctx.strokeStyle = pickSegmentColor(segment, trackMode, speedRange, gain)
    ctx.beginPath()
    const [x1, y1] = fit.toPx(segment.x1, segment.y1)
    const [x2, y2] = fit.toPx(segment.x2, segment.y2)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawPilotTrail(
  ctx: CanvasRenderingContext2D,
  pilot: PilotModel,
  t: number,
  fit: CanvasFit,
): void {
  const endIndex = pilot.indexAtTime(t)
  const startIndex = pilot.indexAtTime(Math.max(0, t - TRAIL_DURATION_S))
  const span = endIndex - startIndex
  if (span <= 0) return

  ctx.save()
  ctx.lineWidth = TRAIL_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.strokeStyle = pilot.color
  for (let i = startIndex; i < endIndex; i++) {
    const progress = (i - startIndex) / span // 0 at the tail, ~1 at the dot
    ctx.globalAlpha = lerp(TRAIL_MIN_ALPHA, TRAIL_MAX_ALPHA, progress)
    ctx.beginPath()
    const [x1, y1] = toPilotPx(fit, pilot.x[i], pilot.y[i])
    const [x2, y2] = toPilotPx(fit, pilot.x[i + 1], pilot.y[i + 1])
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawTrails(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  t: number,
  fit: CanvasFit,
): void {
  for (const pilot of model.pilots) drawPilotTrail(ctx, pilot, t, fit)
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  t: number,
  reducedMotion: boolean,
): void {
  ctx.save()
  if (!reducedMotion) {
    const pulse = 1 + DOT_GLOW_PULSE_AMPLITUDE * Math.sin(t * DOT_GLOW_PULSE_HZ * Math.PI * 2)
    ctx.shadowColor = color
    ctx.shadowBlur = DOT_GLOW_BLUR_PX * pulse
  }
  ctx.beginPath()
  ctx.arc(px, py, DOT_RADIUS_PX, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.shadowBlur = 0 // keep the ring crisp — only the fill glows
  ctx.lineWidth = DOT_RING_WIDTH_PX
  ctx.strokeStyle = DOT_RING_COLOR
  ctx.stroke()
  ctx.restore()
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  t: number,
  fit: CanvasFit,
  reducedMotion: boolean,
): void {
  for (const pilot of model.pilots) {
    const [px, py] = toPilotPx(fit, pilot.xAtTime(t), pilot.yAtTime(t))
    drawDot(ctx, px, py, pilot.color, t, reducedMotion)
  }
}

function drawGapLink(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  frame: ReplayFrame,
  fit: CanvasFit,
): void {
  const trackLength = model.distance[model.distance.length - 1]
  if (!shouldShowGapLink(frame.separationMeters, trackLength)) return

  const [pilot1, pilot2] = model.pilots
  const [x1, y1] = toPilotPx(fit, pilot1.xAtTime(frame.t), pilot1.yAtTime(frame.t))
  const [x2, y2] = toPilotPx(fit, pilot2.xAtTime(frame.t), pilot2.yAtTime(frame.t))

  ctx.save()
  ctx.setLineDash(GAP_LINK_DASH)
  ctx.strokeStyle = GAP_LINK_COLOR
  ctx.lineWidth = GAP_LINK_WIDTH_PX
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const label = `▲ +${frame.gapSeconds.toFixed(2)}s`
  ctx.save()
  ctx.font = `${GAP_LABEL_FONT_SIZE_PX}px ${MONO_FONT_STACK}`
  ctx.fillStyle = GAP_LABEL_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, midX, midY - GAP_LABEL_OFFSET_PX)
  ctx.restore()
}

/**
 * Clears and repaints everything that changes with the playhead: the
 * progressive dominance/speed/gain reveal, both pilots' recent trails (unless
 * `reducedMotion`), their dots, and the gap-link when they're racing close.
 * `model.frameAt(t)` is resolved exactly once and threaded through every
 * layer below — cheap, but no reason to pay it twice in one frame.
 */
export function drawDynamicLayer(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  t: number,
  fit: CanvasFit,
  trackMode: TrackMode,
  reducedMotion: boolean,
  speedRange: SpeedRange,
): void {
  clearCanvas(ctx, fit)
  const frame = model.frameAt(t)
  drawRevealedSegments(ctx, model, frame.leaderDistance, fit, trackMode, speedRange)
  if (!reducedMotion) drawTrails(ctx, model, t, fit)
  drawDots(ctx, model, t, fit, reducedMotion)
  drawGapLink(ctx, model, frame, fit)
}
