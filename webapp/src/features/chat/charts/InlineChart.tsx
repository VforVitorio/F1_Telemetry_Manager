// The seam between the chat chart module and the rest of Chat. Whatever
// renders the `chart` display_type branch of a tool result calls this with
// the tool's real name and its raw (still-`unknown`) payload — everything
// else in this folder (payload validation, the 4 option builders, the
// dispatcher) is an implementation detail behind it.

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ChartCard } from '@/components/ChartCard'
import { Skeleton } from '@/components/Skeleton'
import { registerF1Theme, useChartTheme } from '@/charts/registerEcharts'
import { useFirstPaintAnimation } from '@/charts/useFirstPaintAnimation'
import { buildToolChartOptions, getChartTitles } from './index'

registerF1Theme()

const CHART_HEIGHT = 340
const FALLBACK_TITLE = 'Chart'
// Mounts a pane's ECharts instance a little before it actually enters the
// viewport, so the canvas is already live by the time a fast scroll reaches it.
const VISIBILITY_ROOT_MARGIN = '200px'

export interface InlineChartProps {
  toolName: string
  data: unknown
}

/**
 * Renders the chart(s) for one chat tool result inline in the message
 * thread. A payload that doesn't match its tool's expected shape (or a tool
 * name none of the 4 chart builders recognise) degrades to a compact "chart
 * unavailable" note with a raw-JSON disclosure, never a crash — the same
 * fallback discipline the rest of Chat's tool-result rendering follows.
 */
export function InlineChart({ toolName, data }: InlineChartProps) {
  const options = useMemo(() => buildToolChartOptions(toolName, data), [toolName, data])
  const titles = useMemo(() => getChartTitles(toolName, data), [toolName, data])

  if (!options || options.length === 0) {
    return (
      <details className="rounded-xl border border-hairline bg-bg-2 p-3 text-xs text-fg-3">
        <summary className="cursor-pointer select-none">Chart unavailable — raw data</summary>
        <pre className="mt-2 overflow-auto rounded-lg bg-bg-2 p-2 font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((option, index) => (
        <LazyChartPane key={index} option={option} title={titles[index] ?? FALLBACK_TITLE} />
      ))}
    </div>
  )
}

/** Mounts `ReactECharts` only once its host has scrolled into view. A chat
 *  turn can land several chart tool results in one thread, and paying
 *  ECharts' canvas-init cost for every one of them up front would visibly
 *  jank the scroll. Stays mounted once visible — scrolling past and back
 *  doesn't replay the entrance animation or re-pay the init cost. */
function LazyChartPane({ option, title }: { option: EChartsOption; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isVisible) return
    const node = containerRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsVisible(true)
      },
      { rootMargin: VISIBILITY_ROOT_MARGIN },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isVisible])

  return (
    <div ref={containerRef}>
      {isVisible ? (
        <ChartedPane option={option} title={title} />
      ) : (
        <Skeleton style={{ height: CHART_HEIGHT }} className="w-full rounded-2xl" />
      )}
    </div>
  )
}

/** The real chart host. Split out from `LazyChartPane` so the theme and
 *  first-paint-animation hooks only run once a pane is actually visible. */
function ChartedPane({ option, title }: { option: EChartsOption; title: string }) {
  const chartTheme = useChartTheme()
  const paintedOption = useFirstPaintAnimation(option)
  return (
    <ChartCard title={title} maximizable={false}>
      <div role="img" aria-label={title}>
        <ReactECharts
          theme={chartTheme}
          key={chartTheme}
          option={paintedOption}
          notMerge
          style={{ height: CHART_HEIGHT }}
        />
      </div>
    </ChartCard>
  )
}
