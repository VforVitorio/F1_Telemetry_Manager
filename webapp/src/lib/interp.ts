// Linear interpolation on a monotonically-increasing x-grid — the one-liner the
// telemetry charts and the Comparison replay both need, promoted out of
// ChannelChart.tsx so there is a single tested implementation (spec
// comparison.md §5/§6: "promote interp → lib/interp.ts").
//
// Mirrors numpy.interp: values outside [xs[0], xs[last]] clamp to the nearest
// endpoint instead of extrapolating. Accepts ArrayLike so it works on both plain
// number[] (dashboard telemetry) and Float32Array (the replay's baked channels).

/**
 * Interpolate `ys` at `x` given a strictly-increasing `xs` (same length as `ys`).
 * Clamps to the endpoints outside the domain. O(log n) via binary search.
 */
export function interp(x: number, xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const last = xs.length - 1
  if (last < 0) return 0
  if (x <= xs[0]) return ys[0]
  if (x >= xs[last]) return ys[last]

  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const span = xs[hi] - xs[lo]
  if (span === 0) return ys[lo]
  const t = (x - xs[lo]) / span
  return ys[lo] + t * (ys[hi] - ys[lo])
}
