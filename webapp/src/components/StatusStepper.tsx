import { cn } from '@/lib/cn'

// Vertical stepper that narrates a scripted, linear pipeline (the strategy
// run: fetch telemetry -> run sub-agents -> synthesize -> done). Step state
// is derived from `activeIndex` + `status` rather than tracked per-step,
// since the caller drives exactly one pipeline at a time and never needs to
// go "back" to an earlier stage.

export type StepState = 'pending' | 'active' | 'done' | 'error'

const DOT_CLASSES: Record<StepState, string> = {
  pending: 'bg-fg-4',
  active: 'bg-purple-500 motion-safe:animate-pulse',
  done: 'bg-success',
  error: 'bg-danger',
}

const LABEL_CLASSES: Record<StepState, string> = {
  pending: 'text-fg-3',
  active: 'text-fg-1 font-medium',
  done: 'text-fg-3',
  error: 'text-danger',
}

/** Resolve a step's visual state: steps before `activeIndex` are always
 *  'done', steps after it are always 'pending', and the step at
 *  `activeIndex` takes `status` (mapping the pipeline's 'running' to the
 *  pulsing 'active' dot). Exported and pure so it is unit-testable without
 *  rendering the stepper. */
export function stepState(
  index: number,
  activeIndex: number,
  status: 'running' | 'done' | 'error',
): StepState {
  if (index < activeIndex) return 'done'
  if (index > activeIndex) return 'pending'
  return status === 'running' ? 'active' : status
}

export interface StatusStep {
  id: string
  label: string
}

export interface StatusStepperProps {
  steps: StatusStep[]
  activeIndex: number
  /** State of the step at `activeIndex`. Defaults to 'running' (rendered as
   *  the pulsing 'active' dot). */
  status?: 'running' | 'done' | 'error'
}

/** Narrate a linear, scripted pipeline as a vertical list of state dots
 *  connected by a line, with the active step called out by color and a
 *  (motion-safe) pulse. */
export function StatusStepper({ steps, activeIndex, status = 'running' }: StatusStepperProps) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const state = stepState(index, activeIndex, status)
        const isLast = index === steps.length - 1
        const srState = state === 'active' ? 'in progress' : state
        return (
          <li
            key={step.id}
            className="flex gap-3"
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn('size-2.5 shrink-0 rounded-full', DOT_CLASSES[state])}
                aria-hidden="true"
              />
              {!isLast && (
                <span
                  className={cn(
                    'min-h-4 w-px flex-1',
                    index < activeIndex ? 'bg-success/40' : 'bg-hairline',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <span className={cn('pb-4 font-body text-sm', LABEL_CLASSES[state])}>
              {step.label}
              {state !== 'pending' && <span className="sr-only"> ({srState})</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
