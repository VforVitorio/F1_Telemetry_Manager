// The Comparison replay's 4-channel grid (spec §4.5): Delta, Speed, Brake,
// Throttle, each a fully static ECharts pane (ChannelPane) with a DOM-overlay
// playhead. Every chart's option is rebuilt via `useMemo` only on (model,
// theme) — never on a clock tick; the moving cursor lives entirely in
// ChannelPane's CursorOverlay/FutureDimmer.

import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/stores/ui'
import {
  buildDeltaOption,
  buildLineOption,
  DELTA_LABEL,
  DELTA_UNIT,
  LINE_CHANNEL_KEYS,
  lineChannelLabel,
  lineChannelUnit,
  type LineChannel,
} from './channelOptions'
import { ChannelPane } from './ChannelPane'
import type { ReplayClock, ReplayModel, ReplayStatus } from './types'

export interface ChannelGridProps {
  model: ReplayModel
  clock: ReplayClock
  /** Forwarded straight to each ChannelPane, which derives its own `paused`
   *  (native axisPointer hover vs. DOM-overlay-driven cursor) and, for the
   *  FutureDimmer, whether the replay is still at `ready` (unveiled). */
  status: ReplayStatus
  className?: string
}

/** 2x2 grid of the 4 channel panes: Delta first (the cross-pilot summary),
 *  then Speed/Brake/Throttle in `LINE_CHANNEL_KEYS` order. */
export function ChannelGrid({ model, clock, status, className }: ChannelGridProps) {
  // The app's light/dark mode (not the ECharts theme name) — both the delta
  // markLine/curve ink and every series' `resolvePilotColor` identity colour
  // key off this one value (channelOptions.ts stays a pure builder; see its
  // module docstring). ChannelPane re-applies the registered ECharts theme
  // separately, via its own theme-keyed remount.
  const uiTheme = useUiStore((state) => state.theme)

  const deltaOption = useMemo(() => buildDeltaOption(model, uiTheme), [model, uiTheme])
  const speedOption = useMemo(
    () => buildLineOption(model, 'speed', undefined, uiTheme),
    [model, uiTheme],
  )
  const brakeOption = useMemo(
    () => buildLineOption(model, 'brake', undefined, uiTheme),
    [model, uiTheme],
  )
  const throttleOption = useMemo(
    () => buildLineOption(model, 'throttle', undefined, uiTheme),
    [model, uiTheme],
  )

  const optionByLineChannel: Record<LineChannel, EChartsOption> = {
    speed: speedOption,
    brake: brakeOption,
    throttle: throttleOption,
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>
      <ChannelPane
        label={DELTA_LABEL}
        unit={DELTA_UNIT}
        option={deltaOption}
        model={model}
        clock={clock}
        status={status}
        showSignKey
      />
      {LINE_CHANNEL_KEYS.map((channel) => (
        <ChannelPane
          key={channel}
          label={lineChannelLabel(channel)}
          unit={lineChannelUnit(channel)}
          option={optionByLineChannel[channel]}
          model={model}
          clock={clock}
          status={status}
        />
      ))}
    </div>
  )
}
