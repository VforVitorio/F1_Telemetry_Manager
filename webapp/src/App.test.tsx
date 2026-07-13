import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Smoke test: proves the Vitest + jsdom + Testing Library harness renders the
// app. The real per-feature tests arrive with their features (#31 onward).
describe('App', () => {
  it('renders the app name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /F1 StratLab/i })).toBeInTheDocument()
  })
})
