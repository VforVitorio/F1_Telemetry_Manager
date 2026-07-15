import { forwardRef, useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'

// Titled shell for a single chart: header (title + actions slot + maximize +
// collapse), a scroll-contained body, and an optional footer strip. "Maximize"
// portals the card to a full-viewport overlay so a chart can be inspected
// without fighting a cramped dashboard grid cell; "collapse" just hides the
// body (and footer) in place, for dashboards where a driver wants to fold a
// chart they aren't using right now.
//
// Acrylic-law exception: the overlay backdrop is chrome, not a data plane, so
// `backdrop-blur` is allowed here even though data surfaces (the Card itself)
// stay solid `--bg` with a hairline border, per Card.tsx.

export interface ChartCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  /** Right-aligned header slot, e.g. a range picker or a legend toggle. */
  actions?: ReactNode
  children?: ReactNode
  /** Optional strip below the body (status / legend). Hidden while collapsed. */
  footer?: ReactNode
  defaultCollapsed?: boolean
}

export const ChartCard = forwardRef<HTMLDivElement, ChartCardProps>(function ChartCard(
  { title, actions, children, footer, defaultCollapsed = false, className, ...props },
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
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
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
          {isCollapsed ? (
            <Plus className="size-4" aria-hidden="true" />
          ) : (
            <Minus className="size-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={isMaximized ? 'Restore chart' : 'Maximize chart'}
          onClick={() => setIsMaximized((value) => !value)}
          className="size-8 px-0 text-fg-3"
        >
          {isMaximized ? (
            <Minimize2 className="size-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  )

  const body = isCollapsed ? null : <div className="flex-1 overflow-auto p-4">{children}</div>
  const footerStrip =
    isCollapsed || !footer ? null : (
      <div className="shrink-0 border-t border-hairline px-4 py-2.5">{footer}</div>
    )

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
          {footerStrip}
        </Card>
      </div>,
      document.body,
    )
  }

  return (
    <Card ref={ref} className={cn('flex flex-col', className)} {...props}>
      {header}
      {body}
      {footerStrip}
    </Card>
  )
})
