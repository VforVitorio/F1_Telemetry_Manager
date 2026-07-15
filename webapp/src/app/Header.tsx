import type { ReactNode } from 'react'
import { Z } from '@/lib/zIndex'
import { ThemeToggle } from '@/components/ThemeToggle'

export interface HeaderProps {
  title: string
  children?: ReactNode
}

/**
 * Sticky per-page header (#33). Each route renders its own instance (context
 * chips differ per screen — filters, driver pickers, export buttons), so
 * Shell does not mount this itself. Acrylic chrome: translucent + blurred,
 * per the acrylic law data surfaces (Card.tsx) never get this treatment.
 *
 * `ThemeToggle` always renders at the far right of the cluster, after the
 * page's own `children`, so every routed page gets it for free even when it
 * passes no children of its own (app-chrome-round2.md §2d).
 */
export function Header({ title, children }: HeaderProps) {
  return (
    <header
      style={{ zIndex: Z.header }}
      className="sticky top-0 flex h-14 items-center justify-between border-b border-divider bg-bg-1/80 px-6 backdrop-blur-md"
    >
      <h1 className="font-display text-lg font-semibold tracking-tight text-fg-1">{title}</h1>
      <div className="flex items-center gap-2">
        {children}
        <ThemeToggle />
      </div>
    </header>
  )
}
