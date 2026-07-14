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
import { Card } from '@/components/Card'
import { cn } from '@/lib/cn'
import { computeBounds, computeViewBox, buildSegments } from './circuitDraw'

export interface CircuitDominationSectionProps {
  search: DashboardSearch
}

/** Streamlit gates the map behind >=2 selected drivers (a single driver has
 *  no "dominance" to compare). */
const MIN_DRIVERS_FOR_MAP = 2

/** Matches the Streamlit figure's `height=360` (60% of its original 600px). */
const MAP_HEIGHT_PX = 360

/** Screen-pixel stroke width. Paired with `vector-effect="non-scaling-stroke"`
 *  on each segment so the line reads the same thickness regardless of how
 *  large the track's coordinate range is (some circuits span thousands of
 *  metres, others a few hundred). */
const SEGMENT_STROKE_PX = 5

const SECTION_TITLE_CLASSNAME =
  'text-center text-lg font-display font-medium uppercase tracking-wide text-fg-2'

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
      <h2 className={SECTION_TITLE_CLASSNAME}>Circuit Domination</h2>
      <CircuitDominationBody
        hasSelection={hasSelection}
        hasEnoughDrivers={hasEnoughDrivers}
        isLoading={query.isLoading}
        data={query.data ?? null}
      />
    </section>
  )
}

interface CircuitDominationBodyProps {
  hasSelection: boolean
  hasEnoughDrivers: boolean
  isLoading: boolean
  data: CircuitDomination | null
}

/** Picks which of the four states to render: no selection yet, selection but
 *  too few drivers, still loading, or the resolved map (or a soft empty
 *  state if the query settled with no data). */
function CircuitDominationBody({
  hasSelection,
  hasEnoughDrivers,
  isLoading,
  data,
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
  return <CircuitMap data={data} />
}

interface CircuitMapProps {
  data: CircuitDomination
}

/** The track SVG plus its driver legend, centered in a narrower column so it
 *  reads as a focal shape rather than stretching full-bleed (Streamlit
 *  centers it in a 50%-width middle column via `st.columns([1, 2, 1])`). */
function CircuitMap({ data }: CircuitMapProps) {
  const bounds = computeBounds(data.x, data.y)
  const viewBox = computeViewBox(bounds)
  const segments = buildSegments(data.x, data.y, data.colors)

  return (
    <Card elevation="resting" className={cn('mx-auto flex w-full max-w-3xl flex-col gap-4 p-4')}>
      <div
        role="img"
        aria-label="Circuit domination map: colored by fastest driver per microsector"
        style={{ height: MAP_HEIGHT_PX }}
      >
        <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
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
            />
          ))}
        </svg>
      </div>
      <CircuitLegend drivers={data.drivers} />
    </Card>
  )
}

interface CircuitLegendProps {
  drivers: { driver: string; color: string }[]
}

/** Colour-dot legend, one swatch per driver — the SVG equivalent of the
 *  Streamlit figure's Plotly legend (invisible line traces named per driver). */
function CircuitLegend({ drivers }: CircuitLegendProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {drivers.map((entry) => (
        <div key={entry.driver} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-mono text-xs tracking-wide text-fg-2">{entry.driver}</span>
        </div>
      ))}
    </div>
  )
}
