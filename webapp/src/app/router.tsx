import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Header } from './Header'
import { Shell } from './Shell'
import { HomePage } from '@/features/home/HomePage'
import { ThemePreview } from '@/features/dev/ThemePreview'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { validateDashboardSearch } from '@/features/dashboard/search'
import { StrategyPage } from '@/features/strategy/StrategyPage'
import { validateStrategySearch } from '@/features/strategy/search'
import { ComparisonPage } from '@/features/comparison/ComparisonPage'
import { validateComparisonSearch } from '@/features/comparison/search'

// Route tree wiring (#33). Root renders the app shell (acrylic rail + routed
// content plane, see Shell.tsx); the shell's <Outlet/> renders whichever leaf
// route matched below. '/' is the real Home (the Pit Wall launcher hub); the
// old theme-preview palette moved to the dev-only '/dev/theme' (not in the
// rail). The feature-less tabs are "coming soon" placeholders until their
// features ship (one sprint at a time). Each `createRoute` call keeps its
// `path` a literal string at the call site (not threaded through a prop/array)
// so TanStack Router's typed route tree infers the exact path union — that's
// what makes <Link to="..."> in Rail.tsx type-checked.
const rootRoute = createRootRoute({ component: () => <Shell /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
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

// Strategy (#35) — the multi-agent pit wall. Its own scenario search shape
// (gp/driver/rival/laps/risk); the Home launcher maps its Year>GP>Session>Drivers
// selection onto it (GP + first two drivers → driver/rival).
const strategyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/strategy',
  validateSearch: validateStrategySearch,
  component: StrategyPage,
})

// Dev-only theme QA surface (not in the rail); the palette the migration used
// before the real Home landed.
const devThemeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/theme',
  component: ThemePreview,
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

// Comparison (#36) — the flagship time-clock replay. Shares the Dashboard's
// year/gp/session/drivers selection shape (so "Go to comparison" carries context)
// but caps drivers at 2 and adds the `compare` gate + optional `t` moment-link.
const comparisonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comparison',
  validateSearch: validateComparisonSearch,
  component: ComparisonPage,
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
  devThemeRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
