import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/Button'
import { useUiStore } from '@/stores/ui'

// Icon-only theme toggle, mounted in `app/Header.tsx`'s right cluster so
// every routed page gets it for free. This component only flips the
// two-state `theme` in `stores/ui.ts` — the `<html data-theme>` DOM stamping
// and the FOUC guard already live in `providers.tsx` / `index.html`
// (app-chrome-round2.md §2b-c), so ThemeToggle never touches the DOM
// directly, it just reads/writes the store.

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

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
      className="size-8 px-0"
    >
      <Icon
        aria-hidden="true"
        className="size-4 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
      />
    </Button>
  )
}
