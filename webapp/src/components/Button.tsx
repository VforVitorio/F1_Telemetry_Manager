import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Canonical primitive (style reference for the rest of the design system):
// forwardRef, variant/size lookup maps, cn() for classes, semantic token
// utilities only (no hex), visible focus ring, disabled handling.

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  // text-white (not text-fg-1) on the saturated fills: fg-1 flips to near-black
  // in the light theme, dropping contrast on the purple/red to ~3.4:1 — white
  // reads correctly on both since these fills stay dark in both themes.
  primary: 'bg-purple-600 text-white hover:bg-purple-500 shadow-[var(--shadow-card)]',
  ghost: 'bg-transparent text-fg-2 hover:bg-bg-4 hover:text-fg-1',
  danger: 'bg-danger/90 text-white hover:bg-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

/** Primary / ghost / danger button. Icon-only usages MUST pass an `aria-label`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})
