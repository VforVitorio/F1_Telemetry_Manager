import { cn } from '@/lib/cn'

/**
 * Theme preview (issue #32). Temporary surface that exercises the ported design
 * system (fonts, background ramp, tyre colors, purple accent, glow, tabular
 * figures) so the theme can be screenshot-verified. Replaced by the real Home
 * route + app shell in #33/#42.
 */
const RAMP = ['bg-bg-0', 'bg-bg-1', 'bg-bg-2', 'bg-bg-3', 'bg-bg-4', 'bg-bg-5']
const TYRES: [string, string][] = [
  ['SOFT', 'bg-tire-soft'],
  ['MEDIUM', 'bg-tire-medium'],
  ['HARD', 'bg-tire-hard'],
  ['INTER', 'bg-tire-inter'],
  ['WET', 'bg-tire-wet'],
]

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 p-8 md:p-16">
      <header className="flex flex-col gap-2">
        <span className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">
          Migration epic #25
        </span>
        <h1 className="font-display text-5xl font-bold tracking-tight text-balance md:text-6xl">
          F1 StratLab
        </h1>
        <p className="max-w-prose text-fg-2 text-pretty">
          Design system online: Space Grotesk display, Inter body, JetBrains Mono for data. Brand
          tokens mapped 1:1 to Tailwind v4.
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
              className={cn('rounded-full px-3 py-1 font-mono text-xs font-semibold text-bg-0', bg)}
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="flex max-w-sm flex-col gap-2 rounded-2xl border border-purple-600/40 bg-bg-3 p-6 shadow-[var(--shadow-glow)]">
        <span className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">
          Recommendation
        </span>
        <span className="font-display text-3xl font-bold text-balance">PIT, undercut</span>
        <span className="font-mono text-fg-2 tabular-nums">
          confidence 0.87 · lap 24 · gap +1.482s
        </span>
      </section>
    </main>
  )
}
