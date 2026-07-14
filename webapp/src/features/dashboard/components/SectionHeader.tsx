import type { ReactNode } from 'react'

/**
 * One consistent section header for the whole Dashboard: left-aligned, uppercase
 * eyebrow with a brand-purple tick, and an optional right slot for section-level
 * controls (e.g. the grid/stack toggle). Replaces the mix of centered/left
 * titles the migrated sections started with.
 */
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-sm font-medium uppercase tracking-widest text-fg-3">
        <span aria-hidden="true" className="inline-block h-4 w-0.5 rounded-full bg-purple-600" />
        {title}
      </h2>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
