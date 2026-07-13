import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Canonical surface primitive. `glow` is reserved for the single primary card
// per screen (recommendation, replay). Acrylic law: never put backdrop-blur
// behind data; data planes are solid --bg with hairline borders.

type Elevation = 'resting' | 'elevated' | 'glow'

const ELEVATION: Record<Elevation, string> = {
  resting: 'bg-bg-3 border border-hairline shadow-[var(--shadow-card)]',
  elevated: 'bg-bg-4 border border-divider shadow-[var(--shadow-elev)]',
  glow: 'bg-bg-3 border border-purple-600/40 shadow-[var(--shadow-glow)]',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { elevation = 'resting', className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('rounded-2xl', ELEVATION[elevation], className)} {...props} />
})
