import { useEffect, useState } from 'react'

// Progressively reveals a finished string so an already-fetched answer READS
// as if it were being generated live. The backend RAG endpoint returns the
// whole answer in one response (the agent internals that could stream tokens
// are out of scope to touch), so this is a client-side reveal, not real token
// streaming. The Chat tab, once built, should stream for real over SSE instead.

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface TypewriterState {
  /** The portion of `text` revealed so far. */
  revealed: string
  /** True once the whole string is shown. */
  done: boolean
}

/**
 * Reveal `text` a few characters at a time for a typewriter effect.
 *
 * Jumps straight to the full string when `enabled` is false or the user
 * prefers reduced motion, so the content is never withheld for accessibility
 * or non-animated views. Restarts from the beginning whenever `text` changes,
 * so asking a second question re-plays the effect on the new answer.
 */
export function useTypewriter(
  text: string,
  enabled = true,
  charsPerTick = 4,
  tickMs = 20,
): TypewriterState {
  const instant = !enabled || PREFERS_REDUCED_MOTION || text.length === 0
  const [count, setCount] = useState(instant ? text.length : 0)

  useEffect(() => {
    if (instant) {
      setCount(text.length)
      return
    }
    setCount(0)
    let shown = 0
    const timer = setInterval(() => {
      shown = Math.min(shown + charsPerTick, text.length)
      setCount(shown)
      if (shown >= text.length) clearInterval(timer)
    }, tickMs)
    return () => clearInterval(timer)
  }, [text, instant, charsPerTick, tickMs])

  return { revealed: text.slice(0, count), done: count >= text.length }
}
