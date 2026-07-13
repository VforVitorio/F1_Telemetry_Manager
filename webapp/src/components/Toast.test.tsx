import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

// The only non-trivial logic in this file lives in `useToast`'s reducer
// (add / dismiss / cleanup) — everything else is declarative Radix wiring.

function TriggerToast() {
  const { toast } = useToast()
  return (
    <button
      onClick={() => toast({ title: 'Saved', description: 'Changes stored', tone: 'success' })}
    >
      Fire
    </button>
  )
}

describe('useToast', () => {
  it('shows a toast after calling toast()', () => {
    render(
      <ToastProvider>
        <TriggerToast />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Fire'))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Changes stored')).toBeInTheDocument()
  })

  it('removes the toast once dismissed via the close button', async () => {
    render(
      <ToastProvider>
        <TriggerToast />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Fire'))
    fireEvent.click(screen.getByLabelText('Dismiss notification'))
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())
  })

  it('throws when used outside a ToastProvider', () => {
    function Bare() {
      useToast()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
  })
})
