// Lap-time formatting. The Streamlit lap chart shows MM:SS ticks on the y-axis
// (integer seconds, no milliseconds — matching `utils/time_formatters.py`),
// while hover shows the finer M:SS.mmm value.

/** Seconds → "M:SS" (integer seconds), for axis ticks. e.g. 79.4 → "1:19". */
export function formatLapTimeAxis(seconds: number): string {
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Seconds → "M:SS.mmm", for hover / precise readouts. e.g. 79.367 → "1:19.367". */
export function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const rem = seconds - mins * 60
  const secs = Math.floor(rem)
  const millis = Math.round((rem - secs) * 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}
