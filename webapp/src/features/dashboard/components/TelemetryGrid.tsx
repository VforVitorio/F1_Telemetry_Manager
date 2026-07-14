// TELEMETRY section (issue #34, §6.1): 7 per-channel charts — Speed, Delta,
// Throttle, Brake, RPM, Gear, DRS, matching the render order in
// frontend/pages/dashboard.py — in a grid<->stack layout, each plotting one
// line per loaded driver against distance. Delta is cross-driver (needs a
// reference lap) so it renders through the dedicated `DeltaChart`; the other
// 6 channels share the generic `ChannelChart`, driven by `channels.ts`.
//
// Data comes from `useLapTelemetries`, keyed by the store's
// `selectedLapsPerDriver` (the lap chart writes to it on click-to-load).
// Until at least one lap has loaded, every card shows `TelemetryLoader`
// instead of a chart — Víctor's hard requirement, see TelemetryLoader.tsx.

import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ChartCard } from '@/components/ChartCard'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'
import type { DashboardSearch } from '../search'
import { useLapTelemetries } from '../queries'
import { useDashboardStore, type ChartLayout } from '../store'
import { SectionHeader } from './SectionHeader'
import { TelemetryLoader } from './TelemetryLoader'
import { ChannelChart, DeltaChart } from './ChannelChart'
import { CHANNELS, DELTA_TITLE } from './channels'

export interface TelemetryGridProps {
  search: DashboardSearch
}

const LAYOUT_CLASSNAMES: Record<ChartLayout, string> = {
  grid: 'grid grid-cols-1 gap-4 xl:grid-cols-2',
  stack: 'flex flex-col gap-4',
}

/** One ChartCard: its chart once at least one lap has loaded, the shared
 *  loader before that. Keeps the loader-vs-chart branch in a single place
 *  instead of repeating it per card. */
function TelemetryCard({
  title,
  hasAny,
  children,
}: {
  title: string
  hasAny: boolean
  children: ReactNode
}) {
  return <ChartCard title={title}>{hasAny ? children : <TelemetryLoader />}</ChartCard>
}

/** Human note for laps that came back without telemetry (pit / out / incomplete
 *  laps return an empty body). Mirrors the Streamlit tip that told the user to
 *  pick a different lap instead of leaving them staring at a spinner. */
function noTelemetryMessage(failedDrivers: string[]): string {
  const who = failedDrivers.length > 0 ? failedDrivers.join(', ') : 'the selected lap(s)'
  return `No telemetry for ${who} — pit, out and incomplete laps have no telemetry data. Click a different lap in the chart above (or use SELECT FASTEST LAPS).`
}

/** Full-width notice shown when every selected lap settled with no telemetry —
 *  replaces a grid of loaders that would otherwise never resolve. */
function NoTelemetryNotice({ failedDrivers }: { failedDrivers: string[] }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-hairline border-l-4 border-l-warning bg-bg-3 px-4 py-6 text-sm text-fg-2"
    >
      <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <span>{noTelemetryMessage(failedDrivers)}</span>
    </div>
  )
}

function LayoutToggle({ layout, onToggle }: { layout: ChartLayout; onToggle: () => void }) {
  const modes: { mode: ChartLayout; label: string }[] = [
    { mode: 'grid', label: 'Grid' },
    { mode: 'stack', label: 'Stack' },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border border-hairline p-1">
      {modes.map(({ mode, label }) => (
        <Button
          key={mode}
          variant={layout === mode ? 'primary' : 'ghost'}
          size="sm"
          aria-pressed={layout === mode}
          onClick={() => layout !== mode && onToggle()}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

export function TelemetryGrid({ search }: TelemetryGridProps) {
  const selectedLapsPerDriver = useDashboardStore((s) => s.selectedLapsPerDriver)
  const chartLayout = useDashboardStore((s) => s.chartLayout)
  const toggleChartLayout = useDashboardStore((s) => s.toggleChartLayout)
  const { byDriver, hasAny, isLoading, hasSelection, failedDrivers } = useLapTelemetries(
    search,
    selectedLapsPerDriver,
  )
  const { drivers, year } = search

  // Every selected lap settled with no telemetry → show one notice instead of
  // a grid of loaders that would never resolve. A PARTIAL failure (some driver
  // loaded, another didn't) still renders the charts, with a note on top.
  const settledEmpty = hasSelection && !isLoading && !hasAny
  const showPartialNote = hasAny && failedDrivers.length > 0

  // Speed leads, Delta is hardcoded second (cross-driver, not part of
  // CHANNELS), then the rest of CHANNELS in their declared order — matches
  // dashboard.py's render order (speed/delta/throttle/brake/rpm/gear/drs).
  const [speedChannel, ...restChannels] = CHANNELS

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Telemetry">
        <LayoutToggle layout={chartLayout} onToggle={toggleChartLayout} />
      </SectionHeader>

      {settledEmpty ? (
        <NoTelemetryNotice failedDrivers={failedDrivers} />
      ) : (
        <>
          {showPartialNote ? (
            <p className="text-sm text-warning">{noTelemetryMessage(failedDrivers)}</p>
          ) : null}

          <div className={cn(LAYOUT_CLASSNAMES[chartLayout])}>
            <TelemetryCard title={speedChannel.yName} hasAny={hasAny}>
              <ChannelChart
                title={speedChannel.title}
                byDriver={byDriver}
                drivers={drivers}
                year={year}
                channel={speedChannel}
              />
            </TelemetryCard>

            <TelemetryCard title={DELTA_TITLE} hasAny={hasAny}>
              <DeltaChart byDriver={byDriver} drivers={drivers} year={year} isLoading={isLoading} />
            </TelemetryCard>

            {restChannels.map((channel) => (
              <TelemetryCard key={channel.key} title={channel.yName} hasAny={hasAny}>
                <ChannelChart
                  title={channel.title}
                  byDriver={byDriver}
                  drivers={drivers}
                  year={year}
                  channel={channel}
                />
              </TelemetryCard>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
