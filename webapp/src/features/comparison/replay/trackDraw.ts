// Pure canvas-drawing layer for the Comparison TrackCanvas. No React here —
// every function either (a) is a plain, unit-testable predicate/mapper over
// model data, or (b) paints one layer onto a 2D context the caller already
// sized and transformed (see TrackCanvas.tsx). Keeping the two apart means the
// interesting logic (what gets revealed, what colour a segment is, when the
// gap-link shows) is testable without ever touching a canvas.
//
// Coordinate frame: the whole ReplayModel is y-flipped (down = positive, canvas
// convention) — buildReplayModel flips both TrackGeometry (outline/segments) AND
// PilotModel.x/y at build time, so dots/trails and the ribbon share one frame.
// `toPilotPx` is therefore a straight `fit.toPx`, no per-point flip.
//
// Theme: `drawStaticLayer`/`drawDynamicLayer` take a `CanvasTheme` so the base
// ribbon, gap-link and gap label follow light/dark ink instead of a hardcoded
// dark tone that became a near-invisible ghost in light mode. Pilot identity
// colours (dots, trails, gain-mode segment tints, the gap label) additionally
// pass through `resolvePilotColor` so a too-dark team colour is lifted on the
// dark cards — the same helper `channelOptions.ts` uses, so a driver reads with
// equal visual weight whether they're a chart line or a canvas dot.

import type { CanvasFit } from '@/features/dashboard/components/circuitDraw'
import { resolvePilotColor } from '@/lib/drivers'
import type { PilotModel, ReplayFrame, ReplayModel, TrackMode, TrackSegment } from './types'

/** The app's light/dark mode. Kept as a local literal union (not imported from
 *  `useUiStore` or `channelOptions.ts`) so this module stays dependency-free of
 *  React/the store — see the file header. Structurally identical to
 *  `useUiStore`'s `Theme`, so callers can pass either without casting. */
export type CanvasTheme = 'dark' | 'light'

// ── Static ribbon ────────────────────────────────────────────────────────────

/** The faint un-revealed course preview, per theme. Dark keeps the slate tone;
 *  light swaps to ink at a lower alpha, since the dark value sat at ~1.15:1
 *  against a white card. */
const BASE_RIBBON_PALETTE: Record<CanvasTheme, { color: string; alpha: number }> = {
  dark: { color: '#94a3b8', alpha: 0.28 },
  light: { color: '#14121f', alpha: 0.25 },
}
const BASE_RIBBON_WIDTH_PX = 9

// ── Segment reveal / colour modes ───────────────────────────────────────────

const SEGMENT_STROKE_WIDTH_PX = 5

/** Slow end of the speed heatmap — a desaturated blue-grey, deliberately NOT a
 *  saturated identity blue: a blue(slow)->red(fast) ramp would collide with
 *  VER's Red Bull blue and LEC's Ferrari red, so "speed mode" and "dominance
 *  mode" would read as the same thing at a glance. */
const SPEED_COLOR_SLOW = { r: 100, g: 116, b: 139 } // slate-500
/** Fast end of the speed heatmap — amber, clear of both team colours above. */
const SPEED_COLOR_FAST = { r: 245, g: 158, b: 11 } // amber-500

/** Below this local delta-derivative (seconds) a stretch reads as a dead heat.
 *  `gain` mode tints it with `NEUTRAL_GAIN_COLOR` rather than either pilot's
 *  colour — tinting a level stretch with a dominance colour would silently
 *  imply a "winner" on ground that is actually level. */
const GAIN_NEUTRAL_THRESHOLD_S = 1e-3

/** Dead-heat tint for `gain` mode. Deliberately mid-luminance (~0.24) so it
 *  reads on both the dark and light data cards without per-theme resolution —
 *  a genuinely neutral grey, not tuned toward either pilot. */
export const NEUTRAL_GAIN_COLOR = '#7c8798'

// ── Mode-transition sweep (dominance draw-on) ───────────────────────────────

/** Minimum feather width in metres — floors the soft leading edge so a switch
 *  right after the start line (small leaderDistance) doesn't collapse the
 *  sweep into a hard, steppy cut. ~2-3 segment lengths of softness. */
const SWEEP_FEATHER_MIN_M = 30
/** Feather as a fraction of the leader's current distance, floored by
 *  SWEEP_FEATHER_MIN_M above. */
const SWEEP_FEATHER_RATIO = 0.04

// ── Reveal edge (wet-paint highlight) ────────────────────────────────────────

/** A soft white highlight riding the reveal frontier during play: the moment
 *  the leader crosses a segment's end it lights up, then fades back to its
 *  settled colour over the next `windowMeters` of the leader's travel. Reads as
 *  the dominance/speed/gain colour being "painted on" segment by segment.
 *  Window = this fraction of the lap, floored by REVEAL_EDGE_MIN_M. */
const REVEAL_EDGE_RATIO = 0.015
const REVEAL_EDGE_MIN_M = 40
/** Peak highlight opacity right at the frontier, per theme — kept low so it
 *  brightens the fresh segment without washing out its colour. */
const REVEAL_EDGE_MAX_ALPHA: Record<CanvasTheme, number> = { dark: 0.4, light: 0.25 }
/** Extra stroke width at the frontier, tapering to 0 with the highlight — a
 *  touch of swell so the painting edge catches the eye. */
const REVEAL_EDGE_WIDTH_BOOST_PX = 2
const REVEAL_EDGE_COLOR = '#ffffff'

// ── Trails ───────────────────────────────────────────────────────────────────

/** How far back each pilot's racing-line trail extends, in seconds. */
const TRAIL_DURATION_S = 2.5
const TRAIL_WIDTH_PX = 3
const TRAIL_MIN_ALPHA = 0.05
const TRAIL_MAX_ALPHA = 0.5

// ── Dots ─────────────────────────────────────────────────────────────────────

const DOT_RADIUS_PX = 7
const DOT_RING_WIDTH_PX = 2
/** Stays white in BOTH themes — the ring frames the fill, which already
 *  carries the (theme-resolved) team colour + glow; the ring itself never
 *  needs to compete for legibility. */
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
/** Dashed line between the two cars, per theme — the dark value stays; light
 *  swaps to an ink-based tone at the same alpha, since the dark one was
 *  invisible-ish on a white card. */
const GAP_LINK_COLOR: Record<CanvasTheme, string> = {
  dark: 'rgba(226,232,240,0.7)',
  light: 'rgba(20,18,31,0.7)',
}
const GAP_LABEL_FONT_SIZE_PX = 11
const GAP_LABEL_OFFSET_PX = 6
const MONO_FONT_STACK =
  '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

// ── Small numeric helpers ────────────────────────────────────────────────────

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** `p*p*(3−2p)` — eases 0→1 with a soft entry/exit. Used for the mode-switch
 *  alpha crossfade: a raw linear alpha ramp reads as a flash at the start/end,
 *  smoothstep reads as a smooth blend instead. */
function smoothstep(p: number): number {
  return p * p * (3 - 2 * p)
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
 * Maps a speed onto the slow(grey) → fast(amber) heatmap, linearly interpolated
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

/** `1 − (1−p)³` — a fast launch off the start line that settles into the
 *  target distance. Private to `sweepFrontier` below (the dominance draw-on) —
 *  never used or exported on its own. */
function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3
}

/**
 * Where the "dominance draw-on" sweep has reached along the track, in metres —
 * an eased fraction of the leader's OWN (growing) distance, so the frontier can
 * never outrun the leader it's chasing (monotone, no pop, even while playing).
 * `progress` is the raw (un-eased) 0→1 fraction of the transition window; the
 * easing lives here rather than in the caller so it travels with the
 * metre-space math it shapes.
 */
export function sweepFrontier(progress: number, leaderDistance: number): number {
  return easeOutCubic(progress) * leaderDistance
}

/**
 * A segment's alpha during the mode-switch sweep: 0 once fully ahead of the
 * frontier, 1 once fully behind it (already swept), ramping linearly across
 * `feather` metres in between — the soft leading edge that reads as a wipe
 * rather than a hard cut.
 */
export function sweepSegmentAlpha(endDistance: number, frontier: number, feather: number): number {
  return clamp01((frontier - endDistance) / feather)
}

/**
 * How brightly the reveal-edge highlight sits on a segment: 1 the instant the
 * leader crosses its end, fading to 0 over `windowMeters` of leader travel.
 * Squared so the glow concentrates right at the frontier and tapers gently
 * behind it. Returns 0 for a non-positive window (reduced motion, or a
 * degenerate track) so callers can gate the whole highlight on one value.
 */
export function revealEdgeIntensity(
  segmentEndDistance: number,
  leaderDistance: number,
  windowMeters: number,
): number {
  if (windowMeters <= 0) return 0
  const linear = clamp01(1 - (leaderDistance - segmentEndDistance) / windowMeters)
  return linear * linear
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

/** On-track gap-link label: the leader's code + the on-track time gap — e.g.
 *  "LEC ▲ +0.15s" — so the canvas agrees with the transport's own readout
 *  ("● LEC ▲ 0.15s") instead of showing an unattributed "▲ +0.15s". */
export function buildGapLabel(leaderCode: string, gapSeconds: number): string {
  return `${leaderCode} ▲ +${gapSeconds.toFixed(2)}s`
}

export interface GainContext {
  /** `localDeltaGain(model.delta, segmentIndex)` for this segment. */
  localGain: number
  /** Pilot 1/2's RAW team colour — resolved for the theme inside
   *  `pickGainColor`, same as `pickSegmentColor` resolves the dominance
   *  colour, so both branches apply the legibility floor exactly once. */
  pilot1Color: string
  pilot2Color: string
}

function pickGainColor(gain: GainContext, theme: CanvasTheme): string {
  if (Math.abs(gain.localGain) < GAIN_NEUTRAL_THRESHOLD_S) return NEUTRAL_GAIN_COLOR
  const rawColor = gain.localGain > 0 ? gain.pilot2Color : gain.pilot1Color
  return resolvePilotColor(rawColor, theme)
}

/** Resolves one segment's stroke colour for the active track mode: its own
 *  microsector-dominance colour, a speed-heatmap colour, or a tint toward
 *  whichever pilot gained time across it. Dominance and gain both carry pilot
 *  identity, so both pass through `resolvePilotColor` for the given theme
 *  (speed doesn't — its ramp is theme-invariant data colour, not identity). */
export function pickSegmentColor(
  segment: TrackSegment,
  trackMode: TrackMode,
  speedRange: SpeedRange,
  gain: GainContext,
  theme: CanvasTheme,
): string {
  if (trackMode === 'speed') return speedHeatColor(segment.speed, speedRange.min, speedRange.max)
  if (trackMode === 'gain') return pickGainColor(gain, theme)
  return resolvePilotColor(segment.color, theme) // 'dominance'
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

function strokeBaseRibbon(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  fit: CanvasFit,
  theme: CanvasTheme,
): void {
  const outline = model.circuit.outline
  const pointCount = outline.length / 2
  if (pointCount < 2) return

  const { color, alpha } = BASE_RIBBON_PALETTE[theme]
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
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
 *  and whenever `model` or `theme` changes — never on a per-tick basis (the
 *  dynamic layer below owns everything that changes with the playhead). */
export function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  fit: CanvasFit,
  theme: CanvasTheme,
): void {
  clearCanvas(ctx, fit)
  strokeBaseRibbon(ctx, model, fit, theme)
}

/** A short (~220ms plain crossfade / ~400ms dominance sweep) mode-switch beat,
 *  threaded optionally through `drawDynamicLayer` → `drawRevealedSegments`.
 *  Pass 1 repaints the OUTGOING mode (`fromMode`) at full alpha; pass 2 blends
 *  the LIVE mode on top. `progress` is the raw 0→1 fraction of the transition
 *  window — each branch inside `drawRevealedSegments` applies its own easing
 *  (`smoothstep` for a plain crossfade, `sweepFrontier`'s `easeOutCubic` for
 *  the dominance sweep), so easing stays a drawing decision rather than
 *  something the caller has to get right per target mode. */
export interface ModeTransition {
  fromMode: TrackMode
  /** 0→1, raw (un-eased) — see the type-level note above. */
  progress: number
}

/** The raw path stroke for one segment — moveTo/lineTo/stroke in the current
 *  `ctx.strokeStyle`/`lineWidth`. Shared by `strokeSegment` (which sets the
 *  colour first) and the reveal-edge highlight (which re-strokes an
 *  already-coloured segment in white). */
function strokeSegmentPath(
  ctx: CanvasRenderingContext2D,
  segment: TrackSegment,
  fit: CanvasFit,
): void {
  ctx.beginPath()
  const [x1, y1] = fit.toPx(segment.x1, segment.y1)
  const [x2, y2] = fit.toPx(segment.x2, segment.y2)
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** Strokes one revealed segment in the given mode's colour — the shared body
 *  behind the single live pass AND both transition passes, so a colour
 *  decision never has to be written (or drift) three times. Caller owns
 *  `ctx.globalAlpha` before calling this (a uniform crossfade alpha or a
 *  per-segment sweep alpha, depending on the pass). */
function strokeSegment(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  segment: TrackSegment,
  index: number,
  fit: CanvasFit,
  mode: TrackMode,
  speedRange: SpeedRange,
  theme: CanvasTheme,
): void {
  const [pilot1, pilot2] = model.pilots
  const gain: GainContext = {
    localGain: localDeltaGain(model.delta, index),
    pilot1Color: pilot1.color,
    pilot2Color: pilot2.color,
  }
  ctx.strokeStyle = pickSegmentColor(segment, mode, speedRange, gain, theme)
  strokeSegmentPath(ctx, segment, fit)
}

/**
 * The wet-paint highlight: re-strokes the segments just behind the reveal
 * frontier in translucent white, brightest at the leader and fading over
 * `windowMeters`. Walks back from the last revealed segment and stops at the
 * first one the window no longer reaches (segments are distance-ordered, so
 * everything earlier is fainter still). A no-op when `windowMeters <= 0` or
 * nothing is revealed yet. Caller has already painted the settled colours.
 */
function drawRevealEdge(
  ctx: CanvasRenderingContext2D,
  segments: TrackSegment[],
  lastRevealed: number,
  leaderDistance: number,
  windowMeters: number,
  fit: CanvasFit,
  theme: CanvasTheme,
): void {
  if (windowMeters <= 0 || lastRevealed < 0) return
  ctx.save()
  ctx.strokeStyle = REVEAL_EDGE_COLOR
  ctx.lineCap = 'round'
  const maxAlpha = REVEAL_EDGE_MAX_ALPHA[theme]
  for (let i = lastRevealed; i >= 0; i--) {
    const intensity = revealEdgeIntensity(segments[i].endDistance, leaderDistance, windowMeters)
    if (intensity <= 0) break
    ctx.globalAlpha = maxAlpha * intensity
    ctx.lineWidth = SEGMENT_STROKE_WIDTH_PX + REVEAL_EDGE_WIDTH_BOOST_PX * intensity
    strokeSegmentPath(ctx, segments[i], fit)
  }
  ctx.restore()
}

/**
 * Draws the progressive dominance/speed/gain reveal. With no `modeTransition`
 * this is a single pass in the live `trackMode`, followed by the reveal-edge
 * highlight riding the frontier (skipped when `edgeWindowMeters <= 0`, e.g.
 * reduced motion). With a transition it's a two-pass crossfade: pass 1 repaints
 * `fromMode` at full alpha, pass 2 blends the live `trackMode` on top —
 * identical geometry means pass 2 progressively COVERS pass 1, reading as a
 * per-segment colour crossfade with zero hex-string interpolation (both passes
 * reuse `pickSegmentColor` as-is). When the live mode is `dominance`, pass 2
 * becomes the feathered distance-frontier sweep instead of a uniform alpha —
 * switching AWAY from dominance stays a plain crossfade (a reverse-wipe would
 * read as the track emptying, the wrong metaphor). The reveal-edge highlight is
 * skipped mid-transition so the two effects never fight.
 */
function drawRevealedSegments(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  leaderDistance: number,
  fit: CanvasFit,
  trackMode: TrackMode,
  speedRange: SpeedRange,
  theme: CanvasTheme,
  modeTransition?: ModeTransition | null,
  edgeWindowMeters = 0,
): void {
  const segments = model.circuit.segments
  ctx.save()
  ctx.lineWidth = SEGMENT_STROKE_WIDTH_PX
  ctx.lineCap = 'round'

  if (!modeTransition) {
    let lastRevealed = -1
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!isSegmentRevealed(segment, leaderDistance)) continue
      strokeSegment(ctx, model, segment, i, fit, trackMode, speedRange, theme)
      lastRevealed = i
    }
    drawRevealEdge(ctx, segments, lastRevealed, leaderDistance, edgeWindowMeters, fit, theme)
    ctx.restore()
    return
  }

  // Pass 1 — the outgoing mode, full alpha (exactly today's single-pass draw,
  // just with `fromMode` instead of the live mode).
  ctx.globalAlpha = 1
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!isSegmentRevealed(segment, leaderDistance)) continue
    strokeSegment(ctx, model, segment, i, fit, modeTransition.fromMode, speedRange, theme)
  }

  // Pass 2 — the incoming (live) mode, blended on top.
  if (trackMode === 'dominance') {
    const frontier = sweepFrontier(modeTransition.progress, leaderDistance)
    const feather = Math.max(SWEEP_FEATHER_RATIO * leaderDistance, SWEEP_FEATHER_MIN_M)
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!isSegmentRevealed(segment, leaderDistance)) continue
      const alpha = sweepSegmentAlpha(segment.endDistance, frontier, feather)
      if (alpha <= 0) continue // not reached by the sweep yet
      ctx.globalAlpha = alpha
      strokeSegment(ctx, model, segment, i, fit, trackMode, speedRange, theme)
    }
  } else {
    ctx.globalAlpha = smoothstep(modeTransition.progress)
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!isSegmentRevealed(segment, leaderDistance)) continue
      strokeSegment(ctx, model, segment, i, fit, trackMode, speedRange, theme)
    }
  }

  ctx.restore()
}

function drawPilotTrail(
  ctx: CanvasRenderingContext2D,
  pilot: PilotModel,
  t: number,
  fit: CanvasFit,
  color: string,
): void {
  const endIndex = pilot.indexAtTime(t)
  const startIndex = pilot.indexAtTime(Math.max(0, t - TRAIL_DURATION_S))
  const span = endIndex - startIndex
  if (span <= 0) return

  ctx.save()
  ctx.lineWidth = TRAIL_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
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
  pilotColors: [string, string],
): void {
  model.pilots.forEach((pilot, i) => drawPilotTrail(ctx, pilot, t, fit, pilotColors[i]))
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
  pilotColors: [string, string],
): void {
  model.pilots.forEach((pilot, i) => {
    const [px, py] = toPilotPx(fit, pilot.xAtTime(t), pilot.yAtTime(t))
    drawDot(ctx, px, py, pilotColors[i], t, reducedMotion)
  })
}

function drawGapLink(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  frame: ReplayFrame,
  fit: CanvasFit,
  theme: CanvasTheme,
  pilotColors: [string, string],
): void {
  const trackLength = model.distance[model.distance.length - 1]
  if (!shouldShowGapLink(frame.separationMeters, trackLength)) return

  const [pilot1, pilot2] = model.pilots
  const [x1, y1] = toPilotPx(fit, pilot1.xAtTime(frame.t), pilot1.yAtTime(frame.t))
  const [x2, y2] = toPilotPx(fit, pilot2.xAtTime(frame.t), pilot2.yAtTime(frame.t))

  ctx.save()
  ctx.setLineDash(GAP_LINK_DASH)
  ctx.strokeStyle = GAP_LINK_COLOR[theme]
  ctx.lineWidth = GAP_LINK_WIDTH_PX
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const leaderCode = model.pilots[frame.leaderIndex].code
  const label = buildGapLabel(leaderCode, frame.gapSeconds)
  ctx.save()
  ctx.font = `${GAP_LABEL_FONT_SIZE_PX}px ${MONO_FONT_STACK}`
  ctx.fillStyle = pilotColors[frame.leaderIndex] // attributes the label to the leader
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, midX, midY - GAP_LABEL_OFFSET_PX)
  ctx.restore()
}

/** Both pilots' identity colour, resolved once per frame for the given theme —
 *  shared by the dots, the trails, and the gap label so a driver's colour
 *  never drifts between the three. */
function resolvePilotColors(model: ReplayModel, theme: CanvasTheme): [string, string] {
  const [pilot1, pilot2] = model.pilots
  return [resolvePilotColor(pilot1.color, theme), resolvePilotColor(pilot2.color, theme)]
}

/**
 * Clears and repaints everything that changes with the playhead: the
 * progressive dominance/speed/gain reveal, both pilots' recent trails (unless
 * `reducedMotion`), their dots, and the gap-link when they're racing close.
 * `model.frameAt(t)` is resolved exactly once and threaded through every
 * layer below — cheap, but no reason to pay it twice in one frame.
 *
 * `modeTransition` (optional) blends `drawRevealedSegments`'s reveal between
 * two track-colour modes over a short window — see `ModeTransition`. Callers
 * that omit it get the single-pass draw plus the reveal-edge highlight, whose
 * window scales with the lap length (and collapses to nothing under
 * `reducedMotion`, disabling the highlight).
 */
export function drawDynamicLayer(
  ctx: CanvasRenderingContext2D,
  model: ReplayModel,
  t: number,
  fit: CanvasFit,
  trackMode: TrackMode,
  reducedMotion: boolean,
  speedRange: SpeedRange,
  theme: CanvasTheme,
  modeTransition?: ModeTransition | null,
): void {
  clearCanvas(ctx, fit)
  const frame = model.frameAt(t)
  const pilotColors = resolvePilotColors(model, theme)
  const trackLength = model.distance[model.distance.length - 1]
  const edgeWindowMeters = reducedMotion
    ? 0
    : Math.max(REVEAL_EDGE_RATIO * trackLength, REVEAL_EDGE_MIN_M)
  drawRevealedSegments(
    ctx,
    model,
    frame.leaderDistance,
    fit,
    trackMode,
    speedRange,
    theme,
    modeTransition,
    edgeWindowMeters,
  )
  if (!reducedMotion) drawTrails(ctx, model, t, fit, pilotColors)
  drawDots(ctx, model, t, fit, reducedMotion, pilotColors)
  drawGapLink(ctx, model, frame, fit, theme, pilotColors)
}
