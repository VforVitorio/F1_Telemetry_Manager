import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemePreview } from './ThemePreview'

// Smoke test: proves the Vitest + jsdom + Testing Library harness renders a
// real component (the dev theme-preview surface). Feature tests live with
// their features.
describe('ThemePreview', () => {
  it('renders the design-tokens heading', () => {
    render(<ThemePreview />)
    expect(screen.getByRole('heading', { name: /design tokens/i })).toBeInTheDocument()
  })
})
