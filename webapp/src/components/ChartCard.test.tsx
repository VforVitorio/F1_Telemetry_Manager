import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartCard } from './ChartCard'

describe('ChartCard', () => {
  it('opens a full-viewport dialog on maximize and closes it on restore', () => {
    render(
      <ChartCard title="Lap Times">
        <div>chart body</div>
      </ChartCard>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /maximize chart/i }))
    expect(screen.getByRole('dialog', { name: /lap times/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /restore chart/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the maximized dialog on Escape', () => {
    render(
      <ChartCard title="Lap Times">
        <div>chart body</div>
      </ChartCard>,
    )

    fireEvent.click(screen.getByRole('button', { name: /maximize chart/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hides the body when the collapse button is clicked', () => {
    render(
      <ChartCard title="Lap Times">
        <div>chart body</div>
      </ChartCard>,
    )

    expect(screen.getByText('chart body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse chart/i }))
    expect(screen.queryByText('chart body')).not.toBeInTheDocument()
  })
})
