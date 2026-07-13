import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Centered placeholder for empty lists / panels / zero search-results. One
// primary action slot only — if a screen genuinely needs two actions, that's
// a sign the call site should compose its own layout instead of overloading
// this primitive.

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-fg-2',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="text-fg-3" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-base text-fg-1">{title}</p>
        {description ? <p className="text-sm text-fg-3">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
})
