// The "Waiting for telemetry data…" loader, kept 1:1 from Streamlit (a
// ScaleLoader — 5 purple bars pulsing on a staggered delay). Shown by the
// telemetry charts and the circuit map before a lap's telemetry is loaded.
// Víctor's hard requirement: preserve this loading state before charts render.

interface TelemetryLoaderProps {
  /** Message under the bars. Defaults to the Streamlit copy. */
  label?: string
  /** Container min-height in px (charts use 400, matching Streamlit). */
  minHeight?: number
}

const BAR_COLOR = '#a78bfa'
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
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: 6,
              height: 35,
              background: BAR_COLOR,
              borderRadius: 2,
              animation: 'f1-scaleloader 1s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
      <p className="text-sm text-fg-2">{label}</p>
      <style>{`@keyframes f1-scaleloader {
        0%, 40%, 100% { transform: scaleY(0.4); opacity: 0.6; }
        20% { transform: scaleY(1); opacity: 1; }
      }`}</style>
    </div>
  )
}
