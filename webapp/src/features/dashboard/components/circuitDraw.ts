// Pure geometry helpers for the Circuit Domination map. The backend already
// did all the hard work (rotation, scaling, per-microsector dominant driver);
// these functions only turn its raw x/y/colors arrays into something an SVG
// can draw without distorting the track shape.
//
// Two things an SVG needs help with that the backend data doesn't provide:
//  1. Aspect-ratio lock — track x/y are in real-world units (metres), and a
//     naive "fit width x fit height" would stretch the circuit. Mirrors
//     Plotly's `scaleanchor="y"` / matplotlib's `axis('equal')` from the
//     original Streamlit chart (circuit_domination.py::_create_circuit_figure).
//  2. Y-flip — track y is mathematical (up = positive), SVG y grows downward,
//     so plotting raw y values renders the track upside down.

/** Bounding box of a coordinate list, in track units. */
export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** One drawable segment: point[i] -> point[i+1], coloured by that
 *  microsector's dominant driver. Coordinates are already y-flipped. */
export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/** Extra room around the track so segments near the edge aren't clipped by
 *  the viewBox, as a fraction of each axis's range. */
const VIEWBOX_PADDING_RATIO = 0.06

/** Fallback stroke colour for a segment whose driver colour is missing,
 *  matching the neutral grey used elsewhere for "no data". */
const FALLBACK_SEGMENT_COLOR = '#94a3b8'

/**
 * Bounding box of the track's x/y coordinates.
 * Falls back to a degenerate 0..1 box for empty input so downstream ratio
 * math (division by range) never divides by zero.
 */
export function computeBounds(x: number[], y: number[]): Bounds {
  if (x.length === 0 || y.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  }
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minY: Math.min(...y),
    maxY: Math.max(...y),
  }
}

/** Flip track y (mathematical, up = positive) to SVG-local y (down = positive). */
export function flipY(y: number): number {
  return -y
}

/**
 * SVG `viewBox` string ("minX minY width height") for the given bounds, with
 * padding. Locking the aspect ratio to the track's own width/height and
 * relying on SVG's default `preserveAspectRatio="xMidYMid meet"` is what
 * fits + centers the track without distortion, no manual pixel scaling
 * needed on the component side.
 */
export function computeViewBox(bounds: Bounds): string {
  const rangeX = Math.max(bounds.maxX - bounds.minX, 1e-6)
  const rangeY = Math.max(bounds.maxY - bounds.minY, 1e-6)
  const padX = rangeX * VIEWBOX_PADDING_RATIO
  const padY = rangeY * VIEWBOX_PADDING_RATIO

  // After the y-flip, the track's old maxY becomes the new (smaller) minY.
  const flippedMinY = flipY(bounds.maxY)
  const minX = bounds.minX - padX
  const minY = flippedMinY - padY
  const width = rangeX + 2 * padX
  const height = rangeY + 2 * padY

  return `${minX} ${minY} ${width} ${height}`
}

/**
 * Builds the SVG `points` attribute for a `<polyline>` tracing every track
 * coordinate in order (y-flipped, same convention as `buildSegments`). Drawn
 * once as a faint continuous outline underneath the coloured microsector
 * segments, so gaps between segments (there is no line between the last
 * point of one microsector and the first of the next) don't read as a
 * broken track.
 */
export function buildOutlinePath(x: number[], y: number[]): string {
  const pointCount = Math.min(x.length, y.length)
  const points: string[] = []
  for (let i = 0; i < pointCount; i++) {
    points.push(`${x[i]},${flipY(y[i])}`)
  }
  return points.join(' ')
}

/**
 * Builds one line segment per consecutive coordinate pair, each carrying the
 * colour of the driver who dominated that microsector. `colors[i]` paints
 * the segment from `point[i]` to `point[i+1]` (so `colors.length === x.length - 1`
 * on well-formed data); a mismatched length is tolerated defensively.
 */
export function buildSegments(x: number[], y: number[], colors: string[]): Segment[] {
  const segmentCount = Math.min(x.length, y.length) - 1
  const segments: Segment[] = []
  for (let i = 0; i < segmentCount; i++) {
    segments.push({
      x1: x[i],
      y1: flipY(y[i]),
      x2: x[i + 1],
      y2: flipY(y[i + 1]),
      color: colors[i] ?? FALLBACK_SEGMENT_COLOR,
    })
  }
  return segments
}

// ── Canvas fit (issue #36 Comparison TrackCanvas) ────────────────────────────
// The SVG path above relies on the browser's `viewBox` to fit + centre without
// distortion. A <canvas> has no viewBox, so the TrackCanvas needs the same
// aspect-locked track-units→pixel mapping computed explicitly. `fitCanvas`
// returns that transform plus a capped device-pixel ratio (retina sharpness
// without the 3-4× fill cost of a high-DPR phone).

/** Aspect-locked mapping from (already y-flipped) track units to CSS pixels. */
export interface CanvasFit {
  /** Uniform scale (px per track unit) — same on both axes so the track keeps shape. */
  scale: number
  offsetX: number
  offsetY: number
  /** Device-pixel ratio to render at (capped). */
  dpr: number
  /** Map a track-unit point to a CSS-pixel point. */
  toPx: (x: number, y: number) => [number, number]
}

const FIT_PADDING_RATIO = 0.06
const MAX_DPR = 2

/**
 * Fit a track's flipped bounds into a `cssWidth × cssHeight` canvas with the
 * aspect ratio locked (no stretch) and a small margin, centred. `devicePixelRatio`
 * is read from the environment and capped at 2. Degenerate bounds fall back to a
 * unit box so the scale math never divides by zero.
 */
export function fitCanvas(
  bounds: Bounds,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1,
): CanvasFit {
  const rangeX = Math.max(bounds.maxX - bounds.minX, 1e-6)
  const rangeY = Math.max(bounds.maxY - bounds.minY, 1e-6)
  const usableW = cssWidth * (1 - 2 * FIT_PADDING_RATIO)
  const usableH = cssHeight * (1 - 2 * FIT_PADDING_RATIO)
  const scale = Math.min(usableW / rangeX, usableH / rangeY)

  // Centre the scaled track in the full canvas.
  const offsetX = (cssWidth - rangeX * scale) / 2 - bounds.minX * scale
  const offsetY = (cssHeight - rangeY * scale) / 2 - bounds.minY * scale
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DPR)

  return {
    scale,
    offsetX,
    offsetY,
    dpr,
    toPx: (x, y) => [x * scale + offsetX, y * scale + offsetY],
  }
}
