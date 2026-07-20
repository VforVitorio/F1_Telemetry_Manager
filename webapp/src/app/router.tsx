import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { Shell } from './Shell'
import { validateDashboardSearch } from '@/features/dashboard/search'
import { validateStrategySearch } from '@/features/strategy/search'
import { validateComparisonSearch } from '@/features/comparison/search'
import { validateRaceSearch } from '@/features/race/search'
import { validateLabSearch } from '@/features/lab/search'
import { validateChatSearch } from '@/features/chat/search'

// Each feature page is a LAZY route component so the first paint of a light tab
// (Home) doesn't download every other tab's code — the chart-heavy pages
// (Dashboard/Strategy/Comparison, all pulling ECharts) split into their own
// chunks that load on navigation (perf: the app used to ship as one ~1.9MB
// chunk). `validateSearch` stays eager — it's a tiny sync function the route
// tree needs at definition time, and importing it doesn't pull the page body.
const HomePage = lazyRouteComponent(() => import('@/features/home/HomePage'), 'HomePage')
const DashboardPage = lazyRouteComponent(
  () => import('@/features/dashboard/DashboardPage'),
  'DashboardPage',
)
const StrategyPage = lazyRouteComponent(
  () => import('@/features/strategy/StrategyPage'),
  'StrategyPage',
)
const ComparisonPage = lazyRouteComponent(
  () => import('@/features/comparison/ComparisonPage'),
  'ComparisonPage',
)
const RacePage = lazyRouteComponent(() => import('@/features/race/RacePage'), 'RacePage')
const LabPage = lazyRouteComponent(() => import('@/features/lab/LabPage'), 'LabPage')
const ChatPage = lazyRouteComponent(() => import('@/features/chat/ChatPage'), 'ChatPage')
const ThemePreview = lazyRouteComponent(() => import('@/features/dev/ThemePreview'), 'ThemePreview')

// Route tree wiring (#33). Root renders the app shell (acrylic rail + routed
// content plane, see Shell.tsx); the shell's <Outlet/> renders whichever leaf
// route matched below. '/' is the real Home (the Pit Wall launcher hub); the
// old theme-preview palette moved to the dev-only '/dev/theme' (not in the
// rail). Every rail tab now has a real feature page (Chat/#39 was the last
// "coming soon" placeholder); only Voice (#40) remains reserved, as a disabled
// toggle inside the Chat sidebar rather than a separate route. Each
// `createRoute` call keeps its `path` a literal string at the call site (not
// threaded through a prop/array) so TanStack Router's typed route tree infers
// the exact path union — that's what makes <Link to="..."> in Rail.tsx
// type-checked.
const rootRoute = createRootRoute({ component: () => <Shell /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

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

// Race Analysis (#37) — the post-race debrief room (tyres / gaps / dataset /
// radio / regulations over the 2025 featured parquet). Its own search shape (gp,
// drivers cap-3, tab, compound, radio selection, q); no session (always 2025),
// no explicit load gate.
const raceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/race',
  validateSearch: validateRaceSearch,
  component: RacePage,
})

// Model Lab (#38) — the model inspector: one of six predictors on the bench,
// fed a race moment, with its prediction / uncertainty / threshold / reasoning.
const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab',
  validateSearch: validateLabSearch,
  component: LabPage,
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

// Chat (#39) — the MCP-tool-calling assistant: real SSE token streaming, one
// tool result inline per turn. Its own search shape (active chat id, the
// text/voice mode toggle reserved for Voice #40, a never-auto-firing `ask`
// deep-link prefill).
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  validateSearch: validateChatSearch,
  component: ChatPage,
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

/** Shown for the brief moment a lazily-loaded page chunk is fetching. Kept
 *  dependency-free (no heavy loader import) so it can't itself delay the split. */
function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <span className="size-6 animate-spin rounded-full border-2 border-hairline border-t-accent" />
    </div>
  )
}

export const router = createRouter({ routeTree, defaultPendingComponent: PageFallback })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
