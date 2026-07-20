import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Structural loading placeholders (baseline-ui: skeletons should mirror the
// shape of the real content, not a generic spinner). Both pieces are
// `aria-hidden` — they're purely visual, the loading state itself should be
// announced elsewhere (e.g. an `aria-busy` region or a visually-hidden label).

export type SkeletonProps = HTMLAttributes<HTMLDivElement>

/** Pulsing placeholder block. Give it an explicit size (`className="h-10
 *  w-32"` etc.) at the call site to match the real content it stands in for.
 *  Falls back to a static tint under `prefers-reduced-motion`. */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="presentation"
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-fg-1/8 motion-reduce:animate-none', className)}
      {...props}
    />
  )
})

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number
}

/** Stack of `Skeleton` bars mimicking a paragraph. The last line is shorter
 *  so it reads as a natural line-wrap instead of a repeated block. */
export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(function SkeletonText(
  { lines = 3, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
})
