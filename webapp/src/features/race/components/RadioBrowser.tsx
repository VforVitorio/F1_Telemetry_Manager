// Radio browser: a team-coloured driver rail feeding a per-lap message list
// with transcript PREVIEWS already in view — so picking a radio message never
// means guessing a lap number blind, unlike the old Streamlit lookup which
// asked for a lap number with no preview of what was actually said. Rows
// without a transcript (audio only) are shown but disabled, since there is
// nothing for the NLP pipeline to analyse yet.

import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { RACE_YEAR, type RadioDriver } from '@/lib/api/race'
import { cn } from '@/lib/cn'
import { getDriverColor } from '@/lib/drivers'

export interface RadioBrowserProps {
  /** The GP's radio corpus — one entry per driver with recorded team radio. */
  radioDrivers: RadioDriver[]
  /** Drivers selected in the context bar; seeds which rail entry opens first. */
  contextDrivers: string[]
  /** The URL-bound selected message, if any. */
  selectedDriver?: string
  selectedLap?: number
  onSelect: (driver: string | undefined, lap: number | undefined) => void
  /** Offered on the empty-corpus fallback (re-fetch after a transient failure). */
  onRetry?: () => void
}

/** First rail entry to show: the current URL selection, else the first
 *  context-bar driver that actually has a radio corpus, else just the first
 *  driver in the corpus. */
function pickInitialDriver(
  radioDrivers: RadioDriver[],
  contextDrivers: string[],
  selected?: string,
): string | undefined {
  if (selected && radioDrivers.some((d) => d.driver === selected)) return selected
  const fromContext = contextDrivers.find((code) => radioDrivers.some((d) => d.driver === code))
  return fromContext ?? radioDrivers[0]?.driver
}

export function RadioBrowser({
  radioDrivers,
  contextDrivers,
  selectedDriver,
  selectedLap,
  onSelect,
  onRetry,
}: RadioBrowserProps) {
  const [activeDriver, setActiveDriver] = useState<string | undefined>(() =>
    pickInitialDriver(radioDrivers, contextDrivers, selectedDriver),
  )

  // The corpus arrives asynchronously (empty on first render) — re-seed once
  // it lands, but only while nothing valid is active yet, so a user's own
  // rail click is never overridden by a later re-render.
  useEffect(() => {
    if (activeDriver && radioDrivers.some((d) => d.driver === activeDriver)) return
    setActiveDriver(pickInitialDriver(radioDrivers, contextDrivers, selectedDriver))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioDrivers])

  if (radioDrivers.length === 0) {
    return (
      <EmptyState
        title="No radio corpus for this GP"
        description="Use the free-text composer below instead."
        action={
          onRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      />
    )
  }

  const active = radioDrivers.find((d) => d.driver === activeDriver)
  const laps = active ? [...active.laps].sort((a, b) => a.lap - b.lap) : []

  return (
    <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {radioDrivers.map((d) => {
          const messageCount = d.laps.filter((l) => l.has_transcript).length
          const isActive = d.driver === activeDriver
          return (
            <button
              key={d.driver}
              type="button"
              onClick={() => setActiveDriver(d.driver)}
              aria-pressed={isActive}
              className={cn(
                'flex shrink-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'border-purple-500/50 bg-bg-4 text-fg-1'
                  : 'border-hairline bg-bg-3 text-fg-2 hover:bg-bg-4 hover:text-fg-1',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <span
                  className="size-2 rounded-full"
                  style={{ background: getDriverColor(d.driver, RACE_YEAR) }}
                  aria-hidden="true"
                />
                {d.driver}
              </span>
              <span className="font-mono text-xs text-fg-3">{messageCount}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        {laps.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-fg-3">No radio calls for this driver.</p>
        ) : (
          laps.map((l) => {
            const isSelected = activeDriver === selectedDriver && l.lap === selectedLap
            return (
              <button
                key={l.lap}
                type="button"
                disabled={!l.has_transcript}
                aria-pressed={isSelected}
                onClick={() => onSelect(activeDriver, l.lap)}
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'border-purple-500/60 bg-purple-600/10 text-fg-1'
                    : 'border-hairline bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg-1',
                )}
              >
                <span className="flex items-center gap-2 font-mono text-xs text-fg-3">
                  Lap {l.lap}
                  {!l.has_transcript ? <span className="text-fg-4">(audio only)</span> : null}
                </span>
                <span className="truncate">{l.text || 'No transcript preview.'}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
