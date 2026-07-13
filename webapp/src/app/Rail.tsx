import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'
import { useUiStore } from '@/stores/ui'
import { Button } from '@/components/Button'

// Shared Link styling (#33). `to` stays a literal string at each JSX call
// site below (never threaded through a prop/array field) so TanStack
// Router's `const TTo` generic can infer the exact route literal instead of
// widening to `string` — that's what keeps `<Link to="...">` type-checked
// against the real route tree. `className`'s are concatenated by the router
// (not merged via cn/twMerge), so LINK_CLASS carries only the parts that
// never change; color comes from ACTIVE/INACTIVE_PROPS.
const LINK_CLASS = 'flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors'
const ACTIVE_PROPS = { className: 'bg-bg-4 text-fg-1' }
const INACTIVE_PROPS = { className: 'text-fg-3 hover:text-fg-1' }

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function HomeIcon() {
  return (
    <NavIcon>
      <path d="M3 9.5 10 4l7 5.5" />
      <path d="M5 8.5V16h10V8.5" />
    </NavIcon>
  )
}

function DashboardIcon() {
  return (
    <NavIcon>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </NavIcon>
  )
}

function StrategyIcon() {
  return (
    <NavIcon>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.5" fill="currentColor" stroke="none" />
    </NavIcon>
  )
}

function RaceIcon() {
  return (
    <NavIcon>
      <path d="M5 3v14" />
      <path d="M5 4h10l-2.5 3L15 10H5" />
    </NavIcon>
  )
}

function LabIcon() {
  return (
    <NavIcon>
      <path d="M8 3h4" />
      <path d="M9 3v5.5L4.7 14.8a1.4 1.4 0 0 0 1.2 2.2h8.2a1.4 1.4 0 0 0 1.2-2.2L11 8.5V3" />
      <path d="M6.7 12.5h6.6" />
    </NavIcon>
  )
}

function ComparisonIcon() {
  return (
    <NavIcon>
      <path d="M6 16V8" />
      <path d="M14 16V4" />
      <path d="M3 16h14" />
    </NavIcon>
  )
}

function ChatIcon() {
  return (
    <NavIcon>
      <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 15 13H8l-3.5 3v-3H5a1.5 1.5 0 0 1-1.5-1.5v-6Z" />
    </NavIcon>
  )
}

/** Chevron toggle for the collapse button; rotates 180° (transform-only, so
 *  it stays cheap and respects prefers-reduced-motion) to flip meaning from
 *  "collapse" (points in) to "expand" (points out). */
function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        'size-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
        collapsed && 'rotate-180',
      )}
    >
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  )
}

interface NavLinkContentProps {
  icon: ReactNode
  label: string
  collapsed: boolean
}

/** Icon + label pair shared by every nav item. When the rail is collapsed the
 *  label is `hidden` (removed from the a11y tree too), so the Link's native
 *  `title` attribute becomes its accessible name and doubles as the hover
 *  tooltip — no Tooltip component needed for this scaffold. */
function NavLinkContent({ icon, label, collapsed }: NavLinkContentProps) {
  return (
    <>
      <span className="shrink-0">{icon}</span>
      <span className={cn('truncate text-sm', collapsed && 'hidden')}>{label}</span>
    </>
  )
}

/**
 * Acrylic left icon rail: 72px collapsed / 220px expanded, driven by the
 * shared `useUiStore` so the collapsed state survives navigation and reloads
 * (persisted under `f1sl.ui`). Width itself is never transitioned — baseline-ui
 * restricts animation to transform/opacity (cheap, compositor-only); a width
 * change is a layout property, so it snaps instantly instead.
 */
export function Rail() {
  const railCollapsed = useUiStore((state) => state.railCollapsed)
  const toggleRail = useUiStore((state) => state.toggleRail)

  return (
    <nav
      aria-label="Primary"
      style={{ zIndex: Z.rail }}
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col border-r border-divider bg-bg-2/80 backdrop-blur-md',
        railCollapsed ? 'w-[72px]' : 'w-[220px]',
      )}
    >
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <li>
          <Link
            to="/"
            activeOptions={{ exact: true }}
            title={railCollapsed ? 'Home' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<HomeIcon />} label="Home" collapsed={railCollapsed} />
          </Link>
        </li>
        <li>
          <Link
            to="/dashboard"
            title={railCollapsed ? 'Dashboard' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<DashboardIcon />} label="Dashboard" collapsed={railCollapsed} />
          </Link>
        </li>
        <li>
          <Link
            to="/strategy"
            title={railCollapsed ? 'Strategy' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<StrategyIcon />} label="Strategy" collapsed={railCollapsed} />
          </Link>
        </li>
        <li>
          <Link
            to="/race"
            title={railCollapsed ? 'Race' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<RaceIcon />} label="Race" collapsed={railCollapsed} />
          </Link>
        </li>
        <li>
          <Link
            to="/lab"
            title={railCollapsed ? 'Lab' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<LabIcon />} label="Lab" collapsed={railCollapsed} />
          </Link>
        </li>
        <li>
          <Link
            to="/comparison"
            title={railCollapsed ? 'Comparison' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent
              icon={<ComparisonIcon />}
              label="Comparison"
              collapsed={railCollapsed}
            />
          </Link>
        </li>
        <li>
          <Link
            to="/chat"
            title={railCollapsed ? 'Chat' : undefined}
            activeProps={ACTIVE_PROPS}
            inactiveProps={INACTIVE_PROPS}
            className={LINK_CLASS}
          >
            <NavLinkContent icon={<ChatIcon />} label="Chat" collapsed={railCollapsed} />
          </Link>
        </li>
      </ul>

      <div className="border-t border-divider p-3">
        <Button
          variant="ghost"
          size="sm"
          aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={toggleRail}
          className="w-full justify-center"
        >
          <CollapseIcon collapsed={railCollapsed} />
        </Button>
      </div>
    </nav>
  )
}
