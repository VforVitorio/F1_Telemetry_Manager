// The Comparison replay's 4-channel grid (spec §4.5): Delta, Speed, Brake,
// Throttle, each a fully static ECharts pane (ChannelPane) with a DOM-overlay
// playhead. Every chart's option is rebuilt via `useMemo` only on (model,
// theme) — never on a clock tick; the moving cursor lives entirely in
// ChannelPane's CursorOverlay/FutureDimmer.

import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChartTheme } from '@/charts/registerEcharts'
import { cn } from '@/lib/cn'
import {
  buildDeltaOption,
  buildLineOption,
  DELTA_TITLE,
  LINE_CHANNEL_KEYS,
  lineChannelTitle,
  type LineChannel,
} from './channelOptions'
import { ChannelPane } from './ChannelPane'
import type { ReplayClock, ReplayModel } from './types'

export interface ChannelGridProps {
  model: ReplayModel
  clock: ReplayClock
  /** true when the replay is paused/ready/finished → enable native
   *  axisPointer hover + `echarts.connect`; false while playing → overlays
   *  drive, hover suppressed. Forwarded straight to each ChannelPane. */
  paused: boolean
  className?: string
}

/** 2x2 grid of the 4 channel panes: Delta first (the cross-pilot summary),
 *  then Speed/Brake/Throttle in `LINE_CHANNEL_KEYS` order. */
export function ChannelGrid({ model, clock, paused, className }: ChannelGridProps) {
  const chartTheme = useChartTheme()

  // Only the delta option is theme-dependent (its y=0 markLine colour swaps per
  // mode, like ChannelChart). The line options take their colours from the
  // payload, so they rebuild on `model` alone; ChannelPane re-applies the ECharts
  // theme via its own theme-keyed remount.
  const deltaOption = useMemo(() => buildDeltaOption(model, chartTheme), [model, chartTheme])
  const speedOption = useMemo(() => buildLineOption(model, 'speed'), [model])
  const brakeOption = useMemo(() => buildLineOption(model, 'brake'), [model])
  const throttleOption = useMemo(() => buildLineOption(model, 'throttle'), [model])

  const optionByLineChannel: Record<LineChannel, EChartsOption> = {
    speed: speedOption,
    brake: brakeOption,
    throttle: throttleOption,
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>
      <ChannelPane
        title={DELTA_TITLE}
        option={deltaOption}
        model={model}
        clock={clock}
        paused={paused}
      />
      {LINE_CHANNEL_KEYS.map((channel) => (
        <ChannelPane
          key={channel}
          title={lineChannelTitle(channel)}
          option={optionByLineChannel[channel]}
          model={model}
          clock={clock}
          paused={paused}
        />
      ))}
    </div>
  )
}
