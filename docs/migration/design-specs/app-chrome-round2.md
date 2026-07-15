# App Chrome + Design System — Round 2 Plan

> Execution plan (Fable, 2026-07-14). Refinements to the app SHELL (rail + header) and the design system underneath it: light theme + toggle, rail redesign, a typography/colour rulebook, and a future onboarding sketch. Plan only — build next session, one PR per item, screenshot-verified on the golden session (2023 Monaco R, VER,LEC), dark AND light once item 1 lands.

## 1. Scope, references & key discoveries

Sources of truth audited: `webapp/src/app/{Rail,Header,Shell,providers,router}.tsx`, `webapp/src/styles/tokens.css`, `webapp/src/index.css`, `webapp/src/stores/ui.ts`, `webapp/src/lib/zIndex.ts`, `webapp/src/charts/echartsTheme.ts` + the two brand-convention sites: the **landing** (`~/…/TFG/f1stratlab-web/`: `colors_and_type.css`, `landing.css`, `components/App.jsx`) and the **docs site** (parent repo `docs/styles/{tokens,docs}.css`). Skills applied: `baseline-ui` (`.claude/skills/baseline-ui/SKILL.md`) + `frontend-design`; ui-skills catalogue consulted conceptually (navigation / motion / layout categories) for the rail pattern.

Key discoveries that shape every item below:

1. **Neither the landing nor the docs has a light theme or a theme toggle.** Both are dark-only (`docs/index.html:100-101` pins `theme-color #0c0d14`; the landing has zero `data-theme`/toggle code). "Mirror the landing's light palette" is therefore impossible — **we derive the light palette from the token semantics** and the app becomes the first branded surface with a toggle. The toggle itself is new brand vocabulary, not a port.
2. **The docs sidebar is the strongest reference for the rail** (`docs/styles/docs.css:301-385`): grouped sections with tiny uppercase titles + a 4px purple dot, active link = purple gradient wash + 2px left bar with glow, mono meta tags. That is the on-brand "premium rail" grammar — the current Rail has none of it.
3. **The landing centers; the app left-aligns.** `landing.css:309-313` centers `.section-head` by default (marketing grammar, with a `.left` variant). The docs site — the app-like sibling — is left-aligned throughout. The migrated Dashboard's left H1 + left `SectionHeader`s is **correct**; codified in §4.
4. **A real token bug exists:** brand `--tracking-widest: 0.18em` (`tokens.css:108`) is never mapped into Tailwind's `@theme` (`index.css:9-60` maps colors + fonts only), so every `tracking-widest` utility in the app silently renders Tailwind's default **0.1em**. Two different eyebrow trackings ship today (§4, D1).

---

## 2. Item 1 — Light theme + toggle in the top bar

### Analysis

`tokens.css` is **light-READY but not light-COMPLETE**. Ready: the ramp is fully semantic (`--bg-0..5`, `--fg-1..4`, `--divider/hairline`, shadows, gradients), and `index.css:9` maps it via `@theme inline` so utilities reference the vars — a light theme is a var swap, exactly as the file's own comment promises (`tokens.css:8-10`). Translucent chrome (`bg-bg-2/80` in Rail, `bg-bg-1/80` in Header) also survives the swap: Tailwind v4 renders opacity modifiers on var colors via `color-mix()`, so no component edits needed there.

Not complete — four hard blockers:

| # | Blocker | Where |
|---|---|---|
| B1 | `html { color-scheme: dark }` hardcoded | `index.css:63-65` |
| B2 | Status colors are neon-on-dark: `--success #43ff64`, `--warning #ffbd33` fail contrast on white | `tokens.css:51-54` |
| B3 | `--tire-hard: #e6e6e6` — white chip on white bg | `tokens.css:59` |
| B4 | ECharts theme hardcodes resolved dark hex ("a build-time JS module cannot read CSS vars") | `charts/echartsTheme.ts:13-18,29-44` |

No `@media (prefers-color-scheme)` blocks exist anywhere in the webapp today — a clean slate for the interplay rule.

### Plan

**(a) Light token block — `styles/tokens.css`** (append after `:root`, ~35 overrides under `:root[data-theme='light']`):

```css
:root[data-theme='light'] {
  color-scheme: light;                            /* resolves B1 declaratively */
  --bg-0: #f5f5fa;  --bg-1: #eef0f7;  --bg-2: #e9eaf4;   /* page / deep / chrome */
  --bg-3: #ffffff;  --bg-4: #f7f7fc;  --bg-5: #eceaf9;   /* card / elevated / input */
  --fg-1: #14121f;                                  /* near-black, purple tint (mirror of bg-1) */
  --fg-2: rgba(20,18,31,0.75); --fg-3: rgba(20,18,31,0.58);
  --fg-4: rgba(20,18,31,0.42); --fg-inv: #ffffff;
  --accent-hover: var(--purple-700);                /* purple-300 fails as text on white */
  --success: #15803d; --warning: #b45309; --danger: #dc2626; --info: #1d4ed8;  /* B2 */
  --divider: rgba(20,18,31,0.10); --divider-strong: rgba(20,18,31,0.18);
  --hairline: rgba(20,18,31,0.06);
  --grad-hero: radial-gradient(ellipse 120% 80% at 50% 0%,
    rgba(108,92,231,0.14) 0%, rgba(108,92,231,0.05) 35%, transparent 70%);
  --shadow-card: 0 2px 10px rgba(20,18,31,0.08);
  --shadow-elev: 0 12px 40px rgba(20,18,31,0.14);
  --shadow-glow: 0 0 0 1px rgba(108,92,231,0.30), 0 12px 40px rgba(108,92,231,0.15);
  --shadow-inset: inset 0 1px 0 rgba(255,255,255,0.6);
}
```

Purple ramp, blue ramp and tyre colors stay identical (they are identity colors). **B3** is NOT solved by swapping `--tire-hard` (HARD is white-banded in real F1) — instead every compound chip gets a permanent `border-hairline` (one-line change wherever compound pills render, e.g. `App.tsx:46-53` and the dashboard `CompoundLegend`), which is invisible-ish in dark and load-bearing in light. `::selection` (purple-600 bg + white text) passes in both themes — untouched.

**(b) Theme state — `stores/ui.ts`** (extend the existing persisted store, NOT a new hook file):

```ts
theme: 'dark' | 'light'          // default 'dark' — brand-first, both sibling sites are dark
toggleTheme: () => void
```

Two-state on purpose (no 'system'): both brand surfaces are dark-only, so dark is the identity default, and a two-state toggle keeps CSS single-sourced. If 'system' is ever wanted, it resolves inside the store/subscription — the CSS below never changes.

**(c) DOM stamping + interplay rule.** Single source of truth = the `data-theme` attribute; **no `@media (prefers-color-scheme)` blocks in app CSS, ever** (avoids the two-writers problem). Wiring:
- `app/providers.tsx`: subscribe once — `useUiStore` selector for `theme`, effect sets `document.documentElement.dataset.theme = theme`. ~6 lines in `Providers`.
- **FOUC guard** — `webapp/index.html`: 3-line inline script before the module script: `try { const t = JSON.parse(localStorage.getItem('f1sl.ui')).state.theme; if (t) document.documentElement.dataset.theme = t } catch {}` (zustand/persist stores `{state:{...},version}` under `f1sl.ui`, see `stores/ui.ts:21`). Without it, a light-theme user gets one dark frame per load.

**(d) Toggle control — new `components/ThemeToggle.tsx`, mounted inside `app/Header.tsx:22`** (after `{children}`, right cluster) so every routed page gets it for free. lucide `Sun`/`Moon` (lucide-react already a dep, `package.json:40`), ghost `Button` size sm, icon-only with `aria-label="Switch to light/dark theme"` (baseline-ui MUST), icon swap ≤150ms opacity+rotate, `motion-reduce:transition-none`. Note: `/` (temporary theme-preview `App.tsx`) renders no Header — it inherits the toggle when the real Home lands (separate polish PR); acceptable gap.

**(e) ECharts (B4) — the single biggest cost.** Refactor `charts/echartsTheme.ts` to `buildEchartsTheme(mode: 'dark' | 'light')` with two const palettes (light: fg/line/hairline → the rgba(20,18,31,…) family, tooltip bg `#ffffff`, title `#14121f`; series palette unchanged). `charts/registerEcharts.ts:10` registers both `'f1'` and `'f1-light'`. New 4-line `useChartTheme()` (in `charts/registerEcharts.ts`) returns the theme name from the ui store. Update the three consumption sites — `charts/Gauge.tsx:119`, `features/dashboard/components/ChannelChart.tsx:223`, `features/dashboard/components/LapChart.tsx:229` — to `theme={chartTheme} key={chartTheme}` (keyed remount; toggling is rare, remount is fine). `LapChart.tsx:14` also imports the raw `echartsTheme` object — route that through the mode-aware builder.

**(f) Verify.** Contrast spot-checks (fg-3 on bg-3 ≥ 4.5:1; purple-600 as text only ≥ 18px on light, else purple-700) + full-page screenshots of Dashboard in both themes on the golden session.

**Effort: M-L (~1 day).** (a)-(d) ≈ 3h · (e) ≈ 3-4h · (f) ≈ 1-2h. Informed by: `frontend-design` (theme-as-token-swap), token audit above.

---

## 3. Item 2 — Rail redesign (de-slop the sidebar)

### Analysis — why it reads "typical-LLM"

`Rail.tsx` today: a bare flat list starting at the very top of the viewport (no brand block), uniform `gap-1` items, active state = a flat solid `bg-bg-4` pill (`Rail.tsx:16`), ~90 lines of hand-rolled generic 20px SVGs (`Rail.tsx:36-101`), and a full-width centered chevron button at the bottom (`Rail.tsx:250-260`) — the exact default an LLM emits for "sidebar". Zero brand vocabulary, while the docs sidebar (`docs.css:301-385`) and landing nav (`landing.css:35-78`: active = purple-300 + glowing gradient underline; logo = Space Grotesk 600 15px) already define what F1 StratLab navigation looks like.

### Redesign spec

Widths: 232px expanded / 76px collapsed (nudged from 220/72 for the new left indicator + brand block). Width still snaps, never transitions (layout prop — `Rail.tsx:148-151` rationale stands). Acrylic law unchanged: `bg-bg-2/70 backdrop-blur-md`, chrome only.

```
┌────────────────────────────┐
│ ◆ F1 StratLab          h-14│  ← brand block, border-b hairline, aligns with Header h-14
├────────────────────────────┤     → one continuous chrome line across rail + header
│  Home                      │
│                            │
│  TELEMETRY ·               │  ← section label: 10px SG 600 uppercase tracking-widest
│  ▍Dashboard                │     text-fg-4 + 4px purple-500 dot (docs.css:328-334)
│   Comparison               │  ← active: grad-purple-soft wash + 2px purple-400 left bar
│   Lab                      │     w/ soft glow (docs.css:352-364); icon → purple-300
│                            │
│  PIT WALL ·                │
│   Strategy                 │
│   Race                     │
│                            │
│  ASSIST ·                  │
│   Chat                     │
│  (flex-1 spacer)           │
├────────────────────────────┤
│ v0.9        [⇤]        p-3 │  ← mono version tag (fg-4) + icon-only collapse button
└────────────────────────────┘
```

Concrete changes, all in `webapp/src/app/Rail.tsx` (full rewrite, same public surface):

1. **Brand block** (new, top): `h-14 border-b border-hairline px-4 flex items-center gap-2.5`. Mark = 24px `rounded-md` square, `bg-[image:var(--grad-purple)]`, "F1" in mono 700 10px white (pure CSS, no asset). Wordmark "F1 StratLab" `font-display font-semibold text-[15px] tracking-tight` (landing `.logo`, `landing.css:52-58`); hidden when collapsed (mark centers). Links to `/`.
2. **Grouped nav** (docs-sidebar grammar): Home standalone, then sections **Telemetry** (Dashboard, Comparison, Lab), **Pit wall** (Strategy, Race), **Assist** (Chat). Section label per the diagram; when collapsed, labels swap to a `mx-3 border-t border-hairline` rule so grouping survives at 76px.
3. **Items**: `h-9 rounded-lg px-3 gap-3 text-sm relative`. Inactive: `text-fg-3` (icon `text-fg-4`) → hover `text-fg-1 bg-fg-1/[0.04]` — **use `fg-1`-based alpha, not `white/…`, so the hover works in both themes** (white in dark, near-black in light). Active: `text-fg-1` + `bg-[image:var(--grad-purple-soft)]` + absolutely-positioned left bar `left-0 inset-y-2 w-0.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(108,92,231,0.6)]`, entering via `scale-y` 150ms ease-out (compositor-only, `motion-reduce` guarded). The route-literal typing constraint (`Rail.tsx:8-14`) stays — but rendering a different child per state needs TanStack Link's **children-as-function** form (`{({ isActive }) => …}`) instead of `activeProps` classNames; `to` remains a literal at each call site.
4. **Icons → lucide-react** (delete `Rail.tsx:36-101`): `House`, `LayoutDashboard`, `ArrowRightLeft` (Comparison — already its icon in `DashboardPage.tsx:117`, keep consistent), `FlaskConical`, `Crosshair` (Strategy), `Flag` (Race), `MessageSquare` (Chat). `size-[18px]`, `strokeWidth={1.75}`, `aria-hidden`. −90 LOC.
5. **Footer**: replace the full-width centered button (`Rail.tsx:250-260`) with `p-3 border-t border-hairline flex items-center justify-between`: mono `v0.9` tag (`text-[10px] text-fg-4`, hidden collapsed; docs `sidebar-footer` nod, `docs.css:373-385`) + icon-only ghost `Button` `size-8` using lucide `PanelLeftClose`/`PanelLeftOpen`, existing `aria-label`s kept, wrapped in the existing `Tooltip`.
6. **Motion budget** (baseline-ui): color transitions 150ms + the active-bar scale — nothing else. No width animation, no layout props, ≤200ms everywhere.
7. **Collapsed state**: icons centered in a `size-9` hit area; active state = wash on that square + left bar retained; `title` tooltip mechanism (`Rail.tsx:132-135`) kept.

Also touch: `app/Rail.test.tsx` (labels, collapse aria, new section labels). No new deps; `useUiStore.railCollapsed` contract unchanged.

**Effort: M (~4h incl. screenshot loop).** Informed by: `baseline-ui` (aria on icon-only buttons, compositor-only motion, fixed z-scale — `Z.rail` unchanged), docs sidebar (`docs.css:301-385`), landing nav (`landing.css:35-78`), ui-skills *navigation* category (grouped rail + brand block + collapse pattern).

---

## 4. Item 3 — Typography + text-colour rulebook

### Audit verdicts

- **Alignment**: landing centers section heads (`landing.css:309-313`) — marketing grammar only. The docs site is left-aligned. **The app left-aligns: the Dashboard's left "Dashboard" H1 (`Header.tsx:21`) + left `SectionHeader`s (`features/dashboard/components/SectionHeader.tsx:11-15`) are correct.** Centered text in-app is reserved for empty/zero states (`EmptyState.tsx:24`) and modal confirmations.
- **Eyebrow grammar** is the brand's signature type move (landing `colors_and_type.css:195-202`: uppercase, 0.18em, 600): the app reuses it in neutral form (fg-3 + purple tick) — correct, but the tracking is silently wrong app-wide (D1).
- **Colour**: the landing colours *only* key numbers/words in purple-300 inside neutral prose, separators in fg-4 (`components/App.jsx:216-225`), and uses gradient text exactly once, on the hero H1 (`landing.css:277-282`). The app must keep colour that scarce.

### The rulebook (app-wide, reusable)

1. **Fonts**: Space Grotesk (`font-display`) = titles/headers. Inter (`font-body`) = UI + prose. JetBrains Mono = every number that identifies or measures (lap times, gaps, confidence, versions), always with `tabular-nums`.
2. **Alignment**: left, always. Exceptions: `EmptyState` bodies and modal confirmations may center. Never center a section title or page H1 in-app.
3. **In-app scale**: page title 18px SG **600** (Header) · section header 14px SG 500 uppercase eyebrow fg-3 + purple tick (`SectionHeader`) · card title 14px SG 500 fg-1 sentence-case (`ChartCard.tsx:72`) · stat label 12px uppercase eyebrow fg-3 (`StatCard.tsx:39`) · body 14px Inter fg-2 · caption 12px fg-3/fg-4. Rendered-markdown content: 24/20/18 (`Markdown.tsx:13-19`). Hero scale (≥48px) is reserved for the future real Home — one marketing moment per app.
4. **Eyebrows**: uppercase + brand tracking **0.18em** + font-medium. Neutral variant (fg-3) for section/stat labels; brand variant (purple-300) reserved for hero moments, max one per view (baseline-ui: one accent per view).
5. **Weights**: SG 600 for titles ≥ 18px, 500 below; 700 only for stat values and hero. Never bold body prose for emphasis — restructure instead.
6. **Text is neutral by default** (fg-1 → fg-4 by hierarchy). Colour is a signal, never decoration:
   - **purple** = interactive states + THE one key number/word of a view (landing hero-meta pattern);
   - **team colours** = driver identity only (names, series, dots — `features/dashboard/lib/drivers.ts`);
   - **tyre colours** = compounds only; **semantic** (success/warning/danger/info) = state only;
   - **blue ramp** = neutral data series (first slot of `echartsTheme.ts:29`); **fg-4** = separators (`·`).
7. **Never gradient text in-app** (the landing hero is the single sanctioned exception; baseline-ui bans it outright).
8. `text-balance` on headings, `text-pretty` on paragraphs (base layer already balances h1-h3, `index.css:74-79`).
9. Tracking comes from brand tokens via Tailwind theme — no `tracking-[…]` arbitrary values (see D1).

### Deviations found (fix in this round)

| # | Deviation | Where | Fix |
|---|---|---|---|
| D1 | Brand `--tracking-widest` (0.18em, `tokens.css:108`) never mapped into `@theme` → Tailwind default 0.1em ships in every eyebrow; `App.tsx:22,58` hand-rolls `tracking-[0.18em]` — two trackings coexist | `index.css:9-60` (missing map); consumers `SectionHeader.tsx:12`, `SelectorsToolbar.tsx:26`, `StatCard.tsx:39`, `DataTable.tsx:134` | Add `--tracking-wide: var(--tracking-wide); --tracking-widest: var(--tracking-widest);` (+ tight/tighter/tightest) to `@theme inline`; delete arbitrary values in `App.tsx` |
| D2 | `tracking-wide` on table headers = Tailwind 0.025em vs brand 0.04em | `DataTable.tsx:134` | Covered by D1 |
| D3 | Page title SG **regular** `text-lg` — under-weighted vs brand h-scale (landing titles are 600) | `Header.tsx:21` | `font-display text-lg font-semibold tracking-tight text-fg-1` |
| D4 | Temporary Home uses marketing scale in-app | `App.tsx:25` | Dies with the real Home redesign (separate PR) — no action here |
| D5 | Chart title colour hardcoded white | `echartsTheme.ts:32` | Absorbed by item 1(e) |

**Effort: S (~2h).** D1+D2+D3 are ~10 lines total plus a `tracking-[` sweep; the rulebook lives in this doc and gets linked from the webapp README. Informed by: `baseline-ui` (typography section), landing + docs audit above.

---

## 5. Item 4 — Onboarding (future work, LexFlow-style)

Not built this round — recorded now so keys/mount points don't collide later.

- **Keys** (namespaced like the store, `f1sl.*`): `f1sl.welcomed` (welcome modal seen) · `f1sl.tour.<page>` (per-page coach marks, e.g. `f1sl.tour.dashboard`). Mirrors LexFlow's `lexflow.welcomed` / `onboarded` / `tutorial-completed` gating.
- **Phase 1 — WelcomeModal (cheap, ship with a polish PR):** built on the existing `components/Modal.tsx`; mounts in `app/Shell.tsx` beside `<Outlet/>`, gated on `!localStorage['f1sl.welcomed']`. Content: brand mark + one-line pitch + three bullets (Dashboard / Strategy / Chat) + primary CTA **"Open a sample session"** deep-linking `/dashboard?year=2023&gp=Monaco&session=R&drivers=VER,LEC` (the golden offline-cached session) + ghost "Skip". Both paths set the key. Effort S (~2h) when scheduled.
- **Phase 2 — per-page spotlight tour:** anchor registry + Popover-based coach marks (or driver.js — decide then), gated per `f1sl.tour.<page>`, triggered on first visit of each migrated tab. Defer until Strategy/Race/Chat exist — a tour of "coming soon" pages is noise.
- **Harness note:** the screenshot/E2E scripts must seed these keys in `addInitScript` (the FRONTEND_VISUAL_VERIFICATION pattern) or every capture shows the modal.

**Effort now: 0 (doc only).** Informed by: LexFlow first-run gating pattern.

---

## 6. Build order & effort summary

| Order | Item | PR | Effort | Depends on |
|---|---|---|---|---|
| 1 | §4 rulebook fixes (D1-D3) | `fix(webapp): map brand tracking tokens + header weight` | S (~2h) | — |
| 2 | §3 rail redesign | `feat(webapp): redesign app rail` | M (~4h) | 1 (correct tracking for section labels) |
| 3 | §2 light theme + toggle | `feat(webapp): light theme + header toggle` | M-L (~1 day) | 2 (rail is tokens-only → theme-proof by construction; style it once) |
| 4 | §5 onboarding | future sprint | S later | real Home + ≥2 migrated tabs |

Every PR: screenshot-verify on 2023 Monaco R (VER,LEC), dark first, both themes after PR 3; commit explicit paths (never `-A`), no repo-wide prettier (Windows autocrlf gotcha).

**Key files:** `webapp/src/app/{Rail,Header,Shell,providers}.tsx` · `webapp/src/styles/tokens.css` · `webapp/src/index.css` · `webapp/src/stores/ui.ts` · `webapp/src/charts/{echartsTheme,registerEcharts}.ts` + `Gauge.tsx` · `webapp/src/features/dashboard/components/{SectionHeader,SelectorsToolbar,ChannelChart,LapChart}.tsx` · `webapp/src/components/{StatCard,DataTable,Modal}.tsx` · `webapp/index.html` — references `f1stratlab-web/{colors_and_type,landing}.css` + `docs/styles/docs.css:301-385`.
