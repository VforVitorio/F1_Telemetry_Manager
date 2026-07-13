import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import App from '@/App'

// Minimal router wiring (#31). The real route tree + app shell land in #33; for
// now the root renders an <Outlet /> and a single index route ('/') renders the
// placeholder App. TanStack Router is here for its typed URL search params, the
// migration's biggest UX unlock (U2-1), which the feature routes will use.
const rootRoute = createRootRoute({ component: () => <Outlet /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})

const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
