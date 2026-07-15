// StintTimeline (#35) — a schematic lap axis showing the pit plan: where "now"
// sits, when the box lap is planned, and roughly where the current stint is
// expected to run out. Pure SVG, not ECharts — this isn't a data plot, it's a
// small annotated ruler with at most four marks on it, and a charting lib
// would be pure overhead for that.
//
// Every mark past "now" comes from the LLM synthesis step and can be absent —
// a sparse/no-LLM run leaves most of `StrategyRecommendation`'s optional
// fields unset (see that type's own docstring). `isRenderableLap` treats a
// missing, non-finite, OR out-of-window lap the same as "don't draw it"
// rather than clamping it onto the axis, which would misrepresent the plan.
//
// The viewBox width tracks the container's actual measured pixel width (via
// `useMeasuredWidth`) instead of a fixed constant. This chart is placed
// full-width by the page, and a fixed viewBox squeezed by `preserveAspectRatio`
// into whatever column width it's given scales every glyph down with it — an
// 11px label was rendering at roughly 6px. Matching the viewBox to the real
// width keeps 1 SVG unit == 1 CSS px, so text always renders at its authored
// size regardless of how wide the container ends up being.

import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChartCard } from '@/components/ChartCard'
import { CompoundPill } from '@/components/CompoundPill'
import type { LapState, StrategyCompound, StrategyRecommendation } from '@/lib/api/strategy'

const VIEWBOX_HEIGHT = 130
const CONTAINER_HEIGHT_PX = 130
const PADDING_X = 44
const BASELINE_Y = 76

const NOW_TICK_HALF_PX = 15
const EVENT_TICK_HALF_PX = 9
const ABOVE_LABEL_OFFSET_Y = 20
const PIT_LABEL_OFFSET_Y = 34
const AXIS_LABEL_OFFSET_Y = 22
const STINT_END_LABEL_OFFSET_Y = 38

const COMPOUND_PILL_WIDTH = 60
const COMPOUND_PILL_HEIGHT = 22
const COMPOUND_PILL_GAP_Y = 12

// How close (in px) the box-lap tick can sit to the "now" tick before their
// centered labels start to overlap — both sit at a similar height, so
// anything closer than this reads as a smear of characters, not two labels.
const NOW_LABEL_COLLISION_PX = 90
// When the collision guard fires, how far past the tick to nudge the
// left-aligned box label so it clears the "now" label instead of sitting
// centered on top of it.
const COLLISION_LABEL_OFFSET_X = 6

// How far back from `now` the visible window starts. `lap_state` carries no
// stint-start lap (only a stint INDEX, `driver.stint`), so a fixed lookback is
// the simplest honest window rather than guessing a stint-start lap.
const LOOKBACK_LAPS = 2

/** Lap -> x pixel, linear across `[axisStart, axisEnd]` within the padded
 *  viewBox. `span <= 0` (a single-lap window) falls back to dead center
 *  instead of dividing by zero. `viewBoxWidth` is the caller's live measured
 *  width (see `useMeasuredWidth`), not a fixed constant, so every marker
 *  recomputes its x from the same up-to-date value. */
function lapToX(lap: number, axisStart: number, axisEnd: number, viewBoxWidth: number): number {
  const usableWidth = viewBoxWidth - PADDING_X * 2
  const span = axisEnd - axisStart
  const fraction = span > 0 ? (lap - axisStart) / span : 0.5
  return PADDING_X + fraction * usableWidth
}

/** True only for a present, finite lap that actually falls within the visible
 *  axis window — the null-tolerance boundary every optional marker is gated
 *  on. An out-of-window value is treated as absent rather than clamped, so
 *  the drawing never implies a lap the plan didn't actually give. */
function isRenderableLap(
  lap: number | null | undefined,
  axisStart: number,
  axisEnd: number,
): lap is number {
  return typeof lap === 'number' && Number.isFinite(lap) && lap >= axisStart && lap <= axisEnd
}

/** ML predictions can land on a fractional lap; the axis label always shows
 *  the nearest whole lap. */
function roundLap(lap: number): number {
  return Math.round(lap)
}

/** One sentence summarizing the timeline for screen readers — the SVG itself
 *  is `aria-hidden`, so this is the only description of what's drawn. */
function buildAriaLabel(
  now: number,
  totalLaps: number,
  pitLap: number | null,
  stintEndLap: number | null,
): string {
  const parts = [`now at lap ${now} of ${totalLaps}`]
  if (pitLap != null) parts.push(`pit box planned for lap ${roundLap(pitLap)}`)
  if (stintEndLap != null) parts.push(`stint expected to end around lap ${roundLap(stintEndLap)}`)
  return `Stint timeline: ${parts.join(', ')}`
}

/** Tracks a wrapping element's live pixel width via `ResizeObserver`, so the
 *  SVG's viewBox can match the real container instead of a fixed constant
 *  (see module docstring for why that mismatch shrank the text). Starts at 0
 *  before the first observation fires; callers must treat 0 as "not measured
 *  yet" and skip rendering rather than divide by it. */
function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/** When the box-lap tick sits within `NOW_LABEL_COLLISION_PX` of the "now"
 *  tick, a centered box label would print right through the "now" label.
 *  Left-aligning it with a small offset instead keeps both readable without
 *  dropping either mark. */
function boxLabelPlacement(x: number, nowX: number): { anchor: 'middle' | 'start'; x: number } {
  const isNearNow = Math.abs(x - nowX) < NOW_LABEL_COLLISION_PX
  return isNearNow ? { anchor: 'start', x: x + COLLISION_LABEL_OFFSET_X } : { anchor: 'middle', x }
}

interface PitMarkerProps {
  pitLap: number
  axisStart: number
  axisEnd: number
  viewBoxWidth: number
  nowX: number
  compound: StrategyCompound | null | undefined
}

/** The planned box lap: a tick, a "▲" glyph, a "box lap N" label, and (when
 *  the orchestrator named one) the next compound as a pill underneath. The
 *  label nudges clear of the "now" label when the two ticks sit close
 *  together (see `boxLabelPlacement`). */
function PitMarker({ pitLap, axisStart, axisEnd, viewBoxWidth, nowX, compound }: PitMarkerProps) {
  const x = lapToX(pitLap, axisStart, axisEnd, viewBoxWidth)
  const label = boxLabelPlacement(x, nowX)
  return (
    <g>
      <line
        x1={x}
        y1={BASELINE_Y - EVENT_TICK_HALF_PX}
        x2={x}
        y2={BASELINE_Y + EVENT_TICK_HALF_PX}
        strokeWidth={1.5}
        className="stroke-accent"
      />
      <text
        x={x}
        y={BASELINE_Y - EVENT_TICK_HALF_PX - 4}
        textAnchor="middle"
        className="fill-accent text-[13px]"
      >
        ▲
      </text>
      <text
        x={label.x}
        y={BASELINE_Y - PIT_LABEL_OFFSET_Y}
        textAnchor={label.anchor}
        className="fill-fg-1 font-mono text-[11px] font-medium tabular-nums"
      >
        box lap {roundLap(pitLap)}
      </text>
      {compound ? (
        <foreignObject
          x={x - COMPOUND_PILL_WIDTH / 2}
          y={BASELINE_Y + EVENT_TICK_HALF_PX + COMPOUND_PILL_GAP_Y}
          width={COMPOUND_PILL_WIDTH}
          height={COMPOUND_PILL_HEIGHT}
        >
          <div className="flex h-full w-full items-center justify-center">
            <CompoundPill compound={compound} />
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
}

interface StintEndMarkerProps {
  stintEndLap: number
  axisStart: number
  axisEnd: number
  viewBoxWidth: number
}

/** A softer, dashed tick for where the CURRENT stint is expected to run out —
 *  a tyre-life estimate, not a committed action, so it's styled to read as
 *  less certain than the pit-box tick. */
function StintEndMarker({ stintEndLap, axisStart, axisEnd, viewBoxWidth }: StintEndMarkerProps) {
  const x = lapToX(stintEndLap, axisStart, axisEnd, viewBoxWidth)
  return (
    <g>
      <line
        x1={x}
        y1={BASELINE_Y - EVENT_TICK_HALF_PX}
        x2={x}
        y2={BASELINE_Y + EVENT_TICK_HALF_PX}
        strokeWidth={1.5}
        strokeDasharray="3,3"
        className="stroke-fg-3"
      />
      <text
        x={x}
        y={BASELINE_Y + STINT_END_LABEL_OFFSET_Y}
        textAnchor="middle"
        className="fill-fg-3 font-mono text-[11px]"
      >
        ⌁ stint end
      </text>
    </g>
  )
}

export interface StintTimelineProps {
  lapState: LapState
  result: StrategyRecommendation
}

/**
 * Schematic lap axis for the pit plan. Axis window: `[max(1, now-2), max(totalLaps, now)]`
 * — a short lookback before `now` plus the rest of the race, clamped so a
 * stale/short parquet can never push the "now" tick off the right edge.
 *
 * Degrades gracefully: `pit_lap_target` and `expected_stint_end` are both
 * optional on `StrategyRecommendation` (sparse on a no-LLM or partial run), so
 * with both absent this still renders a valid, minimal timeline — the axis
 * plus the "now" tick alone.
 *
 * The SVG's viewBox width tracks the container's own measured width (see
 * `useMeasuredWidth`), so the SVG itself doesn't render until that first
 * measurement lands — nothing to divide by zero, and no flash of a
 * mis-scaled fallback while waiting for layout.
 */
export function StintTimeline({ lapState, result }: StintTimelineProps) {
  const [containerRef, width] = useMeasuredWidth()

  const now = lapState.lap_number
  const totalLaps = lapState.session_meta.total_laps
  const axisStart = Math.max(1, now - LOOKBACK_LAPS)
  const axisEnd = Math.max(totalLaps, now)

  const pitLap = isRenderableLap(result.pit_lap_target, axisStart, axisEnd)
    ? result.pit_lap_target
    : null
  const stintEndLap = isRenderableLap(result.expected_stint_end, axisStart, axisEnd)
    ? result.expected_stint_end
    : null

  const nowX = lapToX(now, axisStart, axisEnd, width)
  const ariaLabel = buildAriaLabel(now, totalLaps, pitLap, stintEndLap)

  return (
    <ChartCard title="Stint timeline">
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        style={{ height: CONTAINER_HEIGHT_PX }}
      >
        {width === 0 ? null : (
          <svg
            viewBox={`0 0 ${width} ${VIEWBOX_HEIGHT}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <line
              x1={PADDING_X}
              y1={BASELINE_Y}
              x2={width - PADDING_X}
              y2={BASELINE_Y}
              strokeWidth={2}
              className="stroke-hairline"
            />
            <text
              x={PADDING_X}
              y={BASELINE_Y + AXIS_LABEL_OFFSET_Y}
              textAnchor="start"
              className="fill-fg-3 font-mono text-[11px] tabular-nums"
            >
              Lap {roundLap(axisStart)}
            </text>
            <text
              x={width - PADDING_X}
              y={BASELINE_Y + AXIS_LABEL_OFFSET_Y}
              textAnchor="end"
              className="fill-fg-3 font-mono text-[11px] tabular-nums"
            >
              Lap {roundLap(axisEnd)}
            </text>

            {/* now — always renders; lap_number is a required lap_state field */}
            <line
              x1={nowX}
              y1={BASELINE_Y - NOW_TICK_HALF_PX}
              x2={nowX}
              y2={BASELINE_Y + NOW_TICK_HALF_PX}
              strokeWidth={2}
              className="stroke-accent"
            />
            <text
              x={nowX}
              y={BASELINE_Y - ABOVE_LABEL_OFFSET_Y}
              textAnchor="middle"
              className="fill-fg-1 font-mono text-[11px] font-medium tabular-nums"
            >
              now · lap {now}
            </text>

            {pitLap != null ? (
              <PitMarker
                pitLap={pitLap}
                axisStart={axisStart}
                axisEnd={axisEnd}
                viewBoxWidth={width}
                nowX={nowX}
                compound={result.compound_next}
              />
            ) : null}
            {stintEndLap != null ? (
              <StintEndMarker
                stintEndLap={stintEndLap}
                axisStart={axisStart}
                axisEnd={axisEnd}
                viewBoxWidth={width}
              />
            ) : null}
          </svg>
        )}
      </div>
    </ChartCard>
  )
}
