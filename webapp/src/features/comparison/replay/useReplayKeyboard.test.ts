import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { useReplayKeyboard } from './useReplayKeyboard'
import type { ReplayClock } from './types'

// Exercises the keyboard mapping against a detached DOM element with a fake
// clock (spies, no real rAF loop) — no need to render the transport UI at all.

const DURATION = 70.3
const SPEEDS = [0.25, 0.5, 1, 2] as const

function createFakeClock(): ReplayClock {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    nudge: vi.fn(),
    restart: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getTime: vi.fn(() => 0),
    isPlaying: vi.fn(() => false),
  }
}

/** Mounts the hook against a detached element (never appended to `document`)
 *  so the keydown wiring is exercised without a real page around it. */
function setup(speed: (typeof SPEEDS)[number] = 1) {
  const card = document.createElement('div')
  const clock = createFakeClock()
  const onSpeedChange = vi.fn()
  const ref = { current: card } as RefObject<HTMLElement>

  renderHook(() =>
    useReplayKeyboard(ref, { clock, duration: DURATION, speed, speeds: SPEEDS, onSpeedChange }),
  )

  return { card, clock, onSpeedChange }
}

function press(target: HTMLElement, key: string, shiftKey = false) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  )
}

describe('useReplayKeyboard', () => {
  it('Space toggles play/pause', () => {
    const { card, clock } = setup()
    press(card, ' ')
    expect(clock.toggle).toHaveBeenCalledTimes(1)
  })

  it('ArrowRight nudges forward half a second', () => {
    const { card, clock } = setup()
    press(card, 'ArrowRight')
    expect(clock.nudge).toHaveBeenCalledWith(0.5)
  })

  it('Shift+ArrowLeft nudges back five seconds', () => {
    const { card, clock } = setup()
    press(card, 'ArrowLeft', true)
    expect(clock.nudge).toHaveBeenCalledWith(-5)
  })

  it('Home seeks to the start', () => {
    const { card, clock } = setup()
    press(card, 'Home')
    expect(clock.seek).toHaveBeenCalledWith(0)
  })

  it('End seeks to the duration', () => {
    const { card, clock } = setup()
    press(card, 'End')
    expect(clock.seek).toHaveBeenCalledWith(DURATION)
  })

  it('R restarts the replay', () => {
    const { card, clock } = setup()
    press(card, 'r')
    expect(clock.restart).toHaveBeenCalledTimes(1)
  })

  it('L steps speed up and J steps it back down', () => {
    const { card, onSpeedChange } = setup(1)
    press(card, 'l')
    expect(onSpeedChange).toHaveBeenCalledWith(2)
    press(card, 'j')
    expect(onSpeedChange).toHaveBeenCalledWith(0.5)
  })

  it('ignores keydown while typing in a text input', () => {
    const { card, clock } = setup()
    const input = document.createElement('input')
    card.appendChild(input)
    press(input, ' ')
    expect(clock.toggle).not.toHaveBeenCalled()
  })
})
