// Comparison page (#36) — FOUNDATION STUB. Replaced by the full state machine
// (idle / comparing / ready / playing / paused / finished / error) once the
// replay components land. For now it wires the route search and renders the idle
// empty state so the route compiles and renders while the components are built.

import { useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { GitCompareArrows } from 'lucide-react'
import { Header } from '@/app/Header'
import { EmptyState } from '@/components/EmptyState'
import { fromRaw } from './search'

const routeApi = getRouteApi('/comparison')

export function ComparisonPage() {
  const raw = routeApi.useSearch()
  const search = useMemo(() => fromRaw(raw), [raw])

  return (
    <>
      <Header title="Comparison" />
      <EmptyState
        icon={<GitCompareArrows className="size-8 text-fg-3" aria-hidden="true" />}
        title="Head-to-head comparison"
        description={
          search.gp
            ? `Selected ${search.gp}. Pick two drivers and compare.`
            : 'Pick a Grand Prix, session and two drivers to compare their fastest laps.'
        }
      />
    </>
  )
}
