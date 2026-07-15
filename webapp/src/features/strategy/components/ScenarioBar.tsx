// The Strategy tab's scenario-configuration bar (#35's "pit wall" entry
// point). Pure presentational, same idiom as the Dashboard's
// `SelectorsToolbar`: it only reads `search`/`lapRange` and fires single-key
// patches via `onChange` — the page owns the URL, applies the gp→driver→
// rival→laps cascade (`applyStrategyPatch`) and re-fetches `lapRange` /
// `drivers` when an upstream selector changes.
//
// Two render modes, chosen by `collapsed`:
//  - expanded (default) — the full form: GP → driver → rival cascade, the
//    lap window, risk tolerance, and the Run button. Shown before the first
//    run, or while editing an existing scenario.
//  - collapsed (after a completed run) — a one-line pill summary of the
//    scenario plus Edit/Re-run actions, so the deliberation/decision surfaces
//    below get the vertical space instead of the full form staying open.

import type { ReactNode } from 'react'
import { Pencil, Play, RotateCcw } from 'lucide-react'
import type { StrategySearch } from '../search'
import { STRATEGY_YEAR, analysedLap } from '../search'
import type { LapRange } from '@/lib/api/strategy'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Slider, DualRangeSlider } from '@/components/Slider'
import { Button } from '@/components/Button'
import { Pill } from '@/components/Pill'
import { getDriverTextColor } from '@/lib/drivers'
import { cn } from '@/lib/cn'

const RISK_STEP = 0.05
// An explicit, selectable "no rival" choice — value `''` so it round-trips
// through `Combobox`'s string-only `value`/`onChange` and can clear a
// previously-picked rival back out (a plain `undefined` can't be an option).
const NONE_RIVAL_OPTION: ComboboxOption = { value: '', label: '— None —' }

/**
 * Coarse risk-tolerance label shown next to the numeric value. Mirrors the
 * three-band posture the orchestrator itself reasons in (aggressive/balanced/
 * defensive — see `RiskPosture` in `lib/api/strategy.ts`), so the slider the
 * user drags speaks the same language as the recommendation it produces.
 */
function riskZone(risk: number): string {
  if (risk < 0.33) return 'Conservative'
  if (risk < 0.66) return 'Balanced'
  return 'Aggressive'
}

function formatRisk(risk: number): string {
  return `${risk.toFixed(2)} · ${riskZone(risk)}`
}

function toOptions(codes: string[]): ComboboxOption[] {
  return codes.map((code) => ({ value: code, label: code }))
}

/** Rival choices exclude the chosen driver (can't duel yourself) and lead
 *  with the "— None —" escape hatch so a rival, once picked, can be cleared. */
function rivalOptions(drivers: string[], driver: string | undefined): ComboboxOption[] {
  return [NONE_RIVAL_OPTION, ...toOptions(drivers.filter((code) => code !== driver))]
}

/**
 * Why the Run button can't fire yet, or `undefined` once the scenario is
 * complete. Lap readiness tolerates EITHER an explicit `search.laps` or a
 * loaded `lapRange` with none picked yet, since the lap slider itself
 * defaults to the full range the moment `lapRange` arrives — the scenario is
 * already runnable at that point, the user just hasn't touched the slider.
 */
function scenarioIssue(search: StrategySearch, lapRange: LapRange | undefined): string | undefined {
  if (!search.gp) return 'Pick a Grand Prix'
  if (!search.driver) return 'Pick a driver'
  if (!search.laps && !lapRange) return 'Pick a lap window'
  return undefined
}

const EYEBROW_CLASSNAME = 'text-xs font-medium uppercase tracking-widest text-fg-3'

/** A labelled field cell: the small uppercase eyebrow above its control,
 *  matching `SelectorsToolbar`'s eyebrow styling so both cascades read as one
 *  system. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={EYEBROW_CLASSNAME}>{label}</span>
      {children}
    </div>
  )
}

/** A driver/rival code, tinted with its team colour (brightened if the raw
 *  team hue is too dark to read as text — see `getDriverTextColor`). */
function DriverLabel({ code }: { code: string }) {
  return <span style={{ color: getDriverTextColor(code, STRATEGY_YEAR) }}>{code}</span>
}

interface ExpandedFormProps {
  search: StrategySearch
  gps: string[]
  gpsLoading: boolean
  drivers: string[]
  driversLoading: boolean
  lapRange: LapRange | undefined
  onChange: (patch: Partial<StrategySearch>) => void
  onRun: () => void
  running: boolean
}

/** The full scenario form: GP → driver → rival cascade, lap window, risk
 *  tolerance, and the Run button. */
function ExpandedForm({
  search,
  gps,
  gpsLoading,
  drivers,
  driversLoading,
  lapRange,
  onChange,
  onRun,
  running,
}: ExpandedFormProps) {
  const gpOptions = toOptions(gps)
  const driverOptions = toOptions(drivers)
  const rivalChoices = rivalOptions(drivers, search.driver)

  const lapsReady = lapRange != null
  const lapValue: [number, number] =
    search.laps ?? (lapRange ? [lapRange.min_lap, lapRange.max_lap] : [0, 0])
  const analysedLapNumber = analysedLap(search) ?? lapRange?.max_lap

  const issue = scenarioIssue(search, lapRange)
  const canRun = issue === undefined

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-bg-3 p-4">
      <Pill tone="neutral" className="w-fit">
        {STRATEGY_YEAR} season
      </Pill>

      <div className={cn('grid grid-cols-1 gap-4', 'sm:grid-cols-2', 'lg:grid-cols-3')}>
        <Field label="Grand Prix">
          <Combobox
            ariaLabel="Grand Prix"
            options={gpOptions}
            value={search.gp}
            onChange={(gp) => onChange({ gp })}
            placeholder="Select GP"
            loading={gpsLoading}
            disabled={running}
          />
        </Field>

        <Field label="Driver">
          <Combobox
            ariaLabel="Driver"
            options={driverOptions}
            value={search.driver}
            onChange={(driver) => onChange({ driver })}
            placeholder="Select driver"
            loading={driversLoading}
            disabled={running || !search.gp}
          />
        </Field>

        <Field label="Rival (optional)">
          <Combobox
            ariaLabel="Rival"
            options={rivalChoices}
            value={search.rival ?? ''}
            onChange={(rival) => onChange({ rival: rival === '' ? undefined : rival })}
            placeholder="No rival"
            disabled={running || !search.driver}
          />
        </Field>
      </div>

      <div className={cn('grid grid-cols-1 gap-4', 'sm:grid-cols-2')}>
        <Field label="Lap window">
          <div className="flex flex-col gap-2">
            {lapsReady ? (
              <DualRangeSlider
                min={lapRange?.min_lap ?? 0}
                max={lapRange?.max_lap ?? 0}
                value={lapValue}
                onValueChange={(laps) => onChange({ laps })}
                disabled={running}
              />
            ) : (
              <p className="text-xs text-fg-4">Pick a GP and driver to unlock the lap window</p>
            )}
            {analysedLapNumber != null && (
              <Pill tone="purple" className="w-fit">
                Analysing lap {analysedLapNumber}
              </Pill>
            )}
          </div>
        </Field>

        <Field label="Risk tolerance">
          <Slider
            min={0}
            max={1}
            step={RISK_STEP}
            value={search.risk}
            onValueChange={(risk) => onChange({ risk })}
            formatValue={formatRisk}
            disabled={running}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3">
        {issue ? (
          <span aria-live="polite" className="text-xs text-fg-4">
            {issue}
          </span>
        ) : null}
        <Button onClick={onRun} disabled={running || !canRun} title={running ? undefined : issue}>
          <Play className="size-4" aria-hidden="true" />
          {running ? 'Running…' : 'Run strategy'}
        </Button>
      </div>
    </div>
  )
}

interface CollapsedSummaryProps {
  search: StrategySearch
  onRun: () => void
  running: boolean
  onEdit: () => void
}

/** Compact post-run summary: the scenario as a pill row, plus Edit/Re-run. */
function CollapsedSummary({ search, onRun, running, onEdit }: CollapsedSummaryProps) {
  const lap = analysedLap(search)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-bg-3 p-3">
      {search.gp && <Pill tone="neutral">{search.gp}</Pill>}
      {search.driver && (
        <Pill tone="neutral">
          <DriverLabel code={search.driver} />
        </Pill>
      )}
      {search.rival && (
        <Pill tone="neutral">
          vs <DriverLabel code={search.rival} />
        </Pill>
      )}
      {lap != null && <Pill tone="purple">Lap {lap}</Pill>}
      <Pill tone="neutral">{formatRisk(search.risk)}</Pill>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit scenario
        </Button>
        <Button variant="ghost" size="sm" onClick={onRun} disabled={running}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Re-run
        </Button>
      </div>
    </div>
  )
}

export interface ScenarioBarProps {
  search: StrategySearch
  gps: string[]
  gpsLoading: boolean
  /** Driver codes for the chosen GP. */
  drivers: string[]
  driversLoading: boolean
  /** `{min_lap, max_lap}` for (gp, driver); undefined until loaded. */
  lapRange?: LapRange
  /** Page applies the cascade + navigates; this component only emits patches. */
  onChange: (patch: Partial<StrategySearch>) => void
  onRun: () => void
  /** A run is in-flight — locks every control. */
  running: boolean
  /** True after a completed run — render the compact chip row instead of the form. */
  collapsed: boolean
  /** Expand from collapsed back to the full form. */
  onEdit: () => void
}

/**
 * The sticky scenario bar at the top of the Strategy tab. Renders either the
 * full configuration form or, once a run has completed, a compact chip
 * summary — see the module docstring for the two-mode rationale.
 */
export function ScenarioBar({
  search,
  gps,
  gpsLoading,
  drivers,
  driversLoading,
  lapRange,
  onChange,
  onRun,
  running,
  collapsed,
  onEdit,
}: ScenarioBarProps) {
  if (collapsed) {
    return <CollapsedSummary search={search} onRun={onRun} running={running} onEdit={onEdit} />
  }

  return (
    <ExpandedForm
      search={search}
      gps={gps}
      gpsLoading={gpsLoading}
      drivers={drivers}
      driversLoading={driversLoading}
      lapRange={lapRange}
      onChange={onChange}
      onRun={onRun}
      running={running}
    />
  )
}
