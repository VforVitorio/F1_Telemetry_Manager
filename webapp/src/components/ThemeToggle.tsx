import { Moon, Sun } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/Button'
import { useUiStore } from '@/stores/ui'

// Icon-only theme toggle, mounted in `app/Header.tsx`'s right cluster so
// every routed page gets it for free. This component only flips the
// two-state `theme` in `stores/ui.ts` — the `<html data-theme>` DOM stamping
// and the FOUC guard already live in `providers.tsx` / `index.html`
// (app-chrome-round2.md §2b-c). The one exception is `handleClick` below: it
// also stamps `data-theme` itself, synchronously, inside the View Transition
// callback — see `runThemeViewTransition` for why that duplication is
// required rather than a DOM violation.

const VIEW_TRANSITION_DURATION_MS = 480

/** The subset of `ViewTransition` this component actually reads. */
interface ViewTransitionLike {
  ready: Promise<void>
}

/**
 * `document` augmented with the View Transitions API. Declared locally
 * (never `any`) because TypeScript's bundled DOM lib only gained
 * `startViewTransition` typings in recent releases — this intersection type
 * is structurally compatible whether or not `lib.dom.d.ts` already declares
 * the method, so the cast below is safe either way (see summary handoff for
 * the compatibility reasoning).
 */
type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike
}

function getViewTransitionDocument(): DocumentWithViewTransitions {
  return document as DocumentWithViewTransitions
}

/** False when the browser lacks View Transitions or the user asked for reduced motion — the caller should fall back to an instant, unanimated toggle. */
function canAnimateThemeSwitch(): boolean {
  const supportsViewTransitions =
    typeof getViewTransitionDocument().startViewTransition === 'function'
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return supportsViewTransitions && !prefersReducedMotion
}

/**
 * Expands a circular reveal of the new theme from `(x, y)` — the toggle
 * button's own center — outward until it covers the viewport. `index.css`
 * disables the browser's default cross-fade on `::view-transition-old/new`,
 * so the old frame just sits still underneath while this clip-path animation
 * wipes the new one over it (the theme-toggle.rdsx.dev technique).
 */
function animateThemeCircleReveal(x: number, y: number) {
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
    {
      duration: VIEW_TRANSITION_DURATION_MS,
      easing: 'ease-in-out',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}

/**
 * Runs `applyTheme` inside `document.startViewTransition`, then drives the
 * circular reveal once the new frame is ready.
 *
 * `applyTheme` MUST mutate the DOM synchronously: the View Transitions API
 * snapshots the "old" frame before the callback runs and the "new" frame
 * right after it returns, but `providers.tsx`'s theme effect only re-stamps
 * `data-theme` asynchronously on the next React commit — too late for the
 * snapshot. That's why `handleClick` sets `data-theme` itself inside the
 * callback; the store update still happens too, so providers.tsx's effect
 * re-stamps the same value afterwards as a no-op.
 */
function runThemeViewTransition(x: number, y: number, applyTheme: () => void) {
  document.documentElement.style.setProperty('--theme-x', `${x}px`)
  document.documentElement.style.setProperty('--theme-y', `${y}px`)

  const transition = getViewTransitionDocument().startViewTransition?.(applyTheme)
  if (!transition) {
    applyTheme()
    return
  }

  transition.ready
    .then(() => animateThemeCircleReveal(x, y))
    .catch(() => {
      // `ready` can reject (e.g. the browser skipped the transition). The
      // theme has already flipped synchronously above, so there's nothing to
      // recover — just drop the reveal animation.
    })
}

/**
 * Sun/Moon icon-only button. The icon always depicts the theme you're about
 * to switch TO, not the one you're currently in — Sun while dark ("go
 * light"), Moon while light ("go dark") — so the control reads as an action
 * rather than a status indicator.
 */
export function ThemeToggle() {
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
  const Icon = theme === 'dark' ? Sun : Moon

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!canAnimateThemeSwitch()) {
      toggleTheme()
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const nextTheme = theme === 'dark' ? 'light' : 'dark'

    runThemeViewTransition(x, y, () => {
      document.documentElement.dataset.theme = nextTheme
      toggleTheme()
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={handleClick}
      className="size-8 px-0"
    >
      <Icon
        aria-hidden="true"
        className="size-4 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
      />
    </Button>
  )
}
