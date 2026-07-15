import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pill } from './Pill'

describe('Pill', () => {
  it('applies the matching tire color for each compound', () => {
    render(<Pill compound="SOFT">S</Pill>)
    // Compound pills use fixed dark ink (--tire-ink) + a hairline border so the
    // light tyre colours stay WCAG-legible in BOTH themes (not theme-flipping
    // text-fg-inv, which went white-on-light in the light theme).
    expect(screen.getByText('S')).toHaveClass(
      'bg-tire-soft',
      'text-[color:var(--tire-ink)]',
      'border',
    )
  })

  it('falls back to tone styling when no compound is set', () => {
    render(<Pill tone="danger">Late</Pill>)
    expect(screen.getByText('Late')).toHaveClass('bg-danger/15', 'text-danger')
  })

  it('prefers compound over tone when both are provided', () => {
    render(
      <Pill tone="danger" compound="WET">
        W
      </Pill>,
    )
    expect(screen.getByText('W')).toHaveClass('bg-tire-wet')
    expect(screen.getByText('W')).not.toHaveClass('bg-danger/15')
  })
})
