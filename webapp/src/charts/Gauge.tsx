import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { registerF1Theme, useChartTheme } from './registerEcharts'
import { F1_LIGHT_THEME } from './echartsTheme'

// Register the token theme at module load — before any chart's init runs.
// (echarts-for-react inits with the `theme` prop in componentDidMount, which
// fires before a parent's passive effect, so an effect-time registration would
// miss the first chart.)
registerF1Theme()

// Radial gauge for a bounded metric (overtake / safety-car / undercut
// probability from the sub-agents). Wraps echarts-for-react so callers never
// touch a raw ECharts option for this shape: pass a value, get a token-themed
// arc back. Progress-only design (no needle) reads cleanly at small sizes.

// The gauge's track/detail/title colors are set per-series (ECharts merges a
// series-level `itemStyle`/`color` over the registered theme's defaults), so
// swapping the registered `theme` prop alone does not re-color them — they
// need their own light/dark palette here, mirroring echartsTheme.ts's swap.
const PURPLE_600 = '#6c5ce7' // identity color — same accent in both themes

interface GaugePalette {
  hairline: string
  fg1: string
  fg3: string
}

const DARK_GAUGE_PALETTE: GaugePalette = {
  hairline: 'rgba(255,255,255,0.10)',
  fg1: '#ffffff',
  fg3: 'rgba(255,255,255,0.52)',
}

const LIGHT_GAUGE_PALETTE: GaugePalette = {
  hairline: 'rgba(20,18,31,0.10)',
  fg1: '#14121f',
  fg3: 'rgba(20,18,31,0.58)',
}

const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"
const DISPLAY = "'Space Grotesk Variable', system-ui, sans-serif"

const DEFAULT_MAX = 1
const DEFAULT_HEIGHT_PX = 200

/** Default formatter: treats `value` as a 0-1 probability and renders it as
 *  a rounded percentage (0.873 -> "87%"). */
function defaultFormatValue(value: number): string {
  return `${Math.round(value * 100)}%`
}

interface GaugeOptionInput {
  value: number
  max: number
  label: string | undefined
  formatValue: (value: number) => string
  palette: GaugePalette
  threshold: number | undefined
}

/** Axis-line colour stops for the track. With a `threshold` set, a short
 *  high-contrast tick is stamped at that fraction of the scale so a probability
 *  can be read against the model's real decision line, no extra series needed.
 *  The tick shows through until the progress arc passes it; the numeric caption
 *  below the gauge carries the threshold value at all times. */
function trackColorStops(
  palette: GaugePalette,
  threshold: number | undefined,
  max: number,
): Array<[number, string]> {
  if (threshold == null || max <= 0) return [[1, palette.hairline]]
  const at = Math.min(Math.max(threshold / max, 0), 1)
  const eps = 0.01
  const lo = Math.max(at - eps, 0)
  const hi = Math.min(at + eps, 1)
  return [
    [lo, palette.hairline],
    [hi, palette.fg1],
    [1, palette.hairline],
  ]
}

/** Build the ECharts gauge option: hairline full-circle track, purple
 *  progress arc, no pointer/anchor, and a mono center readout formatted via
 *  `formatValue`. Pulled out of the component so the option shape is easy to
 *  read independent of the render/effect wiring. */
function buildGaugeOption({
  value,
  max,
  label,
  formatValue,
  palette,
  threshold,
}: GaugeOptionInput): EChartsOption {
  return {
    series: [
      {
        type: 'gauge',
        min: 0,
        max,
        startAngle: 210,
        endAngle: -30,
        radius: '90%',
        pointer: { show: false },
        progress: {
          show: value > 0,
          width: 10,
          roundCap: true,
          itemStyle: { color: PURPLE_600 },
        },
        axisLine: {
          lineStyle: {
            width: 10,
            color: trackColorStops(palette, threshold, max),
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          valueAnimation: true,
          formatter: (detailValue: number) => formatValue(detailValue),
          color: palette.fg1,
          fontFamily: MONO,
          fontSize: 24,
          fontWeight: 600,
          offsetCenter: [0, label ? '-10%' : '0%'],
        },
        title: {
          show: Boolean(label),
          offsetCenter: [0, '35%'],
          color: palette.fg3,
          fontFamily: DISPLAY,
          fontSize: 12,
        },
        data: [{ value, name: label ?? '' }],
      },
    ],
  }
}

export interface GaugeProps {
  value: number
  /** Upper bound of the gauge scale. Defaults to 1 (a 0-1 probability). */
  max?: number
  label?: string
  /** Formats the center readout. Defaults to a rounded percentage, so
   *  `value` is assumed to be a 0-1 probability unless overridden. */
  formatValue?: (value: number) => string
  /** Chart height in px. Defaults to 200. */
  height?: number
  /** The model's decision threshold on the same scale as `value`. When set, a
   *  tick marks it on the track and a caption states it, so a probability reads
   *  against the line the model actually acts on (e.g. 0.80 for overtake). */
  threshold?: number
  /** Caption under the gauge. Defaults to "Action threshold <formatted>". */
  thresholdLabel?: string
}

/** Radial gauge (ECharts, token-themed) for a bounded metric such as an
 *  overtake, safety-car, or undercut probability. */
export function Gauge({
  value,
  max = DEFAULT_MAX,
  label,
  formatValue = defaultFormatValue,
  height = DEFAULT_HEIGHT_PX,
  threshold,
  thresholdLabel,
}: GaugeProps) {
  const chartTheme = useChartTheme()
  const palette = chartTheme === F1_LIGHT_THEME ? LIGHT_GAUGE_PALETTE : DARK_GAUGE_PALETTE
  const option = useMemo(
    () => buildGaugeOption({ value, max, label, formatValue, palette, threshold }),
    [value, max, label, formatValue, palette, threshold],
  )

  return (
    <div className="flex flex-col items-center">
      <ReactECharts
        theme={chartTheme}
        key={chartTheme}
        option={option}
        style={{ height, width: '100%' }}
        notMerge
      />
      {threshold != null ? (
        <p className="-mt-8 text-xs text-fg-3">
          {thresholdLabel ?? `Action threshold ${formatValue(threshold)}`}
        </p>
      ) : null}
    </div>
  )
}
