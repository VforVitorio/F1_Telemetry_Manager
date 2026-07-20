// The model rail: a vertical tablist of identity cards (icon, title, model-type
// chip, eval headline) with a status dot showing which models have been run
// against the current moment. Built on the shared Radix Tabs so arrow-key
// navigation and ARIA come for free. Below lg it collapses to a horizontal,
// scrollable strip of compact chips.

import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import { cn } from '@/lib/cn'
import type { ModelId } from '../search'
import type { ModelMeta } from '../models/types'

export interface ModelRailProps {
  models: ModelMeta[]
  active: ModelId
  onSelect: (id: ModelId) => void
  /** Model ids that currently have a run to show (filled status dot). */
  doneIds: Set<ModelId>
}

export function ModelRail({ models, active, onSelect, doneIds }: ModelRailProps) {
  return (
    <Tabs
      value={active}
      onValueChange={(v) => onSelect(v as ModelId)}
      orientation="vertical"
      className="w-full lg:w-60"
    >
      <TabsList
        variant="segmented"
        className="flex h-auto w-full gap-1.5 overflow-x-auto bg-transparent p-0 lg:flex-col lg:overflow-visible"
      >
        {models.map((m) => {
          const { Icon } = m
          const done = doneIds.has(m.id)
          return (
            <TabsTrigger
              key={m.id}
              value={m.id}
              className={cn(
                'group h-auto shrink-0 items-start gap-2.5 overflow-hidden rounded-xl border border-hairline bg-bg-3 px-3 py-2.5 text-left',
                'data-[state=active]:border-purple-500/60 data-[state=active]:bg-purple-600/8 data-[state=active]:shadow-[inset_2px_0_0_0_var(--purple-500)]',
                'lg:w-full',
              )}
              title={done ? 'Has a run for this moment' : 'Not run yet'}
            >
              <span className="mt-0.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full',
                    done ? 'bg-purple-400' : 'border-[1.5px] border-fg-3',
                  )}
                />
                <Icon
                  className="size-4 text-fg-2 group-data-[state=active]:text-accent"
                  aria-hidden="true"
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-display text-sm font-medium text-fg-1">{m.title}</span>
                <span
                  className="hidden truncate font-mono text-xs text-fg-3 lg:block"
                  title={m.modelChip}
                >
                  {m.modelChip}
                </span>
                <span className="hidden truncate font-mono text-xs text-fg-4 lg:block">
                  {m.evalHeadline}
                </span>
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
