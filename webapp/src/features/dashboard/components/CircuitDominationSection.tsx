// CIRCUIT DOMINATION section (issue #34 §6.1) — Streamlit parity for
// `frontend/components/telemetry/circuit_domination.py`. The backend already
// computes microsector dominance (track rotation/scaling + per-segment
// fastest driver); this component only draws the returned x/y/colors as a
// coloured polyline. Inline SVG is the simpler pick over canvas: the map is
// a static shape that only changes when the query data changes, so there is
// no imperative redraw loop to manage, and the browser handles resizing for
// free via the `viewBox` + `preserveAspectRatio` contract (see circuitDraw.ts).
import type { DashboardSearch } from '../search'
import { useCircuitDomination } from '../queries'
import type { CircuitDomination } from '@/lib/api/telemetry'
import { TelemetryLoader } from './TelemetryLoader'
import { SectionHeader } from './SectionHeader'
import { Card } from '@/components/Card'
import { cn } from '@/lib/cn'
import { getDriverTextColor } from '@/lib/drivers'
import { computeBounds, computeViewBox, buildSegments, buildOutlinePath } from './circuitDraw'

export interface CircuitDominationSectionProps {
  search: DashboardSearch
}

/** Streamlit gates the map behind >=2 selected drivers (a single driver has
 *  no "dominance" to compare). */
const MIN_DRIVERS_FOR_MAP = 2

/** Track height. Bumped past the Streamlit figure's 360 so the circuit reads
 *  as the focal shape of the zone, with room for the coloured microsectors. */
const MAP_HEIGHT_PX = 460

/** Screen-pixel stroke width. Paired with `vector-effect="non-scaling-stroke"`
 *  on each segment so the line reads the same thickness regardless of how
 *  large the track's coordinate range is (some circuits span thousands of
 *  metres, others a few hundred). */
const SEGMENT_STROKE_PX = 5

/** Faint continuous underlay tracing the whole track, drawn once beneath the
 *  coloured microsector segments so the gaps between them don't read as a
 *  broken circuit. */
const OUTLINE_STROKE_COLOR = 'rgba(255,255,255,0.08)'

/**
 * CIRCUIT DOMINATION: a track outline coloured by whichever driver was
 * fastest through each microsector. Reads the shared dashboard `search`
 * (year/GP/session/drivers) and fetches via the frozen `useCircuitDomination`
 * query — this component owns only presentation.
 */
export function CircuitDominationSection({ search }: CircuitDominationSectionProps) {
  const hasSelection = search.year != null && !!search.gp && !!search.session
  const hasEnoughDrivers = search.drivers.length >= MIN_DRIVERS_FOR_MAP
  const query = useCircuitDomination(search)

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Circuit Domination" />
      <CircuitDominationBody
        hasSelection={hasSelection}
        hasEnoughDrivers={hasEnoughDrivers}
        isLoading={query.isLoading}
        data={query.data ?? null}
        year={search.year}
      />
    </section>
  )
}

interface CircuitDominationBodyProps {
  hasSelection: boolean
  hasEnoughDrivers: boolean
  isLoading: boolean
  data: CircuitDomination | null
  year: DashboardSearch['year']
}

/** Picks which of the four states to render: no selection yet, selection but
 *  too few drivers, still loading, or the resolved map (or a soft empty
 *  state if the query settled with no data). */
function CircuitDominationBody({
  hasSelection,
  hasEnoughDrivers,
  isLoading,
  data,
  year,
}: CircuitDominationBodyProps) {
  if (!hasSelection) {
    return <TelemetryLoader minHeight={MAP_HEIGHT_PX} />
  }
  if (!hasEnoughDrivers) {
    return (
      <p className="py-8 text-center text-sm text-fg-3">
        Select 2+ drivers to see circuit domination
      </p>
    )
  }
  if (isLoading) {
    return <TelemetryLoader minHeight={MAP_HEIGHT_PX} />
  }
  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-fg-3">
        No circuit domination data available for this selection
      </p>
    )
  }
  return <CircuitMap data={data} year={year} />
}

interface CircuitMapProps {
  data: CircuitDomination
  year: DashboardSearch['year']
}

/** Share of microsectors each driver was fastest through (0-100, rounded).
 *  Derived from the same per-microsector colour array the segments are drawn
 *  in, so the legend's "% dominated" always matches what's on the track. */
function dominationShares(
  colors: string[],
  drivers: { driver: string; color: string }[],
): Record<string, number> {
  const total = colors.length
  const shares: Record<string, number> = {}
  if (total === 0) return shares
  for (const { driver, color } of drivers) {
    const count = colors.filter((segmentColor) => segmentColor === color).length
    shares[driver] = Math.round((count / total) * 100)
  }
  return shares
}

/** The track SVG plus its driver legend. Fills its column so it reads as the
 *  focal shape of the zone; each coloured microsector carries a `<title>` so
 *  hovering the track reveals which driver was fastest through it. */
function CircuitMap({ data, year }: CircuitMapProps) {
  const bounds = computeBounds(data.x, data.y)
  const viewBox = computeViewBox(bounds)
  const outlinePoints = buildOutlinePath(data.x, data.y)
  const segments = buildSegments(data.x, data.y, data.colors)
  const colorToDriver = new Map(data.drivers.map((entry) => [entry.color, entry.driver]))
  const shares = dominationShares(data.colors, data.drivers)

  return (
    <Card elevation="resting" className={cn('mx-auto flex w-full max-w-4xl flex-col gap-4 p-4')}>
      <div
        role="img"
        aria-label="Circuit domination map: colored by fastest driver per microsector"
        style={{ height: MAP_HEIGHT_PX }}
      >
        <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <polyline
            points={outlinePoints}
            fill="none"
            stroke={OUTLINE_STROKE_COLOR}
            strokeWidth={SEGMENT_STROKE_PX}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {segments.map((segment, index) => (
            <line
              key={index}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth={SEGMENT_STROKE_PX}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="transition-opacity hover:opacity-60"
            >
              <title>{colorToDriver.get(segment.color) ?? 'Fastest'} fastest through here</title>
            </line>
          ))}
        </svg>
      </div>
      <CircuitLegend drivers={data.drivers} shares={shares} year={year} />
    </Card>
  )
}

interface CircuitLegendProps {
  drivers: { driver: string; color: string }[]
  /** driver code -> % of microsectors that driver was fastest through. */
  shares: Record<string, number>
  year: DashboardSearch['year']
}

/** Colour-dot legend, one swatch per driver, with the driver's share of the
 *  track (% of microsectors they were fastest through) in mono next to the
 *  name — the SVG equivalent of the Streamlit figure's Plotly legend, plus the
 *  at-a-glance "who dominated more" the coloured map only implies. The dot
 *  keeps the data-driven `entry.color`; the NAME is team-coloured via
 *  `getDriverTextColor` so it stays legible against the UI. */
function CircuitLegend({ drivers, shares, year }: CircuitLegendProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {drivers.map((entry) => (
        <div key={entry.driver} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span
            className="font-mono text-xs tracking-wide"
            style={{ color: getDriverTextColor(entry.driver, year) }}
          >
            {entry.driver}
          </span>
          {shares[entry.driver] != null && (
            <span className="font-mono text-xs tabular-nums text-fg-3">
              {shares[entry.driver]}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
