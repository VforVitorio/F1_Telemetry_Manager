import { cn } from '@/lib/cn'

/**
 * Theme preview — a dev-only QA surface (route `/dev/theme`, not in the rail).
 * Exercises the ported design system (fonts, background ramp, tyre colours,
 * glow, tabular figures) so the theme can be screenshot-verified in both
 * light and dark. This replaced the real Home at `/` (the launcher hub); it
 * lives on because it's the single-glance check for the full ramp + the
 * HARD-on-white hairline case whenever the tokens change.
 */
const RAMP = ['bg-bg-0', 'bg-bg-1', 'bg-bg-2', 'bg-bg-3', 'bg-bg-4', 'bg-bg-5']
const TYRES: [string, string][] = [
  ['SOFT', 'bg-tire-soft'],
  ['MEDIUM', 'bg-tire-medium'],
  ['HARD', 'bg-tire-hard'],
  ['INTER', 'bg-tire-inter'],
  ['WET', 'bg-tire-wet'],
]

export function ThemePreview() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 p-8 md:p-16">
      <header className="flex flex-col gap-2">
        <span className="font-body text-xs font-semibold uppercase tracking-widest text-accent-hover">
          Dev · theme preview
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight text-balance md:text-5xl">
          Design tokens
        </h1>
        <p className="max-w-prose text-fg-2 text-pretty">
          Space Grotesk display, Inter body, JetBrains Mono for data. Brand tokens mapped 1:1 to
          Tailwind v4 — this page is the both-themes QA surface.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-fg-2">Background ramp</h2>
        <div className="flex gap-2">
          {RAMP.map((c) => (
            <div key={c} className={cn('size-12 rounded-lg border border-hairline', c)} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-fg-2">Tyre compounds</h2>
        <div className="flex flex-wrap gap-3">
          {TYRES.map(([label, bg]) => (
            <span
              key={label}
              // border-hairline (B3): keeps HARD's near-white chip visible
              // against a white card in the light theme.
              className={cn(
                'rounded-full border border-hairline px-3 py-1 font-mono text-xs font-semibold text-bg-0',
                bg,
              )}
            >
              {label}
            </span>
          ))}
        </div>
      </section>
    </main>
  )
}
