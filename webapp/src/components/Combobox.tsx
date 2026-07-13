import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'

// Accessible typeahead combobox: a Radix Popover (positioning, focus trap,
// outside-click / Escape dismissal) wrapping a cmdk Command (fuzzy search +
// roving keyboard nav over the option list). `MultiCombobox` shares the same
// search panel but tracks an array of values and renders the current
// selection as removable chips inside the trigger, capped by `max`.

export interface ComboboxOption {
  value: string
  label: string
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const PANEL_CLASSNAME = cn(
  'w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-divider bg-bg-4',
  'shadow-[var(--shadow-elev)] outline-none',
)

const SEARCH_INPUT_CLASSNAME =
  'h-9 w-full bg-transparent text-sm text-fg-1 outline-none placeholder:text-fg-3'

const ITEM_CLASSNAME = cn(
  'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-fg-2',
  'data-[selected=true]:bg-bg-5 data-[selected=true]:text-fg-1',
  'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
)

/** Search panel shared by `Combobox` and `MultiCombobox`: a cmdk `Command`
 *  rendered inside the popover, with a search input up top and a scrollable,
 *  keyboard-navigable item list below. */
function ComboboxPanel({ children }: { children: ReactNode }) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={4}
        style={{ zIndex: Z.dropdown }}
        className={PANEL_CLASSNAME}
      >
        <Command className="flex flex-col bg-transparent" loop>
          <div className="flex items-center gap-2 border-b border-hairline px-3">
            <SearchIcon className="size-4 shrink-0 text-fg-3" />
            <Command.Input placeholder="Search..." className={SEARCH_INPUT_CLASSNAME} />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-3">
              No results.
            </Command.Empty>
            {children}
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Portal>
  )
}

function findLabel(options: ComboboxOption[], value: string | undefined): string | undefined {
  return options.find((option) => option.value === value)?.label
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/** Single-select typeahead combobox (e.g. "pick a circuit"). */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  { options, value, onChange, placeholder = 'Select...', disabled, className },
  ref,
) {
  const [open, setOpen] = useState(false)
  const selectedLabel = findLabel(options, value)

  function handleSelect(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-bg-3 px-3 text-sm text-fg-1 transition-colors',
            'hover:bg-bg-4',
            'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selectedLabel && 'text-fg-3')}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-fg-3" />
        </button>
      </Popover.Trigger>
      <ComboboxPanel>
        {options.map((option) => (
          <Command.Item
            key={option.value}
            value={option.label}
            onSelect={() => handleSelect(option.value)}
            className={cn(ITEM_CLASSNAME, 'cursor-pointer')}
          >
            <span className="truncate">{option.label}</span>
            {option.value === value && <CheckIcon className="size-4 shrink-0 text-purple-400" />}
          </Command.Item>
        ))}
      </ComboboxPanel>
    </Popover.Root>
  )
})

export interface MultiComboboxProps {
  options: ComboboxOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** Caps how many options can be selected at once (e.g. a 3-driver comparison). */
  max?: number
  className?: string
}

/** Multi-select combobox. Selections render as removable chips in the
 *  trigger; once `max` is reached, remaining options render disabled in the
 *  list instead of silently doing nothing on select. */
export const MultiCombobox = forwardRef<HTMLDivElement, MultiComboboxProps>(function MultiCombobox(
  { options, value, onChange, placeholder = 'Select...', disabled, max, className },
  ref,
) {
  const [open, setOpen] = useState(false)
  const atMax = max !== undefined && value.length >= max
  const selectedOptions = options.filter((option) => value.includes(option.value))

  function handleOpenChange(next: boolean) {
    if (!disabled) setOpen(next)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen((current) => !current)
    }
  }

  function removeValue(target: string) {
    onChange(value.filter((v) => v !== target))
  }

  function handleSelect(nextValue: string) {
    if (value.includes(nextValue)) {
      removeValue(nextValue)
      return
    }
    if (atMax) return
    onChange([...value, nextValue])
  }

  return (
    <Popover.Root open={!disabled && open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <div
          ref={ref}
          role="combobox"
          aria-expanded={!disabled && open}
          aria-haspopup="listbox"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-bg-3 px-2 py-1.5 text-sm transition-colors',
            'hover:bg-bg-4',
            'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
        >
          {selectedOptions.length === 0 && <span className="px-1 text-fg-3">{placeholder}</span>}
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="flex items-center gap-1 rounded-full bg-bg-5 py-0.5 pl-2.5 pr-1 text-fg-1"
            >
              {option.label}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  removeValue(option.value)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="rounded-full p-0.5 text-fg-3 hover:bg-bg-4 hover:text-fg-1"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          <ChevronDownIcon className="ml-auto size-4 shrink-0 text-fg-3" />
        </div>
      </Popover.Trigger>
      <ComboboxPanel>
        {options.map((option) => {
          const selected = value.includes(option.value)
          const disabledItem = !selected && atMax
          return (
            <Command.Item
              key={option.value}
              value={option.label}
              disabled={disabledItem}
              onSelect={() => handleSelect(option.value)}
              className={cn(ITEM_CLASSNAME, !disabledItem && 'cursor-pointer')}
            >
              <span className="truncate">{option.label}</span>
              {selected && <CheckIcon className="size-4 shrink-0 text-purple-400" />}
            </Command.Item>
          )
        })}
      </ComboboxPanel>
    </Popover.Root>
  )
})
