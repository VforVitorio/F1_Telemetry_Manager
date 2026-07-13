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
  return render(<RouterProvider router={router} />)
}

describe('Rail', () => {
  it('toggles railCollapsed in the UI store on click', async () => {
    useUiStore.setState({ railCollapsed: false })
    renderRail()

    const toggle = await screen.findByRole('button', { name: /collapse navigation/i })
    fireEvent.click(toggle)

    expect(useUiStore.getState().railCollapsed).toBe(true)
  })
})
