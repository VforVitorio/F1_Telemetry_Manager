import { forwardRef, useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'

// Titled shell for a single chart: header (title + actions slot + maximize +
// collapse) and a scroll-contained body. "Maximize" portals the card to a
// full-viewport overlay so a chart can be inspected without fighting a
// cramped dashboard grid cell; "collapse" just hides the body in place, for
// dashboards where a driver wants to fold a chart they aren't using right now.
//
// Acrylic-law exception: the overlay backdrop is chrome, not a data plane, so
// `backdrop-blur` is allowed here even though data surfaces (the Card itself)
// stay solid `--bg` with a hairline border, per Card.tsx.
//
// No icon package is installed yet, so the maximize/restore glyphs are small
// inline SVGs rather than a new dependency for two icons.

function MaximizeGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RestoreGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export interface ChartCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  /** Right-aligned header slot, e.g. a range picker or a legend toggle. */
  actions?: ReactNode
  children?: ReactNode
  defaultCollapsed?: boolean
}

export const ChartCard = forwardRef<HTMLDivElement, ChartCardProps>(function ChartCard(
  { title, actions, children, defaultCollapsed = false, className, ...props },
  ref,
) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  // Escape restores the maximized overlay, matching standard dialog behavior
  // even though this isn't a Radix Dialog (no focus trap needed here since
  // the card is still same-page content, just repositioned full-viewport).
  useEffect(() => {
    if (!isMaximized) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMaximized(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMaximized])

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
      <h3 className="truncate font-display text-sm font-medium text-fg-1">{title}</h3>
      <div className="flex items-center gap-1">
        {actions}
        <Button
          variant="ghost"
          size="sm"
          aria-label={isCollapsed ? 'Expand chart' : 'Collapse chart'}
          onClick={() => setIsCollapsed((value) => !value)}
          className="size-8 px-0 text-fg-3"
        >
          {isCollapsed ? '+' : '–'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={isMaximized ? 'Restore chart' : 'Maximize chart'}
          onClick={() => setIsMaximized((value) => !value)}
          className="size-8 px-0 text-fg-3"
        >
          {isMaximized ? <RestoreGlyph /> : <MaximizeGlyph />}
        </Button>
      </div>
    </div>
  )

  const body = isCollapsed ? null : <div className="flex-1 overflow-auto p-4">{children}</div>

  if (isMaximized) {
    return createPortal(
      <div
        role="dialog"
        aria-label={title}
        className="fixed inset-0 flex items-center justify-center bg-bg-0/95 p-6 backdrop-blur-md"
        style={{ zIndex: Z.overlay }}
      >
        <Card
          ref={ref}
          elevation="elevated"
          className={cn('flex h-full w-full flex-col', className)}
          {...props}
        >
          {header}
          {body}
        </Card>
      </div>,
      document.body,
    )
  }

  return (
    <Card ref={ref} className={cn('flex flex-col', className)} {...props}>
      {header}
      {body}
    </Card>
  )
})
