import type { ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'

// Thin wrapper over `@radix-ui/react-tooltip`. Wrap the app once in
// `TooltipProvider` (controls the shared open/close delay), then wrap any
// single focusable/hoverable child in `Tooltip`.
//
// See the animation note in `Modal.tsx` — Radix Presence needs a real CSS
// `animation` to delay unmount, so this uses a hand-rolled `@keyframes` +
// `[animation:...]` utility rather than `transition-*`. The `<style>` tag is
// a direct child of `Tooltip`'s `Root`, not of `Portal`: Radix's
// `TooltipPortal` requires exactly one child (`React.Children.only`
// internally), so a second sibling there would crash outright, not just race
// the animation timing.

const KEYFRAMES = `
@keyframes f1-tooltip-pop { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
@media (prefers-reduced-motion: reduce) {
  .f1-anim { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

const CONTENT_CLASS = cn(
  'rounded-lg bg-bg-5 px-2 py-1 text-xs text-fg-1 shadow-[var(--shadow-card)]',
  'f1-anim',
  'data-[state=delayed-open]:[animation:f1-tooltip-pop_150ms_ease-out]',
  'data-[state=instant-open]:[animation:f1-tooltip-pop_150ms_ease-out]',
  'data-[state=closed]:[animation:f1-tooltip-pop_150ms_ease-out_reverse]',
)

export interface TooltipProps {
  children: ReactNode
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** Wraps `children` (must be a single element that forwards a ref, per Radix
 *  `asChild`) with a hover/focus tooltip showing `content`. */
export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <style>{KEYFRAMES}</style>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={CONTENT_CLASS}
          style={{ zIndex: Z.tooltip }}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-bg-5" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider
