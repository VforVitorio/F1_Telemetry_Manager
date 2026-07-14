import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import App from '@/App'
import { Header } from './Header'
import { Shell } from './Shell'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { validateDashboardSearch } from '@/features/dashboard/search'

// Route tree wiring (#33). Root renders the app shell (acrylic rail + routed
// content plane, see Shell.tsx); the shell's <Outlet/> renders whichever leaf
// route matched below. '/' keeps rendering the temporary theme-preview App
// (#32) until the real Home lands; the rest are "coming soon" placeholders
// until their features ship (one sprint at a time). Each `createRoute` call
// keeps its `path` a literal string at the call site (not threaded through a
// prop/array) so TanStack Router's typed route tree infers the exact path
// union — that's what makes <Link to="..."> in Rail.tsx type-checked.
const rootRoute = createRootRoute({ component: () => <Shell /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})

/** Shared body for routes without a feature yet. */
function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <div className="flex flex-1 items-center justify-center">
        <p className="text-fg-3">{title} — coming soon</p>
      </div>
    </>
  )
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  validateSearch: validateDashboardSearch,
  component: DashboardPage,
})

const strategyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/strategy',
  component: () => <ComingSoon title="Strategy" />,
})

const raceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/race',
  component: () => <ComingSoon title="Race" />,
})

const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab',
  component: () => <ComingSoon title="Lab" />,
})

// Comparison shares the Dashboard's selection shape so the "Go to comparison"
// cross-link can carry year/gp/session/drivers forward (wired up in #36).
const comparisonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comparison',
  validateSearch: validateDashboardSearch,
  component: () => <ComingSoon title="Comparison" />,
})

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: () => <ComingSoon title="Chat" />,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  strategyRoute,
  raceRoute,
  labRoute,
  comparisonRoute,
  chatRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
