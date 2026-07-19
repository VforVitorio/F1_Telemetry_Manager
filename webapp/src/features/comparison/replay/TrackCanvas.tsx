// The 60fps track map for the Comparison replay (spec §4.4, issue #36). Two
// stacked canvases split the work by how often it changes: a STATIC layer
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
import { computeSpeedRange, drawDynamicLayer, drawStaticLayer } from './trackDraw'
import type { ReplayClock, ReplayModel, TrackMode } from './types'

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

  // Read internally rather than via a prop (spec: keep TrackCanvasProps
  // unchanged) — the canvas is the one surface that used to hardcode dark-
  // theme ink regardless of `data-theme` (Fable UI audit P1).
  const theme = useUiStore((state) => state.theme)

  // Latest trackMode/reducedMotion/theme, read fresh inside the rAF-driven
  // subscription below without re-subscribing to the clock on every change.
  const trackModeRef = useRef(trackMode)
  trackModeRef.current = trackMode
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const themeRef = useRef(theme)
  themeRef.current = theme

  // Segments don't change frame-to-frame — scan their speed range once per
  // model instead of on every tick (trackDraw.ts's speed heatmap needs it).
  const speedRange = useMemo(() => computeSpeedRange(model.circuit.segments), [model])

  const renderFrame = useCallback(
    (t: number) => {
      const fit = fitRef.current
      const dynamicCtx = dynamicCtxRef.current
      if (!fit || !dynamicCtx) return
      drawDynamicLayer(
        dynamicCtx,
        model,
        t,
        fit,
        trackModeRef.current,
        reducedMotionRef.current,
        speedRange,
        themeRef.current,
      )
    },
    [model, speedRange],
  )

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
  useEffect(() => {
    const staticCtx = staticCtxRef.current
    const fit = fitRef.current
    if (staticCtx && fit) drawStaticLayer(staticCtx, model, fit, theme)
    renderFrame(clock.getTime())
  }, [trackMode, reducedMotion, theme, model, clock, renderFrame])

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
