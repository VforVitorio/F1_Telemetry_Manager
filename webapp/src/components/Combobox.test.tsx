import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MultiCombobox, type ComboboxOption } from './Combobox'

// cmdk's Command.List measures its own height via ResizeObserver so it can
// animate `--cmdk-list-height`. jsdom has no layout engine and doesn't
// implement ResizeObserver at all, so opening the popover would throw
// without this stub. Radix Popover itself only reaches for ResizeObserver
// through Popover.Arrow (unused here), so no other polyfill is needed.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.assign(globalThis, { ResizeObserver: ResizeObserverStub })
  }
})

const OPTIONS: ComboboxOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

describe('MultiCombobox', () => {
  it('does not add a new value once `max` is reached', () => {
    const onChange = vi.fn()
    render(<MultiCombobox options={OPTIONS} value={['a', 'b']} onChange={onChange} max={2} />)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Gamma'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a value via its chip button without touching the others', () => {
    const onChange = vi.fn()
    render(<MultiCombobox options={OPTIONS} value={['a', 'b']} onChange={onChange} max={2} />)

    fireEvent.click(screen.getByLabelText('Remove Alpha'))

    expect(onChange).toHaveBeenCalledWith(['b'])
  })
})
