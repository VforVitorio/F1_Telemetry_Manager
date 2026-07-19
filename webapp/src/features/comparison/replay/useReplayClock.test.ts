// Behavioural tests for the ONE rAF clock. rAF timing itself is inherently
// fuzzy in a test environment, so we stub `requestAnimationFrame` /
// `cancelAnimationFrame` / `performance.now` with a tiny manual scheduler we
// drive frame-by-frame with `tick(ms)` — deterministic, and it exercises the
// exact same code path the hook uses (a real callback queue, not a fake-timer
// approximation of rAF). We assert direction + terminal state + callback
// counts rather than exact sub-millisecond timings.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReplayClock } from './useReplayClock'

/**
 * Installs a deterministic requestAnimationFrame: `tick(ms)` advances the
 * fake clock by `ms` and invokes every callback currently queued (there is at
 * most one per live `useReplayClock` instance, since `play()` re-arms exactly
 * one frame per tick). `frameCount()` exposes how many frames are queued,
 * which is what proves "no double loop" without asserting on internals.
 */
function installManualRaf() {
  let now = 0
  let nextId = 0
  let pending = new Map<number, FrameRequestCallback>()

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++nextId
      pending.set(id, cb)
      return id
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      pending.delete(id)
    }),
  )
  vi.stubGlobal('performance', { now: () => now })

  return {
    tick(ms: number) {
      now += ms
      const due = [...pending.values()]
      pending = new Map()
      for (const cb of due) cb(now)
    },
    frameCount: () => pending.size,
  }
}

describe('useReplayClock', () => {
  let raf: ReturnType<typeof installManualRaf>

  beforeEach(() => {
    raf = installManualRaf()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('seek clamps to [0, duration]', () => {
    const { result } = renderHook(() => useReplayClock({ duration: 10, speed: 1, loop: false }))

    act(() => result.current.seek(-5))
    expect(result.current.getTime()).toBe(0)

    act(() => result.current.seek(999))
    expect(result.current.getTime()).toBe(10)

    act(() => result.current.seek(4))
    expect(result.current.getTime()).toBe(4)
  })

  it('notifies subscribers on seek, and stops after unsubscribe', () => {
    const { result } = renderHook(() => useReplayClock({ duration: 10, speed: 1, loop: false }))
    const cb = vi.fn()

    let unsubscribe = () => {}
    act(() => {
      unsubscribe = result.current.subscribe(cb)
    })

    act(() => result.current.seek(3))
    expect(cb).toHaveBeenCalledWith(3)

    act(() => unsubscribe())
    act(() => result.current.seek(6))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('advances monotonically at speed 1 and reaches duration, firing finished once', () => {
    const onStatusChange = vi.fn()
    const { result } = renderHook(() =>
      useReplayClock({ duration: 1, speed: 1, loop: false, onStatusChange }),
    )

    act(() => result.current.play())
    expect(result.current.isPlaying()).toBe(true)

    act(() => raf.tick(400))
    const t1 = result.current.getTime()
    expect(t1).toBeGreaterThan(0)
    expect(t1).toBeLessThan(1)

    act(() => raf.tick(400))
    const t2 = result.current.getTime()
    expect(t2).toBeGreaterThan(t1)

    act(() => raf.tick(1000)) // overshoots past duration
    expect(result.current.getTime()).toBe(1)
    expect(result.current.isPlaying()).toBe(false)
    expect(onStatusChange).toHaveBeenCalledWith('finished')
    expect(onStatusChange.mock.calls.filter(([status]) => status === 'finished')).toHaveLength(1)
    expect(raf.frameCount()).toBe(0) // no leaked frame after finishing
  })

  it('loop=true wraps to 0 and keeps playing instead of finishing', () => {
    const onStatusChange = vi.fn()
    const { result } = renderHook(() =>
      useReplayClock({ duration: 1, speed: 1, loop: true, onStatusChange }),
    )

    act(() => result.current.play())
    act(() => raf.tick(1500)) // overshoots past duration once

    expect(onStatusChange).not.toHaveBeenCalledWith('finished')
    expect(result.current.isPlaying()).toBe(true)
    expect(raf.frameCount()).toBe(1) // playback re-armed after the wrap
  })

  it('speed multiplier scales the advance rate', () => {
    const { result: slow } = renderHook(() =>
      useReplayClock({ duration: 100, speed: 1, loop: false }),
    )
    const { result: fast } = renderHook(() =>
      useReplayClock({ duration: 100, speed: 4, loop: false }),
    )

    act(() => {
      slow.current.play()
      fast.current.play()
    })
    act(() => raf.tick(1000))

    expect(fast.current.getTime()).toBeCloseTo(slow.current.getTime() * 4, 5)
  })

  it('calling play() twice does not double the advance rate (no duplicate loop)', () => {
    const { result } = renderHook(() => useReplayClock({ duration: 100, speed: 1, loop: false }))

    act(() => {
      result.current.play()
      result.current.play()
    })
    expect(raf.frameCount()).toBe(1) // only one frame queued, not two

    act(() => raf.tick(1000))
    expect(result.current.getTime()).toBeCloseTo(1, 5) // one tick's worth of dt, not two
  })

  it('toggle() flips play/pause; pause() leaves no frame queued', () => {
    const { result } = renderHook(() => useReplayClock({ duration: 100, speed: 1, loop: false }))

    act(() => result.current.toggle())
    expect(result.current.isPlaying()).toBe(true)
    expect(raf.frameCount()).toBe(1)

    act(() => result.current.toggle())
    expect(result.current.isPlaying()).toBe(false)
    expect(raf.frameCount()).toBe(0)
  })

  it('duration<=0 is safe: no NaN, and play() is a no-op', () => {
    const { result } = renderHook(() => useReplayClock({ duration: 0, speed: 1, loop: false }))

    act(() => result.current.play())
    expect(result.current.isPlaying()).toBe(false)
    expect(result.current.getTime()).toBe(0)
    expect(raf.frameCount()).toBe(0)

    act(() => result.current.seek(50))
    expect(result.current.getTime()).toBe(0)
    expect(Number.isNaN(result.current.getTime())).toBe(false)
  })
})
