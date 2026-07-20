import {
  createContext,
  forwardRef,
  useContext,
  type ComponentRef,
  type ComponentPropsWithoutRef,
} from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'

// Thin token wrapper around Radix Tabs. Keyboard navigation, roving focus and
// ARIA wiring all come from Radix; this file only adds the F1 StratLab visual
// language. The active-state treatment (underline vs filled segment) lives on
// the trigger, not the list, so TabsList broadcasts its `variant` down to
// TabsTrigger via context rather than every call site repeating it.

type TabsListVariant = 'underline' | 'segmented'

const TabsListVariantContext = createContext<TabsListVariant>('underline')

/** Re-exported as-is: Radix's Root carries no visual state of its own. */
export const Tabs = TabsPrimitive.Root

const LIST_VARIANTS: Record<TabsListVariant, string> = {
  underline: 'gap-6 border-b border-hairline',
  segmented: 'gap-1 rounded-lg bg-bg-3 p-1',
}

export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: TabsListVariant
}

export const TabsList = forwardRef<ComponentRef<typeof TabsPrimitive.List>, TabsListProps>(
  function TabsList({ variant = 'underline', className, ...props }, ref) {
    return (
      <TabsListVariantContext.Provider value={variant}>
        <TabsPrimitive.List
          ref={ref}
          className={cn('inline-flex items-center', LIST_VARIANTS[variant], className)}
          {...props}
        />
      </TabsListVariantContext.Provider>
    )
  },
)

const TRIGGER_VARIANTS: Record<TabsListVariant, string> = {
  underline:
    'border-b-2 border-transparent pb-3 text-fg-3 hover:text-fg-2 data-[state=active]:border-purple-600 data-[state=active]:text-fg-1',
  segmented:
    'rounded-lg px-3 py-1.5 text-fg-3 hover:text-fg-2 data-[state=active]:bg-bg-5 data-[state=active]:text-fg-1 data-[state=active]:shadow-sm',
}

export const TabsTrigger = forwardRef<
  ComponentRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  const variant = useContext(TabsListVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center whitespace-nowrap text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        TRIGGER_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
})

export const TabsContent = forwardRef<
  ComponentRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  )
})
