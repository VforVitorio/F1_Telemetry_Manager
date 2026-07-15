import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import {
  type LucideIcon,
  ArrowRightLeft,
  Crosshair,
  Flag,
  FlaskConical,
  House,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'
import { RAIL_WIDTH_MAX, RAIL_WIDTH_MIN, useUiStore } from '@/stores/ui'
import { Button } from '@/components/Button'
import { Tooltip } from '@/components/Tooltip'

// Fixed collapsed width (icon-only rail, never resizable) — the counterpart
// to `railWidth` in stores/ui.ts, which only governs the expanded state.
const RAIL_WIDTH_COLLAPSED = 76

// Keyboard step for the resize handle (role="separator"), so the control is
// operable without a pointer per the WAI-ARIA window-splitter pattern.
const RAIL_RESIZE_STEP = 16

// Shared Link styling (#33, redesigned round 2 per docs/migration/design-specs/
// app-chrome-round2.md §3 — the docs-sidebar grammar instead of a generic flat
// list). `to` stays a literal string at each JSX call site below (never
// threaded through a prop/array field) so TanStack Router's `const TTo`
// generic can infer the exact route literal instead of widening to `string`
// — that's what keeps `<Link to="...">` type-checked against the real route
// tree. `className`s are concatenated by the router (not merged via
// cn/twMerge), so `itemClass()` carries only the parts that never change;
// color comes from ACTIVE_PROPS/INACTIVE_PROPS below.
function itemClass(collapsed: boolean): string {
  return cn(
    'relative flex h-9 items-center gap-3 rounded-lg text-sm transition-colors',
    collapsed ? 'justify-center px-0' : 'px-3',
  )
}

const ACTIVE_PROPS = { className: 'text-fg-1 bg-[image:var(--grad-purple-soft)]' }
const INACTIVE_PROPS = { className: 'text-fg-3 hover:text-fg-1 hover:bg-fg-1/[0.04]' }

interface NavLinkContentProps {
  icon: LucideIcon
  label: string
  collapsed: boolean
  isActive: boolean
}

/**
 * Icon + label + active-indicator triple shared by every nav item. Rendering
 * a different child per active state needs TanStack Link's children-as-
 * function form (`{({ isActive }) => ...}`, wired up at each call site below)
 * rather than `activeProps` classNames, since the left bar and the icon
 * color both depend on `isActive`.
 *
 * The left bar is always mounted (never conditionally rendered) so its
 * `scale-y` transition actually animates when a route becomes active instead
 * of popping in — `isActive` only flips the scale, never the DOM presence.
 *
 * When the rail is collapsed the label is `hidden` (removed from the a11y
 * tree too, since `display:none` drops it from the accessibility tree), so
 * the Link's native `title` attribute becomes the accessible name and
 * doubles as the hover tooltip — no Tooltip component needed here.
 */
function NavLinkContent({ icon: Icon, label, collapsed, isActive }: NavLinkContentProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-2 left-0 w-0.5 origin-center scale-y-0 rounded-full bg-purple-400',
          'shadow-[0_0_8px_rgba(108,92,231,0.6)] transition-transform duration-150 ease-out motion-reduce:transition-none',
          isActive && 'scale-y-100',
        )}
      />
      <Icon
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn('size-4.5 shrink-0', isActive ? 'text-purple-300' : 'text-fg-4')}
      />
      <span className={cn('truncate', collapsed && 'hidden')}>{label}</span>
    </>
  )
}

/**
 * Section eyebrow above a group of nav items (docs-sidebar grammar): a tiny
 * uppercase label with a purple tick when expanded. When the rail collapses
 * to icon-only width there's no room for the label, so it swaps to a plain
 * divider rule instead — the grouping survives the collapse rather than
 * silently disappearing.
 */
function NavSectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div aria-hidden="true" className="mx-3 my-4 border-t border-hairline" />
  }
  return (
    <div className="mt-4 mb-1 flex items-center gap-2 px-3 font-display text-[10px] font-semibold tracking-widest text-fg-4 uppercase">
      <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-purple-500" />
      {label}
    </div>
  )
}

/** One labeled group of nav items (e.g. "Telemetry": Dashboard, Comparison,
 *  Lab). Pairs the section eyebrow with its `<ul>` so `Rail`'s render reads
 *  as a flat list of sections instead of repeating the label/list pairing
 *  three times. */
function NavSection({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed: boolean
  children: ReactNode
}) {
  return (
    <div>
      <NavSectionLabel label={label} collapsed={collapsed} />
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  )
}

/**
 * Acrylic left icon rail, redesigned to carry F1 StratLab's brand vocabulary
 * (docs-sidebar grouping + a brand block) instead of a generic flat list:
 * 76px collapsed / a user-resizable 200-360px expanded (default 232px),
 * driven by the shared `useUiStore` so both the collapsed state and the
 * chosen width survive navigation and reloads (persisted under `f1sl.ui`).
 *
 * Width now transitions on collapse/expand (`transition-[width]`, ~200ms,
 * `motion-reduce`-guarded) — a deliberate, narrow exception to baseline-ui's
 * transform/opacity-only rule: once the rail became resizable, a hard snap
 * on toggle read as broken next to a draggable edge. The main content pane
 * (Shell.tsx) never needs to mirror this explicitly — it's a `flex-1`
 * sibling of this `<nav>`, so the browser recomputes its box on every frame
 * of the rail's width transition for free; there's no second width value to
 * keep in lockstep.
 *
 * The transition is suppressed (`transition-none`) while the resize handle
 * is being dragged, so the edge tracks the pointer 1:1 instead of lagging
 * behind an easing curve.
 */
export function Rail() {
  const railCollapsed = useUiStore((state) => state.railCollapsed)
  const toggleRail = useUiStore((state) => state.toggleRail)
  const railWidth = useUiStore((state) => state.railWidth)
  const setRailWidth = useUiStore((state) => state.setRailWidth)

  // Drag-to-resize. `dragStartRef` holds the pointer x + rail width at the
  // moment the drag began, so `handleResizeMove` can compute an absolute
  // target width from the total pointer delta rather than accumulating
  // per-event deltas (which would drift under fast pointer moves).
  const [isResizing, setIsResizing] = useState(false)
  const dragStartRef = useRef({ x: 0, width: railWidth })

  function handleResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (railCollapsed) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = { x: event.clientX, width: railWidth }
    setIsResizing(true)
  }

  function handleResizeMove(event: PointerEvent<HTMLDivElement>) {
    if (!isResizing) return
    const delta = event.clientX - dragStartRef.current.x
    setRailWidth(dragStartRef.current.width + delta)
  }

  function handleResizeEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsResizing(false)
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setRailWidth(railWidth - RAIL_RESIZE_STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setRailWidth(railWidth + RAIL_RESIZE_STEP)
    }
  }

  return (
    <nav
      aria-label="Primary"
      style={{ zIndex: Z.rail, width: railCollapsed ? RAIL_WIDTH_COLLAPSED : railWidth }}
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col border-r border-divider bg-bg-2/70 backdrop-blur-md',
        isResizing
          ? 'transition-none'
          : 'transition-[width] duration-200 ease-out motion-reduce:transition-none',
      )}
    >
      {/* Brand block. Aligns with Header's h-14 so rail + header form one
          continuous chrome line across the top of the app. */}
      <Link
        to="/"
        activeOptions={{ exact: true }}
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline',
          railCollapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[image:var(--grad-purple)] font-mono text-[10px] font-bold text-white"
        >
          F1
        </span>
        <span
          className={cn(
            'truncate font-display text-[15px] font-semibold tracking-tight text-fg-1',
            railCollapsed && 'hidden',
          )}
        >
          F1 StratLab
        </span>
      </Link>

      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              to="/"
              activeOptions={{ exact: true }}
              title={railCollapsed ? 'Home' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={House}
                  label="Home"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
        </ul>

        <NavSection label="Telemetry" collapsed={railCollapsed}>
          <li>
            <Link
              to="/dashboard"
              title={railCollapsed ? 'Dashboard' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={LayoutDashboard}
                  label="Dashboard"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
          <li>
            <Link
              to="/comparison"
              title={railCollapsed ? 'Comparison' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={ArrowRightLeft}
                  label="Comparison"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
          <li>
            <Link
              to="/lab"
              title={railCollapsed ? 'Lab' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={FlaskConical}
                  label="Lab"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
        </NavSection>

        <NavSection label="Pit wall" collapsed={railCollapsed}>
          <li>
            <Link
              to="/strategy"
              title={railCollapsed ? 'Strategy' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={Crosshair}
                  label="Strategy"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
          <li>
            <Link
              to="/race"
              title={railCollapsed ? 'Race' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={Flag}
                  label="Race"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
        </NavSection>

        <NavSection label="Assist" collapsed={railCollapsed}>
          <li>
            <Link
              to="/chat"
              title={railCollapsed ? 'Chat' : undefined}
              className={itemClass(railCollapsed)}
              activeProps={ACTIVE_PROPS}
              inactiveProps={INACTIVE_PROPS}
            >
              {({ isActive }) => (
                <NavLinkContent
                  icon={MessageSquare}
                  label="Chat"
                  collapsed={railCollapsed}
                  isActive={isActive}
                />
              )}
            </Link>
          </li>
        </NavSection>
      </div>

      <div
        className={cn(
          'flex items-center border-t border-hairline p-3',
          railCollapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <span className={cn('font-mono text-[10px] text-fg-4', railCollapsed && 'hidden')}>
          v0.9
        </span>
        <Tooltip content={railCollapsed ? 'Expand navigation' : 'Collapse navigation'} side="right">
          <Button
            variant="ghost"
            size="sm"
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggleRail}
            className="size-8 p-0"
          >
            {railCollapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </Button>
        </Tooltip>
      </div>

      {/* Drag-to-resize handle. Absolutely positioned against the `sticky`
          nav (a positioned element, so it's a valid containing block) and
          rendered as the nav's last child, which — with no explicit z-index
          on either side — is enough for it to paint above the normal-flow
          content above it. Not rendered at all while collapsed: a collapsed
          icon-only rail has no width worth dragging. */}
      {!railCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          aria-valuenow={Math.round(railWidth)}
          aria-valuemin={RAIL_WIDTH_MIN}
          aria-valuemax={RAIL_WIDTH_MAX}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            'absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none rounded-r-sm select-none',
            'transition-colors hover:bg-purple-400/30 focus-visible:bg-purple-400/40 focus-visible:outline-none',
            isResizing && 'bg-purple-400/40',
          )}
        />
      )}
    </nav>
  )
}
