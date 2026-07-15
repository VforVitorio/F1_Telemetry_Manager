import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router'
import { Rail } from './Rail'
import { TooltipProvider } from '@/components/Tooltip'
import { useUiStore } from '@/stores/ui'

// Rail owns the only non-trivial logic in the shell scaffold: toggling
// `railCollapsed` on the shared UI store. It renders <Link>, which throws
// outside a router context, so it's mounted through a real (memory-history)
// router rather than rendered bare — mirrors router.tsx's shape (root wraps
// an <Outlet/>, a single '/' route renders the component under test).
function renderRail() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Rail />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // Rail's collapse button uses <Tooltip>, which throws outside a
  // TooltipProvider — the real app mounts one in providers.tsx, so the test
  // supplies its own (same as the router context above).
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
}

// The 7 nav links the redesigned rail must render, regardless of grouping —
// name (accessible name of the <Link>) paired with its route.
const NAV_LINKS: Array<[name: string, href: string]> = [
  ['Home', '/'],
  ['Dashboard', '/dashboard'],
  ['Comparison', '/comparison'],
  ['Lab', '/lab'],
  ['Strategy', '/strategy'],
  ['Race', '/race'],
  ['Chat', '/chat'],
]

describe('Rail', () => {
  it('toggles railCollapsed in the UI store on click', async () => {
    useUiStore.setState({ railCollapsed: false })
    renderRail()

    const toggle = await screen.findByRole('button', { name: /collapse navigation/i })
    fireEvent.click(toggle)

    expect(useUiStore.getState().railCollapsed).toBe(true)
  })

  it('renders the brand block linking home', async () => {
    useUiStore.setState({ railCollapsed: false })
    renderRail()

    const brandLink = await screen.findByRole('link', { name: /f1 stratlab/i })
    expect(brandLink).toHaveAttribute('href', '/')
  })

  it('renders all 7 nav links with their routes', async () => {
    useUiStore.setState({ railCollapsed: false })
    renderRail()

    for (const [name, href] of NAV_LINKS) {
      const link = await screen.findByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
    }
  })

  it('groups the nav under the Telemetry, Pit wall and Assist section labels', async () => {
    useUiStore.setState({ railCollapsed: false })
    renderRail()

    expect(await screen.findByText('Telemetry')).toBeInTheDocument()
    expect(screen.getByText('Pit wall')).toBeInTheDocument()
    expect(screen.getByText('Assist')).toBeInTheDocument()
  })

  it('collapses section labels to a divider instead of rendering the text', async () => {
    useUiStore.setState({ railCollapsed: true })
    renderRail()

    // Section eyebrows are fully unmounted when collapsed (swapped for a
    // plain divider rule), not just visually hidden — there's no room at
    // 76px for the text, so the grouping survives as a rule instead.
    await screen.findByRole('button', { name: /expand navigation/i })
    expect(screen.queryByText('Telemetry')).not.toBeInTheDocument()
    expect(screen.queryByText('Pit wall')).not.toBeInTheDocument()
    expect(screen.queryByText('Assist')).not.toBeInTheDocument()
  })

  it('hides text labels but keeps them mounted with a title tooltip when collapsed', async () => {
    useUiStore.setState({ railCollapsed: true })
    renderRail()

    const dashboardLink = await screen.findByRole('link', { name: 'Dashboard' })
    expect(dashboardLink).toHaveAttribute('title', 'Dashboard')
    expect(screen.getByText('Dashboard')).toHaveClass('hidden')
    expect(screen.getByText('F1 StratLab')).toHaveClass('hidden')
  })

  it('shows the expand-navigation button when collapsed', async () => {
    useUiStore.setState({ railCollapsed: true })
    renderRail()

    expect(await screen.findByRole('button', { name: /expand navigation/i })).toBeInTheDocument()
  })
})
