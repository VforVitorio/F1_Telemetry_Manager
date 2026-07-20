// Race Analysis page: owns the URL selection, fetches the race frame once per GP
// (or reads an uploaded one), and drives the 5-tab state machine. Tyres/Gaps/
// Dataset need a loaded frame; Radio needs only the GP; Regulations needs nothing
// (so a rules question never requires downloading a race). Each tab body is a
// dumb panel fed derived, client-side-filtered data — zero refetch on filter.

import { useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Check, Flag, Link2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Header } from '@/app/Header'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/Tabs'
import { compoundVariant } from '@/lib/compounds'
import type { RaceRecord } from '@/lib/api/race'
import { useRaceData } from './queries'
import { useRaceStore } from './store'
import { applyRacePatch, fromRaw, toRaw, type RaceSearch, type RaceTab } from './search'
import { RaceContextBar, type RaceLoadedInfo } from './components/RaceContextBar'
import { TyresPanel } from './components/TyresPanel'
import { GapsPanel } from './components/GapsPanel'
import { DatasetPanel } from './components/DatasetPanel'
import { RadioPanel } from './components/RadioPanel'
import { RegulationsPanel } from './components/RegulationsPanel'

const routeApi = getRouteApi('/race')

// Stable empty fallback so the derived useMemos don't churn every render when no
// frame is loaded (a fresh `[]` each render would invalidate them).
const EMPTY_ROWS: RaceRecord[] = []

// ── Derivations over the loaded frame (pure) ─────────────────────────────────

function uniqueDrivers(rows: RaceRecord[]): string[] {
  return [...new Set(rows.map((r) => r.Driver).filter(Boolean))].sort()
}
function maxLap(rows: RaceRecord[]): number {
  return rows.reduce((max, r) => (r.LapNumber != null && r.LapNumber > max ? r.LapNumber : max), 0)
}
/** Compounds present, deduped and ordered soft→wet (only branded ones). */
function frameCompounds(rows: RaceRecord[]): string[] {
  const seen = new Set(rows.map((r) => r.Compound).filter((c) => compoundVariant(c)))
  const order = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']
  return order.filter((c) => [...seen].some((s) => compoundVariant(s) === c))
}

/** Top 3 drivers by FINAL-lap position — the one-click starting selection for
 *  the line charts (a driver's last logged lap holds their finishing order). */
function podiumDrivers(rows: RaceRecord[], drivers: string[]): string[] {
  const finalPosition = new Map<string, number>()
  for (const driver of drivers) {
    let bestLap = -1
    let position: number | null = null
    for (const row of rows) {
      if (row.Driver !== driver || row.Position == null || row.LapNumber == null) continue
      if (row.LapNumber > bestLap) {
        bestLap = row.LapNumber
        position = row.Position
      }
    }
    if (position != null) finalPosition.set(driver, position)
  }
  return [...finalPosition.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([driver]) => driver)
}

export function RacePage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])

  /** Cascade + navigate (GP change clears drivers/compound/radio selection). */
  const patch = (p: Partial<RaceSearch>) => {
    if (applyRacePatch(search, p) === search) return
    void navigate({ search: (prev) => toRaw(applyRacePatch(fromRaw(prev), p)) })
  }

  // An uploaded offline frame takes precedence over the fetched one.
  const upload = useRaceStore((s) => s.upload)
  const raceQuery = useRaceData(upload ? undefined : search.gp)
  const frame = useMemo(() => upload?.rows ?? raceQuery.data ?? EMPTY_ROWS, [upload, raceQuery.data])
  const loading = !upload && !!search.gp && raceQuery.isLoading
  const isError = !upload && !!search.gp && raceQuery.isError

  const driverOptions = useMemo(() => uniqueDrivers(frame), [frame])
  // Only keep selected drivers that actually exist in the loaded frame — a stale
  // URL selection (or an uploaded frame with different drivers) otherwise filters
  // everything away and shows a false "no laps" state.
  const selected = useMemo(
    () => search.drivers.filter((d) => driverOptions.includes(d)),
    [search.drivers, driverOptions],
  )
  const hasSelection = selected.length > 0
  const podium = useMemo(() => podiumDrivers(frame, driverOptions), [frame, driverOptions])
  // Tyres/Gaps see only the selected drivers (or the whole field if none picked).
  const filtered = useMemo(
    () => (hasSelection ? frame.filter((r) => selected.includes(r.Driver)) : frame),
    [frame, selected, hasSelection],
  )
  // Identity of the loaded frame — remounts driver-selecting children (GapsPanel's
  // highlight state) when the race changes, so a highlight can't outlive its data.
  const frameKey = upload ? `upload:${upload.name}` : (search.gp ?? 'none')
  const loaded: RaceLoadedInfo | null = frame.length
    ? {
        rows: frame.length,
        drivers: driverOptions.length,
        laps: maxLap(frame),
        compounds: frameCompounds(frame),
      }
    : null

  const hasData = frame.length > 0

  /** Wrap a data-tab body in the idle / loading / error states. */
  const dataBody = (panel: React.ReactNode): React.ReactNode => {
    if (!search.gp && !upload) {
      return (
        <EmptyState
          icon={<Flag className="size-6" />}
          title="Pick a Grand Prix to begin"
          description="Load a 2025 race to explore its tyres, gaps and full dataset. Or ask the regulations, which needs nothing loaded."
        />
      )
    }
    if (loading) {
      return (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      )
    }
    if (isError) {
      return (
        <Card elevation="resting" className="flex flex-col items-center gap-3 p-8 text-center">
          <TriangleAlert className="size-6 text-danger" aria-hidden="true" />
          <p className="text-sm text-fg-2">Couldn&apos;t load this race.</p>
          <Button size="sm" variant="ghost" onClick={() => void raceQuery.refetch()}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
          </Button>
        </Card>
      )
    }
    return panel
  }

  return (
    <>
      <Header title="Race Analysis">
        <CopyLinkButton />
      </Header>

      <div className="flex flex-col gap-6">
        <div className="sticky top-14 z-20 -mx-6 border-b border-hairline bg-bg-1/85 px-6 py-3 backdrop-blur">
          <RaceContextBar
            value={search}
            onChange={patch}
            driverOptions={driverOptions}
            loaded={loaded}
            loading={loading}
          />
        </div>

        <Tabs value={search.tab} onValueChange={(tab) => patch({ tab: tab as RaceTab })}>
          <TabsList variant="underline">
            <TabsTrigger value="tyres" disabled={!hasData}>
              Tyres
            </TabsTrigger>
            <TabsTrigger value="gaps" disabled={!hasData}>
              Gaps
            </TabsTrigger>
            <TabsTrigger value="dataset" disabled={!hasData}>
              Dataset
            </TabsTrigger>
            <TabsTrigger value="radio" disabled={!search.gp}>
              Radio
            </TabsTrigger>
            <TabsTrigger value="regs">Regulations</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="tyres">
              {dataBody(
                <TyresPanel
                  rows={filtered}
                  compound={search.compound}
                  onCompound={(compound) => patch({ compound })}
                  hasSelection={hasSelection}
                  podium={podium}
                  onPick={(drivers) => patch({ drivers })}
                />,
              )}
            </TabsContent>
            <TabsContent value="gaps">
              {dataBody(
                <GapsPanel
                  key={frameKey}
                  rows={filtered}
                  hasSelection={hasSelection}
                  podium={podium}
                  onPick={(drivers) => patch({ drivers })}
                />,
              )}
            </TabsContent>
            <TabsContent value="dataset">
              {dataBody(<DatasetPanel rows={frame} selectedDrivers={selected} />)}
            </TabsContent>
            <TabsContent value="radio">
              {search.gp ? (
                <RadioPanel
                  gp={search.gp}
                  drivers={selected}
                  rdriver={search.rdriver}
                  rlap={search.rlap}
                  rmsg={search.rmsg}
                  onSelect={(rdriver, rlap, rmsg) => patch({ rdriver, rlap, rmsg })}
                />
              ) : (
                <EmptyState title="Pick a Grand Prix" description="Radio needs a race selected." />
              )}
            </TabsContent>
            <TabsContent value="regs">
              <RegulationsPanel initialQuestion={search.q} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </>
  )
}

/** Header action: copy the current view's deep link. */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}
