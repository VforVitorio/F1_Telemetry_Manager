// The shared bench scaffold + the kit every model's ResultView composes, so all
// six read the same: run header (title, model-type chip, run-context timestamp,
// Run/Cancel) -> verdict row -> viz zone -> reasoning disclosure. RunFrame is
// the outer Card that LabPage renders for the active model; the exported pieces
// (RunControls, RanContextChip, ReasoningDisclosure, StaleBanner, IdleHero,
// VerdictRow, ModelTypeChip) keep each ResultView thin and consistent.

import { useEffect, useState } from 'react'
import { Brain, ChevronRight, Play, RotateCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Markdown } from '@/components/Markdown'
import type { ModelDef, ModelMeta, ResultViewProps } from '../models/types'

/** Seconds since the run started, updated ~4x/s while `active`, reset to 0 when
 *  it ends. Drives the pace-range "typically 45-60 s" elapsed readout. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setSeconds((Date.now() - start) / 1000), 250)
    return () => clearInterval(id)
  }, [active])
  return seconds
}

/** The model-type pill, e.g. "TCN + MC-Dropout". */
export function ModelTypeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-hairline bg-bg-4 px-2 py-0.5 font-mono text-xs text-fg-3">
      {children}
    </span>
  )
}

/** The run header every ResultView shows: title + model-type chip on the left,
 *  a run-context chip + Run/Cancel controls on the right. */
export function RunHeader({
  title,
  modelChip,
  right,
}: {
  title: string
  modelChip: string
  right: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-sm font-medium text-fg-1">{title}</h3>
        <ModelTypeChip>{modelChip}</ModelTypeChip>
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  )
}

/** The Run / Cancel control with an optional elapsed timer and a
 *  disabled-with-reason tooltip. */
export function RunControls({
  isRunning,
  onRun,
  onCancel,
  disabledReason,
  elapsed,
}: {
  isRunning: boolean
  onRun: () => void
  onCancel?: () => void
  disabledReason?: string
  elapsed?: number
}) {
  if (isRunning) {
    return (
      <div className="flex items-center gap-2">
        {elapsed != null ? (
          <span className="font-mono text-xs tabular-nums text-fg-3">{elapsed.toFixed(1)}s</span>
        ) : null}
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="size-3.5" aria-hidden="true" />
            Cancel
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <Button size="sm" onClick={onRun} disabled={!!disabledReason} title={disabledReason}>
      <Play className="size-3.5" aria-hidden="true" />
      Run
    </Button>
  )
}

/** A pinned "ran · Lap 18 · 14:32" chip so a shown result never reads as the
 *  next run's input. */
export function RanContextChip({ label }: { label: string }) {
  return <span className="font-mono text-xs text-fg-3">ran · {label}</span>
}

/** The amber stale banner: the bench moved on from the run's context. */
export function StaleBanner({ message, onRerun }: { message: string; onRerun: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-fg-1">
      <span className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
        {message}
      </span>
      <Button size="sm" variant="ghost" onClick={onRerun}>
        <RotateCw className="size-3.5" aria-hidden="true" />
        Re-run
      </Button>
    </div>
  )
}

/** A flex row for a model's verdict pills + stat cards, stretched to one shared
 *  height so a qualitative verdict cell reads as tall as its neighboring
 *  StatCards instead of floating mid-height between them. */
export function VerdictRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-stretch gap-3">{children}</div>
}

/** The agent's reasoning, one disclosure away, never truncated. */
export function ReasoningDisclosure({ reasoning }: { reasoning: string }) {
  if (!reasoning) return null
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-widest text-fg-3 uppercase marker:content-none">
        <Brain className="size-3.5" aria-hidden="true" />
        Agent reasoning
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="prose-sm mt-2 rounded-lg bg-bg-2 px-3 py-2 text-fg-2">
        <Markdown>{reasoning}</Markdown>
      </div>
    </details>
  )
}

/** The idle hero shown before a model has run: what it does, its eval headline,
 *  and the Run button (disabled-with-reason until the context is complete). */
export function IdleHero({
  meta,
  disabledReason,
  onRun,
}: {
  meta: ModelMeta
  disabledReason?: string
  onRun: () => void
}) {
  const { Icon } = meta
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl border border-hairline bg-bg-3 text-fg-2">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="font-display text-base font-medium text-fg-1">{meta.title}</h3>
      <div className="flex flex-col gap-1">
        <p className="max-w-md text-sm text-fg-2">{meta.blurb}</p>
        <p className="font-mono text-xs text-fg-4">
          {meta.modelChip} · {meta.evalHeadline}
        </p>
      </div>
      <RunControls isRunning={false} onRun={onRun} disabledReason={disabledReason} />
    </div>
  )
}

/** The outer bench Card. LabPage renders it for the active model; the ResultView
 *  owns everything inside (run controls, verdict, viz, reasoning). */
export function RunFrame({ def, ...props }: { def: ModelDef } & ResultViewProps) {
  const { ResultView } = def
  return (
    <Card elevation="resting" className="flex flex-col gap-4 p-4 lg:min-h-120">
      <ResultView {...props} />
    </Card>
  )
}
