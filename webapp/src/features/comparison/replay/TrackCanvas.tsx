// The 60fps track map for the Comparison replay. Two stacked canvases split
// the work by how often it changes: a STATIC layer
// (the faint grey ribbon) repaints only on resize/model change, and a DYNAMIC
// layer (dominance reveal, trails, dots, gap-link) repaints every clock tick.
// Splitting them means the expensive-relative-to-nothing static ribbon never
// gets re-stroked 60 times a second just because the playhead moved.
//
// All the actual drawing lives in trackDraw.ts (pure, testable). This
// component only owns the DOM/canvas plumbing: sizing via ResizeObserver,
// wiring the imperative ReplayClock subscription, and reacting to prop
// changes — none of it touches React state per frame (the playhead never
// becomes a re-render; see the frozen ReplayClock contract in types.ts).

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { fitCanvas, type CanvasFit } from '@/features/dashboard/components/circuitDraw'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/stores/ui'
import {
  clamp01,
  computeSpeedRange,
  drawDynamicLayer,
  drawStaticLayer,
  type ModeTransition,
} from './trackDraw'
import type { ReplayClock, ReplayModel, TrackMode } from './types'

/** Circuit-crossfade window (ms) — the plain mode-to-mode blend. */
const MODE_TRANSITION_DURATION_MS = 220
/** Dominance draw-on sweep window (ms) — longer than the plain crossfade so the
 *  feathered distance frontier has room to read as a wipe instead of a flash. */
const DOMINANCE_SWEEP_DURATION_MS = 400

/** One armed mode-switch beat, timestamp-driven (never React state — see the
 *  file header). `durationMs` is captured at arm time so the plain crossfade
 *  and the dominance sweep can each run their own window without sharing one
 *  constant; `toDominance` records which duration applies. */
interface ArmedModeTransition {
  fromMode: TrackMode
  toDominance: boolean
  startMs: number
  durationMs: number
}

export interface TrackCanvasProps {
  model: ReplayModel
  clock: ReplayClock
  trackMode: TrackMode
  /** When true: no trails, no dot glow pulse (prefers-reduced-motion). */
  reducedMotion?: boolean
  className?: string
}

const TRACK_MODE_LABEL: Record<TrackMode, string> = {
  dominance: 'dominance reveal',
  speed: 'speed heatmap',
  gain: 'time gain/loss',
}

function buildAriaLabel(model: ReplayModel, trackMode: TrackMode): string {
  const [pilot1, pilot2] = model.pilots
  return `Track map: ${pilot1.code} vs ${pilot2.code}, ${TRACK_MODE_LABEL[trackMode]}`
}

/** Resizes a canvas's backing store to `cssWidth × cssHeight` at `dpr`, keeps
 *  its CSS box at the un-scaled size, and re-applies the draw-in-CSS-pixels
 *  transform (a canvas resize wipes both the pixel buffer and any transform,
 *  so this must run before the next draw call, every time). */
function configureCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): void {
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/**
 * The animated track map: dominance/speed/gain reveal, ~2.5s trails, team-
 * coloured dots, and the gap-link when the two cars are racing close. Reads
 * `clock` imperatively (subscribe/getTime) — it never stores the playhead in
 * React state, so a running replay costs zero React re-renders.
 */
export function TrackCanvas({
  model,
  clock,
  trackMode,
  reducedMotion = false,
  className,
}: TrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dynamicCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const staticCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const dynamicCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const fitRef = useRef<CanvasFit | null>(null)

  // Read internally rather than via a prop, so TrackCanvasProps stays unchanged
  // — the canvas is the one surface that used to hardcode dark-theme ink
  // regardless of light/dark mode.
  const theme = useUiStore((state) => state.theme)

  // Latest trackMode/reducedMotion/theme, read fresh inside the rAF-driven
  // subscription below without re-subscribing to the clock on every change.
  const trackModeRef = useRef(trackMode)
  trackModeRef.current = trackMode
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const themeRef = useRef(theme)
  themeRef.current = theme

  // Mode-switch beat: the in-flight transition (if any), the previous
  // trackMode (to detect a real change vs. mount/persisted-mode reload), the
  // previous model (to detect a fresh comparison), and the self-rAF id that
  // drives repaints while the clock is paused. All refs — a mode-switch beat
  // is a per-frame value like the playhead itself, never React state.
  const modeTransitionRef = useRef<ArmedModeTransition | null>(null)
  const prevTrackModeRef = useRef<TrackMode | null>(null)
  const modelRef = useRef(model)
  const transitionRafRef = useRef<number | null>(null)

  // Segments don't change frame-to-frame — scan their speed range once per
  // model instead of on every tick (trackDraw.ts's speed heatmap needs it).
  const speedRange = useMemo(() => computeSpeedRange(model.circuit.segments), [model])

  const renderFrame = useCallback(
    (t: number) => {
      const fit = fitRef.current
      const dynamicCtx = dynamicCtxRef.current
      if (!fit || !dynamicCtx) return

      // Resolve the armed transition (if any) into this frame's blend amount
      // purely from wall-clock timestamps — so play/pause mid-transition Just
      // Works, and a slow/fast tab never skews the blend.
      let modeTransition: ModeTransition | null = null
      const transition = modeTransitionRef.current
      if (transition) {
        const progress = clamp01((performance.now() - transition.startMs) / transition.durationMs)
        if (progress >= 1) {
          modeTransitionRef.current = null
        } else {
          modeTransition = { fromMode: transition.fromMode, progress }
        }
      }

      drawDynamicLayer(
        dynamicCtx,
        model,
        t,
        fit,
        trackModeRef.current,
        reducedMotionRef.current,
        speedRange,
        themeRef.current,
        modeTransition,
      )
    },
    [model, speedRange],
  )

  /** Drives repaints while the transition is in flight AND the clock is
   *  paused (the clock's own subscription already repaints every frame while
   *  playing — see the arming effect below). `isPlaying()` is checked fresh
   *  every tick, so play/pause toggling mid-transition never leaves a gap:
   *  whichever loop is authoritative paints, the other just no-ops. */
  const startTransitionLoop = useCallback(() => {
    if (transitionRafRef.current !== null) return // already running
    const tick = () => {
      if (modeTransitionRef.current === null) {
        transitionRafRef.current = null
        return // finished — stop scheduling
      }
      if (!clock.isPlaying()) renderFrame(clock.getTime())
      transitionRafRef.current = requestAnimationFrame(tick)
    }
    transitionRafRef.current = requestAnimationFrame(tick)
  }, [clock, renderFrame])

  // Sizing: measure the container, fit the track's bounds into it, resize
  // both canvases, repaint the static ribbon, and refresh the current frame
  // so a resize never leaves stale geometry on screen. Runs once on mount
  // (ResizeObserver fires immediately on observe()) and again on every
  // resize or model change.
  useEffect(() => {
    const container = containerRef.current
    const staticCanvas = staticCanvasRef.current
    const dynamicCanvas = dynamicCanvasRef.current
    if (!container || !staticCanvas || !dynamicCanvas) return

    staticCtxRef.current = staticCanvas.getContext('2d')
    dynamicCtxRef.current = dynamicCanvas.getContext('2d')

    const handleResize = () => {
      const cssWidth = container.clientWidth
      const cssHeight = container.clientHeight
      if (cssWidth === 0 || cssHeight === 0) return

      const fit = fitCanvas(model.circuit.bounds, cssWidth, cssHeight)
      fitRef.current = fit

      const staticCtx = staticCtxRef.current
      const dynamicCtx = dynamicCtxRef.current
      if (!staticCtx || !dynamicCtx) return

      configureCanvas(staticCanvas, staticCtx, cssWidth, cssHeight, fit.dpr)
      configureCanvas(dynamicCanvas, dynamicCtx, cssWidth, cssHeight, fit.dpr)
      drawStaticLayer(staticCtx, model, fit, themeRef.current)
      renderFrame(clock.getTime())
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [model, clock, renderFrame])

  // A trackMode/reducedMotion/theme change should redraw the CURRENT frame
  // right away — otherwise a paused replay would only reflect the new mode
  // once the clock ticks again (never, while paused). A theme change also
  // repaints the static ribbon in place (using the already-computed `fit` —
  // no need to remeasure or recreate the ResizeObserver just to swap ink).
  //
  // This is also the ONLY place a mode-switch beat gets armed. A REAL
  // trackMode change (not the first mount, not a persisted-mode reload, not a
  // reduced-motion session) on the SAME model starts a short crossfade —
  // dominance-target beats get the longer sweep duration, everything else gets
  // the plain crossfade. A fresh comparison (new model) resets the "last seen
  // mode" bookkeeping instead of crossfading from the old circuit.
  useEffect(() => {
    const staticCtx = staticCtxRef.current
    const fit = fitRef.current
    if (staticCtx && fit) drawStaticLayer(staticCtx, model, fit, theme)

    const modelChanged = modelRef.current !== model
    modelRef.current = model
    if (modelChanged) prevTrackModeRef.current = null

    const prevMode = prevTrackModeRef.current
    prevTrackModeRef.current = trackMode
    // `prevMode === null` covers first mount AND the persisted-mode reload
    // (store.ts persists trackMode — a session that reopens in Speed must
    // not crossfade on load).
    if (!modelChanged && prevMode !== null && prevMode !== trackMode && !reducedMotion) {
      const toDominance = trackMode === 'dominance'
      modeTransitionRef.current = {
        fromMode: prevMode,
        toDominance,
        startMs: performance.now(),
        durationMs: toDominance ? DOMINANCE_SWEEP_DURATION_MS : MODE_TRANSITION_DURATION_MS,
      }
      startTransitionLoop()
    }

    renderFrame(clock.getTime())

    return () => {
      if (transitionRafRef.current !== null) {
        cancelAnimationFrame(transitionRafRef.current)
        transitionRafRef.current = null
      }
      modeTransitionRef.current = null
    }
  }, [trackMode, reducedMotion, theme, model, clock, renderFrame, startTransitionLoop])

  // The one rAF-driven subscription: fires every frame while playing, and on
  // every seek (spec: ReplayClock.subscribe fires on seek too).
  useEffect(() => clock.subscribe(renderFrame), [clock, renderFrame])

  const ariaLabel = buildAriaLabel(model, trackMode)

  return (
    <div ref={containerRef} className={cn('relative', className)} role="img" aria-label={ariaLabel}>
      <canvas ref={staticCanvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <canvas
        ref={dynamicCanvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
    </div>
  )
}
