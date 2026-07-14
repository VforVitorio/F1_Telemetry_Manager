// The "Waiting for telemetry data…" loader, kept 1:1 from Streamlit (a
// ScaleLoader — 5 purple bars pulsing on a staggered delay). Shown by the
// telemetry charts and the circuit map before a lap's telemetry is loaded.
// Víctor's hard requirement: preserve this loading state before charts render.
//
// The `@keyframes` are injected ONCE at module load (guarded by a DOM id, not
// just a JS boolean, so a Vite HMR re-evaluation of this module can't leave a
// duplicate behind) rather than per mount — up to 7 TelemetryGrid cards can
// render this loader at the same time while laps are still loading, and a
// `<style>` tag per instance would mean 7 copies of the same rule.

const KEYFRAMES_ID = 'f1-telemetry-loader-keyframes'

function ensureKeyframesInjected(): void {
  if (typeof document === 'undefined' || document.getElementById(KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = KEYFRAMES_ID
  style.textContent = `@keyframes f1-scaleloader {
    0%, 40%, 100% { transform: scaleY(0.4); opacity: 0.6; }
    20% { transform: scaleY(1); opacity: 1; }
  }`
  document.head.appendChild(style)
}

ensureKeyframesInjected()

interface TelemetryLoaderProps {
  /** Message under the bars. Defaults to the Streamlit copy. */
  label?: string
  /** Container min-height in px (charts use 400, matching Streamlit). */
  minHeight?: number
}

const BAR_COLOR = 'var(--purple-300)'
const BAR_COUNT = 5

export function TelemetryLoader({
  label = 'Waiting for telemetry data...',
  minHeight = 400,
}: TelemetryLoaderProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-hairline"
      style={{ minHeight }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          // The animation itself lives in a class (not inline style) so
          // `motion-reduce:animate-none` can win outright — a static bar,
          // not just a faster one — for anyone with reduced-motion set.
          // Only the per-bar stagger (`animationDelay`) needs to stay inline.
          <span
            key={i}
            className="animate-[f1-scaleloader_1s_ease-in-out_infinite] motion-reduce:animate-none"
            style={{
              display: 'inline-block',
              width: 6,
              height: 35,
              background: BAR_COLOR,
              borderRadius: 2,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
      <p className="text-sm text-fg-2">{label}</p>
    </div>
  )
}
