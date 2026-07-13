import { Outlet, useLocation } from '@tanstack/react-router'
import { Rail } from './Rail'

// Route-enter animation (#33). Scoped via a plain <style> tag rather than
// index.css (off-limits for this scaffold). Deliberately `animation`, not
// `transition`: transitions need a genuine before/after style change to
// interpolate and won't fire on a fresh mount, whereas a CSS `animation`
// plays automatically the moment its element enters the DOM — which is
// exactly what the pathname-keyed remount below produces on every
// navigation. transform/opacity only (baseline-ui), guarded by
// prefers-reduced-motion.
const ROUTE_ENTER_KEYFRAMES = `
@keyframes f1sl-route-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.f1sl-route-enter { animation: f1sl-route-enter 180ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .f1sl-route-enter { animation: none; }
}
`

/**
 * Root layout: acrylic rail (left, see Rail.tsx) + a routed content plane.
 * Each page owns its own <Header/> (context chips differ per screen), so
 * Shell supplies only the chrome shared by every route. The plane carries
 * the brand hero-glow halo; Card surfaces stay opaque per the acrylic law
 * (Card.tsx), so the halo never bleeds behind data.
 */
export function Shell() {
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <div className="flex min-h-dvh">
      <Rail />
      <div className="flex flex-1 flex-col bg-bg-0 bg-[image:var(--grad-hero)] bg-top bg-no-repeat">
        <div key={pathname} className="f1sl-route-enter flex flex-1 flex-col gap-6 p-6">
          <Outlet />
        </div>
      </div>
      <style>{ROUTE_ENTER_KEYFRAMES}</style>
    </div>
  )
}
