import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/cn'

// Thin Radix Slider wrapper carrying the design system's track/thumb tokens.
// Radix always models value as `number[]` (even for a single thumb); `Slider`
// converts to/from a scalar so callers don't juggle one-element arrays, while
// `DualRangeSlider` keeps Radix's native two-element tuple since that's
// already the natural shape for a min/max range control.

const ROOT_CLASSNAME = 'relative flex h-4 w-full touch-none select-none items-center'
const TRACK_CLASSNAME = 'relative h-1 w-full grow overflow-hidden rounded-full bg-bg-5'
const RANGE_CLASSNAME = 'absolute h-full rounded-full bg-purple-600'
const THUMB_CLASSNAME = cn(
  'block size-4 rounded-full bg-fg-1 shadow-[var(--shadow-card)]',
  'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
  'disabled:pointer-events-none disabled:opacity-50',
)

function formatDefault(value: number): string {
  return String(value)
}

/** Label + current-value row shown above the track. */
function SliderCaption({ label, value }: { label?: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-fg-3">
      {label && <span>{label}</span>}
      <span className="font-mono tabular-nums text-fg-2">{value}</span>
    </div>
  )
}

export interface SliderProps {
  min: number
  max: number
  step?: number
  value: number
  onValueChange: (value: number) => void
  label?: string
  formatValue?: (value: number) => string
  disabled?: boolean
  className?: string
}

/** Single-thumb slider (e.g. a lap number scrubber). */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onValueChange,
  label,
  formatValue = formatDefault,
  disabled,
  className,
}: SliderProps) {
  function handleValueChange(next: number[]) {
    onValueChange(next[0] ?? value)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <SliderCaption label={label} value={formatValue(value)} />
      <SliderPrimitive.Root
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={handleValueChange}
        disabled={disabled}
        className={ROOT_CLASSNAME}
      >
        <SliderPrimitive.Track className={TRACK_CLASSNAME}>
          <SliderPrimitive.Range className={RANGE_CLASSNAME} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={label ?? 'Value'} className={THUMB_CLASSNAME} />
      </SliderPrimitive.Root>
    </div>
  )
}

export interface DualRangeSliderProps {
  min: number
  max: number
  step?: number
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  label?: string
  formatValue?: (value: number) => string
  disabled?: boolean
  className?: string
}

/** Two-thumb range slider (e.g. a lap window or stint-length bound). */
export function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onValueChange,
  label,
  formatValue = formatDefault,
  disabled,
  className,
}: DualRangeSliderProps) {
  const [low, high] = value

  function handleValueChange(next: number[]) {
    if (next.length === 2) onValueChange([next[0] ?? low, next[1] ?? high])
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <SliderCaption label={label} value={`${formatValue(low)} - ${formatValue(high)}`} />
      <SliderPrimitive.Root
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
        minStepsBetweenThumbs={1}
        className={ROOT_CLASSNAME}
      >
        <SliderPrimitive.Track className={TRACK_CLASSNAME}>
          <SliderPrimitive.Range className={RANGE_CLASSNAME} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={`${label ?? 'Range'} minimum`}
          className={THUMB_CLASSNAME}
        />
        <SliderPrimitive.Thumb
          aria-label={`${label ?? 'Range'} maximum`}
          className={THUMB_CLASSNAME}
        />
      </SliderPrimitive.Root>
    </div>
  )
}
