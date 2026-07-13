import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { registerF1Theme } from './registerEcharts'
import { F1_THEME } from './echartsTheme'

// Register the token theme at module load — before any chart's init runs.
// (echarts-for-react inits with the `theme` prop in componentDidMount, which
// fires before a parent's passive effect, so an effect-time registration would
// miss the first chart.)
registerF1Theme()

// Radial gauge for a bounded metric (overtake / safety-car / undercut
// probability from the sub-agents). Wraps echarts-for-react so callers never
// touch a raw ECharts option for this shape: pass a value, get a token-themed
// arc back. Progress-only design (no needle) reads cleanly at small sizes.

const PURPLE_600 = '#6c5ce7'
const HAIRLINE = 'rgba(255,255,255,0.10)'
const FG_1 = '#ffffff'
const FG_3 = 'rgba(255,255,255,0.52)'
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
}

/** Build the ECharts gauge option: hairline full-circle track, purple
 *  progress arc, no pointer/anchor, and a mono center readout formatted via
 *  `formatValue`. Pulled out of the component so the option shape is easy to
 *  read independent of the render/effect wiring. */
function buildGaugeOption({ value, max, label, formatValue }: GaugeOptionInput): EChartsOption {
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
          show: true,
          width: 10,
          itemStyle: { color: PURPLE_600 },
        },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [[1, HAIRLINE]],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          valueAnimation: true,
          formatter: (detailValue: number) => formatValue(detailValue),
          color: FG_1,
          fontFamily: MONO,
          fontSize: 24,
          fontWeight: 600,
          offsetCenter: [0, label ? '-10%' : '0%'],
        },
        title: {
          show: Boolean(label),
          offsetCenter: [0, '35%'],
          color: FG_3,
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
}

/** Radial gauge (ECharts, token-themed) for a bounded metric such as an
 *  overtake, safety-car, or undercut probability. */
export function Gauge({
  value,
  max = DEFAULT_MAX,
  label,
  formatValue = defaultFormatValue,
  height = DEFAULT_HEIGHT_PX,
}: GaugeProps) {
  const option = useMemo(
    () => buildGaugeOption({ value, max, label, formatValue }),
    [value, max, label, formatValue],
  )

  return <ReactECharts theme={F1_THEME} option={option} style={{ height }} notMerge />
}
