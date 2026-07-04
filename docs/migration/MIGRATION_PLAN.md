# F1 StratLab Telemetry — Streamlit → Local Web App MIGRATION PLAN

> Decision-grade plan. Produced 2026-07-04 by the Fable 5 planning agent from: the visual dossier
> (`migration-dossier/SCREENS.md` + 37 live PNGs), the current code (`src/telemetry/frontend/` ~14,767 Python LOC,
> `src/telemetry/backend/`), the brand tokens (`docs/styles/tokens.css`), and the compose/launch reality
> (`src/telemetry/docker-compose.yml`). Tracking issue: `VforVitorio/F1_Telemetry_Manager#25`.
>
> Scope law: **backend FastAPI untouched** (REST + SSE + MCP surface identical) · **LLM = OpenAI / LM Studio, never
> Anthropic** · **100% feature parity + distribution preserved** · **local browser SPA via Docker** (no desktop shell,
> no public hosting) · strangler migration, not big-bang.

---

## 1. Executive summary + stack decision

### 1.1 What we are doing and why

The telemetry surface (6 pages: Dashboard, Strategy, Race Analysis, Model Lab, Comparison, AI Chat + Voice) is a
data-dense, interaction-heavy app built on Streamlit's rerun-the-whole-script model. Every widget click re-executes
the page, every chart re-serializes over a websocket, and the flagship interaction (the synchronized 2-driver replay)
is a pre-baked 300-frame Plotly animation that plays at ~10 fps from a multi-megabyte figure payload. The app *works*
— the dossier confirms every feature runs live against the real backend — but it is slow, scroll-heavy (Dashboard is
~5,900 px tall), visually capped by Streamlit's widget chrome, and impossible to deep-link.

The migration replaces **only** the `:8501` service with a **client-side SPA served on localhost via Docker**, calling
the same FastAPI backend on `:8000`. The backend's REST, SSE-streaming chat (which is itself an MCP client of the
backend's own FastMCP server — load-bearing for the thesis claim, and untouched here), and voice endpoints remain the
contract.

### 1.2 Stack decision

**React 19 + Vite + TypeScript (strict), Tailwind CSS v4 mapped 1:1 to `tokens.css`, TanStack Router + TanStack
Query + Zustand, Apache ECharts (canvas) as the single chart workhorse, a custom canvas/Three.js replay engine for
Comparison, GSAP (`@gsap/react`) for motion, react-three-fiber for the reserved 3D moments, and the existing
`ogl`-based AudioOrb lifted as-is.** Served by an `nginx:alpine` container on **the same `:8501` port** Streamlit
occupies today (zero compose-consumer and zero CORS churn — backend already allows exactly that origin,
`backend/main.py:41`).

#### Framework trade-off table

| Criterion (weight) | **React 19 + Vite + TS** | Svelte 5 + SvelteKit (static SPA) | SolidJS + Vite |
|---|---|---|---|
| GSAP ergonomics | `@gsap/react` `useGSAP()` hook, huge community patterns | Framework-agnostic GSAP works; fewer canned patterns | Works; smallest pattern pool |
| Three.js ergonomics | **react-three-fiber + drei** — the best 3D-in-UI ecosystem anywhere | Threlte (good, much smaller) | solid-three (immature) |
| Chart ecosystem | Everything: echarts-for-react, react-plotly, visx, TanStack Table | plotly.js/ECharts used raw (fine, more hand-rolling) | Thin wrappers, mostly raw |
| **Existing code reuse** | **AudioOrb + Iridescence are already React 18 + TS + ogl** (`streamlit_audio_viz/frontend/src/`) — lift nearly verbatim; docs site is plain React; the repo's Dockerfile already has a node-builder stage | Orb must be rewritten; zero in-repo precedent | Orb must be rewritten; zero precedent |
| Runtime perf on streaming data | Good with normal discipline (memo boundaries, refs for rAF loops; charts render in canvas outside React anyway) | Best-in-class fine-grained updates | Best-in-class fine-grained updates |
| Bundle size | Larger baseline (~45 kB gz framework) — irrelevant on localhost | Smallest | Small |
| Dev familiarity / hiring / AI-assist quality | Highest (author already ships React in this ecosystem) | Medium | Lowest |
| Risk for a solo, phaseable project | **Lowest** | Medium (ecosystem gaps show up mid-migration) | Highest |

**Verdict:** Svelte/Solid win only on raw runtime perf and bundle weight — the two criteria that matter *least* for a
localhost app whose perf problem is architectural (Streamlit reruns), not framework overhead. React wins on every
criterion that determines whether this migration actually finishes: in-repo precedent, direct reuse of the already-React
voice orb, r3f for the flagship moments, and the deepest chart/motion ecosystem. **React 19 + Vite + TS.**

#### Chart library trade-off table

| Criterion | **Apache ECharts** | plotly.js (parity port) | Recharts / visx | uPlot |
|---|---|---|---|---|
| Port effort from current Plotly figures | Medium (option objects map cleanly) | **Lowest** (near 1:1) | High (compose everything) | High (low-level) |
| Perf on dense telemetry lines (7 channels × 3 drivers × ~5k points) | **Excellent** (canvas, progressive render, sampling) | Poor–OK (SVG default; WebGL mode heavy) | Poor (SVG/DOM) | **Best** |
| Payload/bundle | ~350 kB gz tree-shaken | **~1.2 MB gz** — fights the "make it faster" goal | Small | Tiny |
| Built-ins we need (synced cursors via `connect`, dataZoom brush, gauges, dark theming) | **All built in** | Most built in | Gauges/no sync — DIY | None — DIY |
| Click-a-point interaction (Dashboard lap chart) | Native events | Native events | Native | Manual |
| Look under our tokens | Fully themeable, crisp | Always looks like Plotly | Themeable | Spartan |

**Verdict:** **ECharts everywhere a "standard" chart exists** (lap times, 7 telemetry channels, degradation, gaps,
scenario bars, distribution bars, gauges), themed once from `tokens.css`. **No plotly.js in the target bundle** — it
is the single biggest lever on load weight and chart-render speed, and every current figure family maps to an ECharts
equivalent (verified against `chart_builders.py`, the `components/telemetry/*` builders, and the dossier PNGs).
plotly.js is retained only as a named **fallback risk mitigation** (per family, if a port stalls — §9). The Comparison
replay and Circuit Domination map are **not** chart-library problems: they are custom canvas draws (§3.6).

#### Motion / 3D

- **GSAP + `@gsap/react`** (GSAP is fully free since the Webflow acquisition, premium plugins included): route
  transitions, card/stagger reveals, number count-ups, the status-stepper narration, replay transport polish.
- **three.js via react-three-fiber + drei**, **code-split and mounted only on the routes that use it**: the Home hero
  (one restrained brand moment) and the optional 3D upgrade of the Comparison replay (enhancement, §7). Parity replay
  is 2D canvas — deliberately.
- **ogl** stays for the voice orb (it is 10 kB and the shader already exists — rewriting it into r3f is churn).

---

## 2. The five audits

Severity: **P0** = migration blocker / parity-loss risk · **P1** = major quality/perf debt the migration must fix ·
**P2** = should fix during migration · **P3** = nice to have.

### 2.1 Audit 1 — Functional / feature-parity inventory (anti-loss contract)

Method: every page module, component, service call, widget, download and `session_state` key in
`src/telemetry/frontend/` was enumerated and cross-checked against the dossier's 41-row coverage table. The full
checklist is §6; findings here are the *risks to parity*, not the inventory itself.

| ID | Sev | Finding |
|---|---|---|
| F1-1 | **P0** | **The chat's tool-result chart rendering is client-side logic, not backend output.** `components/chatbot/chart_builders.py` (531 LOC) builds Plotly figures *in the frontend* from tool JSON (`build_lap_times_figure`, `build_telemetry_figure`, `build_compare_drivers_figure`, `build_race_data_figure` → dispatched by `build_figure(tool_name, data)`). If the migration only ports "pages", this silently drops inline charts from chat answers. It must be ported as a TS `toolResult → EChartsOption` dispatcher with the same tool-name switch. |
| F1-2 | **P0** | **Chat state machine is subtle and must be reproduced exactly:** SSE `event:`/`data:` frames (`chat_service.py:352-370`) *plus* a parallel stage poll of `GET /api/v1/chat/status` (`chat_service.py:258`), a Stop flow (`chat_should_stop`), image attach with 4 duplicated base64 data-URI encoders, saved-chat rename (`chat_saved_chats`), report generation/storage (`report_storage.py`), and injected F1 context (`chat_f1_context`). Each is a parity line-item in §6. |
| F1-3 | **P1** | **Model Lab's Radio tab has two modes** (`ml_radio_lookup_result` — GP/driver/lap lookup with its *own* selectors — and `ml_radio_free_result` — free-text analysis). Both modes must survive even though the redesign unifies the selectors (§4.4). |
| F1-4 | **P1** | **Race Analysis has a manual CSV/parquet upload fallback** hidden in a collapsed expander (`pages/race_analysis.py`) — easy to miss, must exist in the target (file-drop zone in the loader panel). |
| F1-5 | **P1** | **Dashboard's outlier/invalid-lap toggles are client-computed** (IQR on loaded laps), not API calls — the target keeps them as pure client transforms so they stay instant. |
| F1-6 | **P2** | **There is no existing first-run/onboarding gate in the code** (verified: no `localStorage`/welcome/tour logic anywhere in `frontend/` beyond the chat empty-state prompt cards in `chat_history.py:199`). Parity scope = chat example chips + per-page empty states. The full onboarding (welcome → guided setup → tour) demanded by the brief is **new, designed work** — planned in §4.6 and phased as its own workstream. Logged as an open question (§9) so scope is explicit, not assumed. |
| F1-7 | **P2** | `GET /api/v1/strategy/simulate` (SSE race simulation) is **not consumed by the Streamlit UI** — it exists for CLI/Arcade. Out of parity scope, but the SSE client is built generic so it can be consumed later (live-timing seam, §3.5). |
| F1-8 | **P3** | Per-chart collapse ("–") controls on Dashboard telemetry cards and per-tab JSON/CSV download buttons across Race Analysis/Strategy are small but real features — each appears in §6. |

### 2.2 Audit 2 — UX & information architecture

Current IA: a top tab bar (`components/layout/navbar.py`) with Home(=Dashboard) · Strategy · Race Analysis ·
Model Lab · Comparison · AI Chat, driven by a `current_page` session key (`app/main.py:39-60`). No URL routing at all
— refresh loses everything, nothing is linkable.

| ID | Sev | Finding | Proposed change |
|---|---|---|---|
| U2-1 | **P0** | **No deep-linking / no URL state.** Every selector combination (year/GP/session/drivers) is unreachable by URL; refresh = start over. | All selector state moves to **typed URL search params** (TanStack Router). `?year=2024&gp=bahrain&session=R&drivers=VER,LEC` reproduces any screen. This is the single biggest UX unlock of the migration. |
| U2-2 | **P1** | **The product's centerpiece is buried.** The dossier crowns Strategy's recommendation (screen #7) and the Comparison replay (#32) as the app's best moments, yet the landing page is the telemetry explorer and nothing orients a new user. | New lightweight **Home** route: brand hero (the one expressive Three.js moment), quick-start cards to the three "wow" flows (Run a strategy · Compare two drivers · Ask the AI), recent-activity list. Dashboard keeps its full feature set at `/dashboard`. Additive — nothing is demoted from the nav. |
| U2-3 | **P1** | **Dashboard is a ~5,900 px scroll** (dossier #3): 7 stacked full-width telemetry charts + circuit domination. | Telemetry workspace becomes a **2-column responsive grid of chart cards** with per-card maximize; a grid⇄stack toggle preserves the current one-long-scroll mode for anyone who wants it (parity + improvement, not replacement). |
| U2-4 | **P1** | **Race Analysis "Tyre degradation" stacks 5 charts** (dossier #14). | Segmented chart-switcher with a "small multiples" (show-all) toggle — same data, one viewport. |
| U2-5 | **P1** | **Model Lab's Radio tab has its own GP/driver/lap selectors** conflicting with the page-level ones (dossier #29). | One page-level context (GP/driver/lap) that all six tabs inherit; the Radio tab gets an explicit "override context" affordance instead of silently separate state. |
| U2-6 | **P2** | The 45–60 s strategy run is narrated with `st.status` steps — good UX worth preserving; note the narration is **client-side scripted** (`pages/strategy.py:210-230` writes stages around a single `POST /strategy/recommend`), not real backend progress. | Reproduce as a GSAP-animated **StatusStepper** with the same scripted stages (no backend change needed). Real per-agent progress events = enhancement (§7, requires backend). |
| U2-7 | **P2** | Chat report generation is a 2-step dance ("Download Report" → "Download Markdown Report", dossier #37). | Parity keeps two-step; enhancement collapses to one click with a toast (§7). |
| U2-8 | **P2** | Navigation is mouse-only. | Keyboard: arrow/tab-navigable primitives by default (Radix), plus a ⌘K command palette as enhancement (§7). |
| U2-9 | **P3** | "GO TO COMPARISON" cross-link exists only on Dashboard. | Cross-links become cheap once state is in URLs; add contextual "open in Comparison / ask the AI about this" affordances (enhancement). |

Proposed IA (parity-preserving; one additive route):

```
Left icon rail (acrylic chrome, collapsible, keyboard-navigable)
├── /            Home            (NEW, additive: hero + quick-start + recents)
├── /dashboard   Telemetry       (= today's Home/Dashboard, full parity)
├── /strategy    Strategy Advisor
├── /race        Race Analysis   (5 tabs preserved)
├── /lab         Model Lab       (6 tabs preserved)
├── /comparison  Driver Comparison (flagship)
└── /chat        AI Chat         (text ⇄ voice mode toggle preserved; sidebar = chats + reports)
```

The onboarding/first-run flow design is in §4.6.

### 2.3 Audit 3 — Visual design & design system

Global verdict from the dossier: the app already has a coherent dark-purple language (purple-glow card borders, tyre
icons, gauges) — **the design DNA is kept**; what gets replaced is Streamlit's widget chrome and layout ceiling.

Per-screen keep/replace:

| Screen (dossier #) | KEEP (why) | REPLACE (why) |
|---|---|---|
| Dashboard empty + populated (#1–3) | Cascading selector flow; click-a-lap-point-to-load interaction; tyre-compound legend with real Pirelli icons; purple-glow card language | Streamlit selectbox/multiselect chrome (BaseWeb, light-grey, off-brand); 5,900 px stacked layout (→ grid, U2-3); default Plotly toolbar/watermark styling |
| Strategy (#5–11) | Whole flow: selectors → sliders → narrated run → recommendation card + confidence + LLM prose + scenario bars + 4 agent sub-tabs. "This is the product's centerpiece" — layout survives 1:1 | Red default slider styling → token-branded dual-thumb slider; `st.status` box → StatusStepper; `st.metric` rows → StatCard row |
| Race Analysis (#12–21) | Tab structure; radio activation gate (deliberate cost guard); sentiment pill + entity chips; strategic-windows 3-metric summary; RAG answer with real article citation | 5-stacked-chart tyre tab (→ switcher, U2-4); **raw `st.dataframe` on Dataset overview — the single most "default Streamlit" element in the app** (dossier #21) → TanStack Table with virtualization, sticky header, column pinning, CSV export |
| Model Lab (#22–29) | The per-tab pattern (button → metrics → chart → collapsible reasoning) — "predictable once you've used one tab"; gauges for probability outputs | Duplicated selector state on Radio tab (U2-5); Plotly gauges → ECharts gauges themed to tokens |
| Comparison (#30–33) | Layout concept: circuit animation + 4 synced subplots + transport + scrubber — "most distinctive visual in the whole app"; the lap-times result box | The *implementation*: pre-baked Plotly frames at ~10 fps with inaccessible SVG transport buttons → custom 60 fps canvas replay with real HTML transport controls (§3.6) |
| AI Chat (#34–37) | Example-prompt chips; tool-call badges; the graceful-degradation error pattern (red tool-error box + LLM plain-English explanation) — explicitly praised in the dossier; sidebar structure | `st.chat_input`/message chrome → custom message list (virtualized); status spinner → inline stage chips |
| Voice (#38) | **The orb. Keep the actual code** (`AudioOrb.tsx` + `Iridescence.tsx`, React+ogl) — "the single most polished custom visual in the app" | The Streamlit component-iframe wrapper (`streamlit-component-lib` harness) → direct import into the SPA |

| ID | Sev | Finding |
|---|---|---|
| V3-1 | **P0** | **There is no real light theme today** (dossier Finding 4: `GLOBAL_CSS` hardcodes dark over Streamlit's toggle). Decision: **ship dark-only at parity** — it is the brand (`tokens.css` is a dark ramp) and the honest state of today's app — but build all styling on **semantic tokens** (`--bg-*`, `--fg-*`) so a designed light theme is a token-swap enhancement (§7), not a refactor. |
| V3-2 | **P1** | Typography today is Streamlit's default stack. Target self-hosts **Space Grotesk / Inter / JetBrains Mono** woff2 (local app → bundle the fonts, no CDN, works offline). |
| V3-3 | **P1** | Chart theming is per-file ad hoc (`template="plotly_dark"` + scattered colors). Target: **one ECharts theme** generated from tokens — transparent bg, hairline grid, blue data ramp, purple accents, tyre-compound colors from `--tire-*`, driver colors ported from `components/common/driver_colors.py`, JetBrains Mono axis labels. Every chart inherits it; zero per-chart color literals. |
| V3-4 | **P2** | Comboboxes: replace BaseWeb selects with Radix-based combobox primitives with **type-ahead** (and list virtualization if rosters grow) — directly answers dossier Finding 5, and makes Playwright testing sane. |
| V3-5 | **P2** | Accessibility baseline: visible focus rings on the dark ramp, WCAG-AA contrast for `--fg-2/3` on `--bg-2/3` (audit the 52%/32% alphas on data-dense screens), `prefers-reduced-motion` disables GSAP non-essential motion and pauses the orb/replay autoplay, all transport controls are real buttons (fixes the Plotly-SVG Play button that Playwright couldn't click, dossier #33). |

**Design-system spec (extract):**

- **Tokens:** `tokens.css` ported 1:1 into Tailwind v4 `@theme` (CSS-first config maps var-for-var; no invented values).
  Radii, 4 px spacing scale, shadows (`--shadow-card/elev/glow/inset`), gradients (`--grad-hero/purple/halo`) all carried over.
- **Acrylic law (the senior caveat, enforced as a rule):** `backdrop-blur` allowed **only** on chrome — nav rail,
  sticky page header, modals/sheets, chat sidebar, toasts, the voice-mode backdrop. **Never** under charts, tables,
  or numeric readouts; data planes are solid `--bg-2/--bg-3` with hairline borders. Glow (`--shadow-glow`) reserved
  for the primary card per screen (recommendation card, replay card) so it stays special.
- **Primitives to build (one pass, reused everywhere):** Card (resting/elevated/glow), Button (primary grad / ghost /
  danger), Select+Combobox (type-ahead), Slider + DualRangeSlider, Tabs (underline + segmented), StatusStepper,
  StatCard/MetricRow, Pill/Badge (compound, sentiment, intent-flag, entity chip), Gauge (ECharts wrapper), ChartCard
  (title + actions + maximize + collapse), DataTable (TanStack), Modal/Sheet, Toast, EmptyState, Skeleton, Markdown
  renderer (chat/RAG), FileDrop.
- **Motion registers:** *Calm (default, Linear-tier):* 150–220 ms fades/slides on route + card mounts, stagger ≤ 40 ms,
  count-up on metrics, no parallax, nothing looping on data screens. *Expressive (reserved):* Home hero (Three.js),
  Comparison replay, voice orb, onboarding welcome. Both registers under `prefers-reduced-motion`.

### 2.4 Audit 4 — Performance

The core "make it faster" case. Bottleneck → cause → target remedy → expected win:

| ID | Sev | Bottleneck | Cause (file) | Target remedy | Expected win |
|---|---|---|---|---|---|
| P4-1 | **P0** | Every widget interaction re-runs the whole page script server-side; UI feels 0.5–3 s laggy everywhere | Streamlit execution model (`app/main.py` re-imports+re-renders per event) | SPA: state changes are client-local; server data comes from TanStack Query cache | Interaction p95 from ~1–3 s → **<100 ms**; selector toggles instant |
| P4-2 | **P0** | Comparison replay: multi-MB pre-baked Plotly figure (300 frames × 5 subplots), ~10 fps playback, SVG transport | `synchronized_comparison_animation.py` (1,115 LOC) builds all frames in Python and ships them as figure JSON | Fetch raw channel arrays once (`GET /api/v1/comparison/compare` already returns them), interpolate + draw client-side in a rAF canvas loop; GSAP-polished HTML transport | Payload **−90%+** (MBs → ~200–500 kB), playback **10 → 60 fps**, scrub latency ~0 |
| P4-3 | **P1** | 8 Plotly charts re-serialized over the websocket on every dashboard rerun | `st.plotly_chart` semantics; 7 telemetry builders + lap chart | Data cached in Query; ECharts updates via `setOption` diff; charts never refetch on UI toggles (F1-5) | MBs of websocket traffic per click → 0; toggle outliers/invalid = pure client transform |
| P4-4 | **P1** | Chat token streaming re-renders the whole markdown block per token batch server-side | `st.empty()` placeholder pattern in `pages/chat.py` | Append tokens to the live DOM node; virtualized message list; markdown parsed incrementally | Smooth streaming at any history length; render cost per token **−95%** |
| P4-5 | **P1** | Stage narration for chat does **extra polling** of `/chat/status` alongside the SSE stream | `chat_service.py:258` (`get_current_stage`) | Consume the stage events already present in the SSE stream; delete the poll path | −1 request/sec during generation; simpler client |
| P4-6 | **P1** | Full app cold boot loads the entire Python frontend + Streamlit runtime | Streamlit server | Static SPA from nginx; route-level code-splitting (ECharts, r3f, chat, voice = separate chunks) | First paint **<1 s** on localhost; initial JS ~350–500 kB gz vs Streamlit's multi-MB runtime+websocket bootstrap |
| P4-7 | **P2** | Base64 image-encoding logic duplicated 4× in the chat path | `chat_service.py:116/175/231/296` | One `toDataUri()` util in the TS API layer | Bug-surface removal (behavioral parity, less code) |
| P4-8 | **P2** | Cascading selectors trigger sequential reruns (year → GP → session → drivers = 4 round-trips of full page) | `components/common/data_selectors.py` + rerun model | Query prefetch: GP list keyed by year, sessions by GP, drivers by session — fired in parallel where legal, all cached | Selector cascade fills in one visible beat |
| P4-9 | **P2** | Model Lab Pace = 69-lap batch inference, 45–60 s with a blocking spinner (dossier #24 couldn't even capture it) | Backend latency (legitimate) + no cancel | Non-blocking: request cancellation (AbortController), skeleton chart, scripted progress; page remains usable during the run | Perceived wait dramatically down; no UI lock; backend latency itself unchanged (out of scope) |
| P4-10 | **P3** | "Loading ML models (first run…)" blocks chat first use | Backend warmup | Fire a warmup ping on app boot (idle), so first real request is warm | First-chat latency hidden in onboarding time |

### 2.5 Audit 5 — Architecture, data layer & state

| ID | Sev | Finding | Decision |
|---|---|---|---|
| A5-1 | **P0** | `session_state` is a single grab-bag (~40 meaningful keys, inventoried in §6.8) mixing server data, UI state, and persistence-worthy data (chats/reports vanish on refresh today). | **Three-tier target state model:** (1) **URL search params** — all selector state (typed, shareable); (2) **TanStack Query** — every backend read, keyed `[domain, params]`, cached + deduped; (3) **Zustand slices** — UI/ephemeral (chat draft, streaming buffers, replay transport, voice recorder). **localStorage** (namespaced `f1sl.*`) for chats, reports, onboarding-done, rail collapsed. Parity note: persistence of chats/reports *improves* on today (session-only) — flagged as an accepted behavior delta in §6.8. |
| A5-2 | **P0** | Chat protocol: `POST /api/v1/chat/tool-message-stream` streams `event:`/`data:` SSE frames (stages: `preparing_tools`, `model_choosing_tool`, `calling_<tool>`, `summarizing`, `composing` + token deltas + tool results). Native `EventSource` can't POST. | One small **fetch-streaming SSE client** built on `eventsource-parser` (tiny, battle-tested), with AbortController for Stop. Written transport-generic so `/strategy/simulate` SSE (F1-7) and the **future WebSocket live-timing feed** plug into the same `RaceFeed`-style interface — SSE adapter now, WS adapter later, consumers unchanged. |
| A5-3 | **P0** | **MCP contract preserved by doing nothing:** the SPA speaks only REST/SSE; the MCP client lives in the backend (`mcp_bridge.py` ↔ `mcp_tools.py`, single source of truth for tool schemas). No MCP code in the frontend — the thesis claim ("the chat is an MCP client of the backend's own MCP server") is untouched. | Explicit non-goal: no MCP-over-HTTP from the browser. |
| A5-4 | **P1** | API surface consumed by the UI (verified against `backend/api/v1/endpoints/*` + `frontend/services/*`): telemetry (`/gps /sessions /drivers /lap-times /lap-telemetry /race-data /data`), `/circuit-domination`, `/comparison/compare`, strategy (`/available-gps /available-drivers /lap-range /lap-state /pace /pace-range /tire /situation /pit /radio /rag /recommend /radio-available-gps /radio-laps /radio-transcript`), chat (`/tool-message`, `/tool-message-stream`, `/status`, `/models`, `/health`), voice (`/transcribe /synthesize /voice-chat /voices /health`). | One typed API layer: hand-written TS types per endpoint now; **generate from FastAPI's OpenAPI schema** (`openapi-typescript`) as soon as W0 lands, so drift is caught at compile time. |
| A5-5 | **P1** | CORS: backend allows exactly `FRONTEND_URL` (default `http://localhost:8501`) with credentials (`backend/main.py:40-45`). | **Serve the SPA on `:8501`** and keep same-origin discipline anyway: the nginx container reverse-proxies `/api/*` → `backend:8000` with `proxy_buffering off` on the SSE routes. Result: no CORS in play at all, no backend change, SSE-safe, and the compose port contract (`8501` = UI) survives for muscle memory and docs. Vite dev mode mirrors it with `server.proxy`. |
| A5-6 | **P1** | Dossier Findings 1–3 (repo-root walker breaks bare-metal data paths; `openai-whisper` build failure on fresh venv; `fastmcp` missing from `pyproject.toml` vs `requirements.txt` drift) are **backend/packaging bugs, not UI scope** — but they hit the migration because SPA devs will run the backend locally. | File three backend issues before W2 (see §9). Dev guidance until fixed: run the backend via Docker (walker has the `/app` fallback) or export `F1_STRAT_DATA_ROOT`. Post-migration bonus: deleting the Streamlit tree removes the frontend's Python deps entirely — the natural moment to unify the two backend manifests. |
| A5-7 | **P2** | Voice pipeline: mic capture → `POST /voice/transcribe` → chat → `POST /voice/synthesize` (or combined `/voice-chat`) → playback, orb reacts to audio level (`useAudioLevel.ts`). | MediaRecorder + WebAudio AnalyserNode in a `useVoiceSession` hook; orb consumes the same level signal it does today. No backend change. |

**Target folder structure** (inside the `F1_Telemetry_Manager` submodule; sibling to the Streamlit tree during the
strangler window, becomes `frontend/` at cutover):

```
webapp/
├── index.html · vite.config.ts · nginx.conf · Dockerfile
├── src/
│   ├── app/            # router, providers, shell (rail, header, theme, error boundary)
│   ├── features/
│   │   ├── home/  dashboard/  strategy/  race-analysis/  model-lab/
│   │   ├── comparison/ # incl. replay engine (rAF loop, interpolator, track renderer)
│   │   ├── chat/       # message list, tool badges, toolResult→chart dispatcher, reports
│   │   ├── voice/      # AudioOrb (lifted), recorder, voice session hook
│   │   └── onboarding/ # welcome, guided setup, tour, empty-state registry
│   ├── components/     # the §2.3 primitives
│   ├── charts/         # echarts theme from tokens + one builder module per chart family
│   ├── lib/            # api client (typed), sse client, query keys, format utils (time, gaps)
│   ├── stores/         # zustand slices: chat, voice, replay, ui
│   └── styles/         # tokens.css (ported), tailwind theme, fonts/
└── tests/              # vitest unit + playwright e2e (dossier screenshot recipe reused)
```

**Dependencies (each justified):** `react`/`react-dom` (framework, §1.2) · `typescript` (drift safety on a 40-endpoint
contract) · `vite` (dev speed, build) · `@tanstack/react-router` (typed URL search params = U2-1) ·
`@tanstack/react-query` (server-state cache = P4-1/3/8) · `zustand` (ephemeral state, no boilerplate) · `tailwindcss` v4
(token mapping) · Radix primitives (accessible select/tabs/slider/dialog) · `echarts` (§1.2 chart verdict) · `gsap` +
`@gsap/react` (motion) · `three` + `@react-three/fiber` + `@react-three/drei` (hero/enhancement only, code-split) ·
`ogl` (orb, already in-tree) · `eventsource-parser` (SSE frames) · `@tanstack/react-table` + `@tanstack/react-virtual`
(dataset table, chat list) · `react-markdown` (chat/RAG rendering) · dev: `vitest`, `@playwright/test`,
`openapi-typescript`, ESLint+Prettier. **Nothing else** — no UI kit, no CSS-in-JS, no state framework beyond the above.

---

## 3. Target architecture

### 3.1 Runtime topology (replaces the `:8501` Streamlit service; backend untouched)

```
docker compose up  (from src/telemetry/)
├── backend   :8000  FastAPI + FastMCP  (UNCHANGED — same image, mounts, env)
└── webapp    :8501  nginx:alpine
      ├── /            → static SPA build (dist/)
      └── /api/*       → proxy_pass http://backend:8000  (proxy_buffering off on SSE paths)
Dev mode: vite dev server on :5173 with server.proxy → localhost:8000 (same-origin either way)
```

- Multi-stage Dockerfile: `node:22-slim` build → `nginx:alpine` serve (precedent: the current frontend Dockerfile
  already runs a node build stage for the orb).
- Local-only posture holds: fonts bundled, zero external requests, no auth, no analytics, no SSR.

### 3.2 State model — `session_state` → three tiers (A5-1)

| Tier | Holds | Examples (from the §6.8 key inventory) |
|---|---|---|
| URL search params (typed) | Everything that defines *what you're looking at* | year/gp/session/drivers, strategy lap-range+risk, active tabs, model-lab lap |
| TanStack Query cache | Everything the backend said | GP/driver lists, lap times, telemetry channels, `strategy_result`, `race_analysis_df` equivalent, radio transcripts, RAG answers, ml_* results |
| Zustand + localStorage | Everything the user *did* | chat history/saved chats/reports (persisted, `f1sl.*`), voice recorder + playback state, replay transport, streaming buffers, onboarding-done |

### 3.3 Data fetching

Query keys mirror the REST paths; `staleTime: Infinity` for immutable race data (it's historical), invalidation only on
explicit re-run actions. Expensive POSTs (`/strategy/recommend`, `/pace-range`, agent runs) are **mutations** with
AbortController wiring for cancel/Stop. Prefetch on hover for the selector cascade (P4-8) and on Home quick-start cards.

### 3.4 Streaming

One SSE module (A5-2): `postStream(url, body, {onStage, onToken, onToolResult, onError, signal})`. Chat consumes it
today; `/strategy/simulate` and the future WS live-timing feed are adapters behind the same consumer interface — the
WS seam costs one file later, no consumer churn.

### 3.5 Chart strategy per family

| Family (current impl) | Target | Notes |
|---|---|---|
| Lap-time chart with click-to-load (`dashboard/lap_graph.py`, 603 LOC) | ECharts line+scatter, native point-click event | Compound-colored points preserved |
| 7 telemetry channels (`components/telemetry/*`) | ECharts, one shared builder + per-channel config; `connect` for synced crosshairs | Progressive rendering for 5k+ point series |
| Circuit domination (`circuit_domination.py`) | Custom SVG/canvas polyline segments colored per driver | It's a map, not a chart — trivial direct draw |
| Strategy scenario bars, agent charts, cliff bars, horizon bars, stop-duration bars | ECharts bar | One themed builder |
| Gauges (overtake/SC/undercut) | ECharts gauge series | Token-themed |
| Race-analysis tyre/gap families (`tire_charts.py`, `gap_charts.py`, `race_viz.py` 674 LOC) | ECharts line/scatter/bar + zone annotations (markArea) | Strategy-zone shading maps to markArea |
| Chat inline charts (`chart_builders.py` dispatcher) | TS dispatcher `toolName → EChartsOption` (F1-1) | Same tool-name switch, same data contracts |
| **Comparison replay** (`synchronized_comparison_animation.py`, 1,115 LOC) | **Custom engine:** fetch channels once → distance-domain interpolation → rAF canvas loop drawing track dots + 4 synced ECharts (or lightweight canvas) cursors → HTML transport + scrubber, GSAP micro-interactions | The flagship; 60 fps; Three.js version = enhancement, not parity |
| Dataset overview table (`st.dataframe`) | TanStack Table + virtualizer, CSV export | Kills the most "generic Streamlit" element (dossier #21) |

### 3.6 GSAP + Three.js integration

- GSAP: registered once; `useGSAP` scoping per feature; route transitions in the shell; StatusStepper timeline;
  count-ups; replay transport feel. All gated by `prefers-reduced-motion`.
- Three.js/r3f: mounted **only** in `features/home/Hero` (and later the replay-3D enhancement); lazy chunk; falls back
  to a static gradient (`--grad-hero`) instantly if WebGL is unavailable — data screens never depend on it.

---

## 4. UI/UX & layout design

### 4.1 Shell

Acrylic left icon rail (72 px, expandable to 220 px) + acrylic sticky page header (page title, context summary chips —
e.g. "2024 · Bahrain · R", global actions). Content plane: solid `--bg-0/1`, max-width fluid, 24 px gutters. The
`--grad-hero` halo lives on the shell background only — never behind chart cards. Route changes: 180 ms GSAP
fade/slide of the content plane; rail and header persist (no full-page flash — the anti-Streamlit feel in one detail).

### 4.2 Per-screen direction (register: **calm** unless stated)

- **Home (new):** the one **expressive** surface. Space Grotesk display headline, Three.js track-ribbon hero moment
  (restrained: slow drift, purple glow), three quick-start cards (Strategy / Comparison / Chat) with glow-on-hover,
  recent-activity list from localStorage. Also the onboarding host (§4.6).
- **Dashboard:** selectors move into a compact toolbar row (combobox pills); lap chart card keeps click-to-load with a
  hover tooltip teaching it ("click a lap to load telemetry"); tyre legend as compound pills + per-driver counts;
  telemetry workspace = 2-col ChartCard grid with maximize + grid⇄stack toggle (U2-3); circuit domination card sits
  beside the legend; "Go to Comparison" becomes a context-carrying link (same URL params).
- **Strategy:** layout preserved 1:1 (dossier keep). Run button → StatusStepper narration (scripted stages, U2-6) →
  recommendation card gets the app's single strongest treatment: glow border, action verb in display type, animated
  confidence count-up, LLM reasoning as comfortable prose (65ch measure), scenario bars animating in with stagger.
  Agent sub-tabs = segmented tabs, each with MetricRow + chart + collapsible reasoning. JSON download kept.
- **Race Analysis:** loader panel (GP + load button + file-drop fallback F1-4) collapses to a summary chip row after
  load; 5 tabs preserved; tyre tab gets the chart switcher + small-multiples toggle (U2-4); gap tab keeps the
  3-metric strategic-windows summary as StatCards; radio tab keeps the activation gate (styled as a deliberate
  "Arm the pipeline" card), transcript with sentiment pill / intent flags / entity chips as token-colored badges;
  FIA tab = query box + streaming-in answer card with citation footnote styling; dataset tab = the new DataTable.
- **Model Lab:** shared context bar (GP/driver/lap) inherited by all 6 tabs (U2-5, Radio override affordance);
  per-tab pattern preserved; gauges get the ECharts token theme; Pace tab gets cancel + skeleton (P4-9).
- **Comparison (flagship, expressive register on the replay card only):** selector row → COMPARE → result banner
  (lap times + "VER finished first by 1.482s") → the replay card: track canvas left, 2×2 synced charts right,
  transport bar (real buttons: play/pause/reload, speed toggle, frame scrubber with lap-progress markers). 60 fps.
  This screen is the demo centerpiece; it earns the motion budget.
- **AI Chat:** sidebar (acrylic): mode toggle (Text ⇄ Voice), New Chat, saved chats (rename inline), Reports section
  with count + downloads. Main: virtualized message list; example-prompt chips on empty state (kept verbatim —
  dossier praises them); tool-call badges as pills with tool icon + name; inline charts from the dispatcher; the
  graceful-degradation pattern preserved exactly (tool error card in `--danger` + the LLM's plain-English follow-up);
  stage chips narrating the SSE stages; Stop button; image attach; report flow.
- **Voice mode:** the orb, centered, lifted as-is (ogl); voice picker (from `/voices`); record bar with timer;
  the acrylic backdrop treatment is allowed here (no data behind it).

### 4.3 Windowing/layout rules

12-col fluid grid; chart cards min 480 px; two-driver comparisons always side-by-side ≥1280 px; every dense surface
scrolls inside its own card (`overflow` contained), the page itself never scrolls horizontally; sticky context header
keeps "where am I" visible in long tabs.

### 4.4 Keyboard

Tab-order + focus rings everywhere (Radix defaults); `/` focuses chat input on `/chat`; arrow keys scrub the replay;
Esc closes overlays. ⌘K palette is enhancement (§7).

### 4.5 Empty states

Every page gets a designed EmptyState (icon, one line of copy, single primary action) replacing bare info banners:
Dashboard ("Pick a season to start"), Strategy ("Only 2025 season data is currently available" retained as a chip,
not a warning wall), Race Analysis ("Load a race to unlock 5 analysis tabs"), Model Lab, Comparison ("Pick 2
drivers"), Chat (example chips). These are parity-plus, not scope creep — they replace existing placeholder banners.

### 4.6 Onboarding / first-run flow (new — see F1-6; its own workstream W9)

Gate: `f1sl.onboarded.v1` in localStorage; shown once; re-launchable from a Help (?) menu in the rail.

1. **Welcome** (acrylic overlay on Home, expressive register): brand moment, one paragraph of what the app is, two
   buttons — "Set me up" / "Skip".
2. **Guided setup** (3 steps, powered by the same endpoints — no new backend): pick season → GP → driver
   (cascading, same comboboxes as Dashboard); choice is written into the URL defaults and localStorage so every page
   opens pre-contextualized.
3. **Feature tour** (4 anchored coach marks, skippable at any point): ① Strategy recommendation card ("this is the
   centerpiece — run it"), ② Chat example chips ("or just ask"), ③ Dashboard lap-chart click interaction (the app's
   least discoverable gesture), ④ Comparison COMPARE ("the flagship replay").
4. **Warmup piggyback:** during the tour, fire the model-warmup ping (P4-10) so the first real request is warm.

---

## 5. Component migration map

Verdicts: **KEEP-DESIGN** = same visual/interaction design, re-implemented in target stack · **ADAPT** = design kept
with the specific improvement noted · **REBUILD** = new implementation and/or new design. Effort: S ≈ ≤1 d, M ≈ 2–4 d,
L ≈ 5–8 d (solo).

| Current (file under `frontend/`) | Target | Verdict | Effort |
|---|---|---|---|
| `app/main.py` + `components/layout/navbar.py` (tab nav, `current_page`) | Router + shell (rail, header, transitions) | REBUILD (nav paradigm: tabs → rail + URLs) | M |
| `app/styles.py` GLOBAL_CSS | Tailwind theme from `tokens.css` + primitives | REBUILD | M |
| `components/common/data_selectors.py` + `dashboard/data_selectors.py` | Toolbar of typed comboboxes bound to URL params | ADAPT (V3-4 type-ahead) | M |
| `components/dashboard/lap_graph.py` (603) | ECharts lap chart + click-to-load + compound coloring | KEEP-DESIGN | M |
| `components/telemetry/{speed,delta,throttle,brake,rpm,gear,drs}_graph.py` (~1,700 total) | One ECharts telemetry builder + 7 channel configs in ChartCards | ADAPT (stack → grid, U2-3) | M |
| `components/telemetry/circuit_domination.py` | Custom SVG/canvas microsector map | KEEP-DESIGN | M |
| `components/dashboard/css_styles.py`, `common/chart_styles.py`, `common/driver_colors.py` | ECharts theme module + token constants | REBUILD (centralized, V3-3) | S |
| `components/common/{loading,link_button,ask_about_button}.py` | Skeleton, Link, "ask AI about this" affordance | KEEP-DESIGN | S |
| `pages/dashboard.py` (107) | `features/dashboard` route | ADAPT | S |
| `pages/strategy.py` (275) + `components/strategy/{strategy_card,agent_tabs,scenario_chart}.py` | `features/strategy`: StatusStepper, recommendation card, agent tabs, scenario bars, JSON download | KEEP-DESIGN (centerpiece — pixel-respect the dossier) | L |
| `pages/race_analysis.py` (438) + `race_analysis/{tire_charts,gap_charts,radio_panel}.py` + `utils/race_{processing,viz}.py` (803) | `features/race-analysis`: 5 tabs, loader+file-drop, chart switcher, radio gate + NLP badges, RAG card, DataTable | ADAPT (U2-4; table REBUILD) | L |
| `pages/model_lab.py` (929) | `features/model-lab`: shared context bar + 6 tabs + gauges + cancelable runs | ADAPT (U2-5, P4-9) | L |
| `pages/comparison.py` (158) + `comparison/synchronized_comparison_animation.py` (1,115) | `features/comparison` replay engine (canvas, rAF, synced charts, HTML transport) | REBUILD (same layout, new engine — P4-2) | L |
| `components/comparison/legacy/*` (5 files, ~1,090) | — superseded by the replay engine; not ported | REBUILD n/a (confirm dead code, §9) | — |
| `pages/chat.py` (532) + `chatbot/{chat_history,chat_input,chat_message,chat_sidebar,tool_result_renderer}.py` (~1,420) | `features/chat`: virtualized list, SSE streaming, stage chips, Stop, tool badges, image attach, sidebar, reports | KEEP-DESIGN | L |
| `components/chatbot/chart_builders.py` (531) | TS `toolResult → EChartsOption` dispatcher (F1-1) | KEEP-DESIGN | M |
| `utils/{chat_state,chat_navigation,report_storage}.py` (~605) | Zustand chat slice + localStorage persistence + reports store | ADAPT (persistence upgrade, A5-1) | M |
| `components/voice/{voice_chat,voice_input}.py` (656) + `utils/audio_utils.py` | `features/voice`: `useVoiceSession` (MediaRecorder + AnalyserNode), record bar, playback | KEEP-DESIGN | M |
| `components/streamlit_audio_viz/` (React+ogl orb, webpack) | **Lift `AudioOrb.tsx`/`Iridescence.tsx`/`useAudioLevel.ts` into `features/voice`**; drop the streamlit-component iframe harness + webpack | KEEP-DESIGN (near-verbatim) | S |
| `services/{telemetry,strategy,chat}_service.py` + `services/voice_api.py` (~1,420) | Typed API layer + SSE client + Query hooks | REBUILD (typed, deduped — P4-7) | M |
| `frontend/config.py` | Vite env (`VITE_API_BASE`) + nginx proxy | REBUILD | S |
| — (does not exist) | `features/onboarding` (§4.6) | NEW | M |
| — (does not exist) | `features/home` (hero + quick-start) | NEW | M |

---

## 6. Feature-parity checklist (anti-loss contract)

Rule: a phase is not "done" until every row of its page reads ✅ against the dossier screenshot cited. Ambiguities are
open questions (§9) — never silent drops.

### 6.1 Dashboard (dossier #1–3)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| Year → GP → Session cascading selectors | `common/data_selectors.py` | ✔ | Toolbar comboboxes (URL-bound) |
| Driver multiselect, max 3, gated on upstream | same | ✔ | Multi-combobox with cap |
| Lap-time chart; click a point → loads that lap's telemetry | `dashboard/lap_graph.py` | ✔ | ECharts click event → telemetry queries |
| SELECT FASTEST LAPS batch load | `pages/dashboard.py` | ✔ | Button → parallel queries |
| SHOW/HIDE OUTLIERS (client IQR) / SHOW/HIDE INVALID LAPS | `lap_graph.py` | ✔ | Client-side transforms (instant) |
| Tyre-compound legend: compound icons + per-driver lap counts | `pages/dashboard.py` | ✔ | Compound pills + counts |
| "Showing telemetry: VER (Lap 39)…" context caption | same | ✔ | Header context chips |
| 7 telemetry charts (Speed/Delta/Throttle/Brake/RPM/Gear/DRS) | `components/telemetry/*` | ✔ | ChartCard grid (grid⇄stack toggle) |
| Per-chart collapse control | telemetry cards | ✔ | ChartCard collapse |
| Circuit Domination microsector map | `circuit_domination.py` | ✔ | Custom canvas/SVG |
| GO TO COMPARISON cross-link | `common/link_button.py` | ✔ | Context-carrying route link |

### 6.2 Strategy (dossier #5–11)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| "Only 2025 season data" notice | `pages/strategy.py` | ✔ | Info chip |
| GP / Driver / optional Rival selectors | same | ✔ | Comboboxes |
| Lap-range dual slider + risk-tolerance slider (0–1) with captions | same | ✔ | DualRangeSlider + Slider |
| Run strategy → narrated stages ("Building lap state…" → "Running agents (Pace·Tire·Pit·SC·Radio)…" → complete/error) | `pages/strategy.py:210-230` | ✔ | StatusStepper (same scripted stages) |
| Lap snapshot metrics (compound, tyre age, gap ahead, lap time, SC prob) + rival snapshot | `strategy_card.py` | ✔ | MetricRow |
| Recommendation card: action + confidence % + LLM reasoning prose | same | ✔ | Glow card (§4.2) |
| Scenario score bar chart (4 candidates) | `scenario_chart.py` | ✔ | ECharts bars |
| JSON result download | `pages/strategy.py` | ✔ | Blob download |
| 4 agent sub-tabs (Pace / Tyres deg-rate + cliff P10/50/90 / Race situation / Pit: compound rec, stop P05/50/95, undercut %) each with collapsible reasoning | `agent_tabs.py` | ✔ | Segmented tabs + MetricRow + charts + disclosure |

### 6.3 Race Analysis (dossier #12–21)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| GP selector + "Load race data" | `pages/race_analysis.py` | ✔ | Loader panel |
| Manual CSV/parquet upload fallback (collapsed) | same (F1-4) | ✔ | FileDrop in loader |
| Driver multiselect (max 3) filtering all tabs | same | ✔ | Multi-combobox (URL-bound) |
| Tab 1 Tyre deg: 5 charts (speed-vs-age, fuel-adjusted, per-compound ×2, deg-rate, %-deg) | `tire_charts.py`, `race_viz.py` | ✔ | Chart switcher + show-all toggle (all 5 preserved) |
| Tab 2 Gaps: 3 charts + strategic-windows 3-metric summary | `gap_charts.py` | ✔ | ECharts + StatCards |
| Tab 3 Radio: activation gate → driver/lap lookup → transcript + sentiment pill + intent flags + entity chips | `radio_panel.py`, `radio_last_result` | ✔ | Gate card → NLP result card |
| Tab 4 FIA regulations: query → RAG answer with article citation | `pages/race_analysis.py`, `rag_last_result` | ✔ | Query card → answer + citation |
| Tab 5 Dataset overview: metrics row + full table + CSV export | same | ✔ | StatCards + DataTable + export |
| Per-tab JSON/CSV downloads | tabs | ✔ | Card action buttons |

### 6.4 Model Lab (dossier #22–29)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| GP + Driver selectors; lap-range slider (Pace) + single-lap slider (others) | `pages/model_lab.py` | ✔ | Shared context bar |
| 6 tabs, each: Run button → metrics → chart → collapsible reasoning | same | ✔ | Tab pattern preserved |
| Pace: batch lap-range run (45–60 s) | `ml_pace_range` | ✔ | + cancel & skeleton (P4-9) |
| Tyres: cliff bar chart + degradation projection | `ml_tyre_result` | ✔ | ECharts |
| Overtake: probability gauge + contextual factors | `ml_overtake_result` | ✔ | ECharts gauge |
| Safety car: gauge + 3/5/7-lap horizon bars | `ml_sc_result` | ✔ | Gauge + bars |
| Pit: compound rec, stop-duration bars, undercut gauge, pit-window details | `ml_pit_result` | ✔ | Cards + charts |
| Radio: lookup mode (own GP/driver/lap via `/strategy/radio-*`) **and** free-text mode | `ml_radio_lookup_result`, `ml_radio_free_result` (F1-3) | ✔ | Inherited context + override; both modes |

### 6.5 Comparison (dossier #30–33)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| Year/GP/Session + 2-driver multiselect (cap 2) + COMPARE | `pages/comparison.py` | ✔ | Toolbar + button |
| "Only fastest laps compared" notice; lap-times result box ("X finished first by Ns") | same | ✔ | Info chip + result banner |
| Circuit animation: 2 colored dots on track outline | `synchronized_comparison_animation.py` | ✔ | Canvas replay engine |
| 4 synced subplots (Delta/Speed/Brake/Throttle) scrubbing together | same | ✔ | Synced cursors from replay clock |
| Play / Pause / Reload + frame slider | same | ✔ | HTML transport + scrubber (accessible — fixes dossier #33) |

### 6.6 AI Chat (dossier #34–37)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| Sidebar: Text/Voice toggle, New Chat, saved-chat list + rename, Reports(n) | `chat_sidebar.py`, `chat_saved_chats` | ✔ | Acrylic sidebar |
| Empty state: 4 example-prompt chips | `chat_history.py:199` | ✔ | Kept verbatim (copy + behavior) |
| Chat input (Enter to send) + image attach (base64 data-URIs) | `chat_input.py`, `chat_service.py` | ✔ | Composer + attach |
| SSE streaming with stage narration + Stop | `chat_service.py`, `chat_should_stop` | ✔ | SSE client + stage chips + abort |
| Tool-call badges per invoked tool | `tool_result_renderer.py` | ✔ | Tool pills |
| Inline charts from tool results (lap-times / telemetry / compare / race-data) | `chart_builders.py` (F1-1) | ✔ | TS dispatcher → ECharts |
| Graceful tool-error pattern: red error box + LLM plain-English explanation | dossier #36 | ✔ | Error card + assistant follow-up (both) |
| Report generation → Markdown download; reports listed in sidebar | `report_storage.py` | ✔ | Reports store + download |
| System prompt + injected F1 context | `chat_system_prompt`, `chat_f1_context` | ✔ | Chat slice config |

### 6.7 Voice (dossier #38)
| Feature | Current file | Must exist | Target |
|---|---|---|---|
| Audio-reactive orb | `streamlit_audio_viz` (React+ogl) | ✔ | Lifted component |
| Voice picker from `GET /voice/voices` | `voice_chat.py`, `selected_voice` | ✔ | Combobox |
| Mic record bar + timer; transcribe → chat → synthesize (`/transcribe`, `/voice-chat`, `/synthesize`) | `voice_input.py`, `voice_api.py` | ✔ | `useVoiceSession` |
| Playback state, voice history, services-ready guard | `is_playing`, `voice_history`, `voice_services_ready` | ✔ | Voice slice |

### 6.8 `session_state` key disposition (meaningful keys)

`chat_history`, `chat_saved_chats`, `current_chat_name`, `chat_mode`, `chat_f1_context`, `chat_system_prompt`,
`chat_streaming`, `chat_should_stop`, `chat_current_request_id`, `chat_pending_text`, `chat_input_key`,
`pending_auto_send` → **chat slice** (persisted: history/saved/reports — an accepted improvement over today's
session-only lifetime). `voice_history`, `voice_status`, `voice_processing`, `voice_services_ready`, `selected_voice`,
`is_recording`, `is_playing`, `current_audio`, `play_start_time`, `last_processed_audio` → **voice slice** (ephemeral).
`strategy_result`, `strategy_lap_state`, `ml_*_result` (6), `race_analysis_df`, `ra_loaded_gp/year`,
`ra_driver_numbers`, `ra_radio_active/last_gp`, `radio_last_result`, `rag_last_result` → **Query cache** keyed by
params. `current_page` → **router**.

---

## 7. Enhancement & reorg backlog (additive — none of this gates parity)

| # | Enhancement | Motivating audit | Impact / Effort |
|---|---|---|---|
| E1 | Real light theme (designed pass over semantic tokens) | V3-1 (dossier Finding 4) | Med / M |
| E2 | ⌘K command palette (navigate, jump to GP/driver, run actions) | U2-8 | High / M |
| E3 | Comparison replay 3D upgrade (r3f track with elevation, camera follow) | dossier #32, §1.2 | High(demo) / L |
| E4 | One-click report download (+toast) replacing 2-step | U2-7 | Low / S |
| E5 | Chat/report persistence UX: search, pinning, export-all | A5-1 | Med / M |
| E6 | Real backend progress events for `/strategy/recommend` (per-agent stages over SSE) — backend change, needs approval | U2-6 | Med / M (backend) |
| E7 | Live-timing WS adapter behind the `RaceFeed` interface (consumes the planned `lap_state` feed) | A5-2, F1-7 | High(future) / M |
| E8 | "Ask the AI about this chart" deep-links from any chart into chat with context | U2-9 | Med / S |
| E9 | Playwright visual-regression suite seeded from the 37 dossier PNGs | dossier method note | High(safety) / M |
| E10 | Model Lab run history (compare successive runs of the same agent) | Model Lab UX | Low / M |
| E11 | Backend manifest unification (`pyproject.toml` ⇄ `requirements.txt`) once the Streamlit Python frontend is deleted | A5-6 (Finding 3) | Med(hygiene) / S |
| E12 | Home hero Three.js track ribbon (if not landed in W9's budget) | §4.2 | Med(brand) / M |

## 8. Suggested phasing

Sized S/M/L as in §5; deps noted. Each workstream = one epic → 1–3 PRs into the submodule; parity phases each close
with a check against §6 rows + the corresponding dossier PNGs. **Strangler mechanics:** the SPA grows at
`webapp/` beside the untouched Streamlit tree; during W2–W9 compose runs **both** UIs (Streamlit on :8501, SPA on
:3000) so every migrated page can be compared side-by-side against the live original; cutover (W10) swaps ports.

| WS | Scope | Size | Depends on |
|---|---|---|---|
| **W0 Foundations** | Vite+TS scaffold in `webapp/`; Tailwind theme from `tokens.css`; fonts; typed API layer + openapi-typescript; SSE client; Query/Router/Zustand wiring; ECharts token theme; Docker (nginx multi-stage) + compose service on :3000; CI (lint/typecheck/build/vitest) | M | — |
| **W1 Design system** | The §2.3 primitives + shell (rail, header, transitions, EmptyState/Skeleton) | M | W0 |
| **W2 Pilot: Dashboard** | Full §6.1 parity; proves data layer, URL state, chart theme, click-interactions; side-by-side vs dossier #1–3 | M | W1 |
| **W3 Strategy** | §6.2; StatusStepper; recommendation card treatment | M | W1 (parallel-safe with W2 after primitives) |
| **W4 Comparison (flagship)** | §6.5; canvas replay engine 60 fps; transport; GSAP polish | L | W2 (reuses telemetry fetch) |
| **W5 Race Analysis** | §6.3; 5 tabs; DataTable; radio gate; RAG card | L | W2 |
| **W6 Model Lab** | §6.4; unified context; cancelable runs; gauges | M | W3 (reuses agent-run patterns) |
| **W7 Chat** | §6.6; SSE streaming; tool dispatcher (F1-1); reports | L | W0 SSE client + W1 |
| **W8 Voice** | §6.7; orb lift; recorder; playback | M | W7 |
| **W9 Onboarding + Home** | §4.6 flow; Home hero + quick-start; empty-state registry; warmup ping | M | W2, W3, W4, W7 (tour anchors must exist) |
| **W10 Cutover** | SPA takes :8501; Streamlit service removed from compose (tree kept one release behind a `--legacy` compose profile, then deleted); README/INSTALL/thesis-facing docs updated; full §6 regression + dossier-PNG visual pass; file E11 | S | all |

Solo-dev calendar estimate: **~7–9 weeks part-time** (W2–W8 are parallelizable in pairs if sub-agents/second dev join).

**Estimated improvements at cutover** (baselines from audit 4):
- **Perf:** interaction p95 ~1–3 s → **<100 ms**; comparison payload **−90%+**, playback **10 → 60 fps**; cold start
  **<1 s** first paint; chat rendering cost per token **−95%**; zero full-page reruns.
- **UX:** deep-linkable everything (U2-1); 5,900 px scroll → grid workspace; onboarding + designed empty states;
  accessible transport controls; keyboard navigation.
- **Maintainability:** ~14.8k Python frontend LOC → est. **~10–12k TS** with a reusable primitive layer and one
  chart theme (today: 8 near-duplicate chart builders + 5 dead legacy comparison files); compile-time API-contract
  checking via generated OpenAPI types; frontend Python deps deleted (shrinks the pyproject/requirements drift
  surface, Finding 3).

## 9. Risks & open questions

**Risks**
1. **ECharts parity gaps on niche Plotly behaviors** (e.g. exact zone-annotation rendering in gap charts). Mitigation:
   per-family acceptance vs dossier PNGs at each workstream close; named fallback = plotly.js for that family only
   (bundle hit accepted locally, revisit later).
2. **Replay-engine correctness** (distance-domain sync of two laps is the subtle heart of `synchronized_comparison_animation.py`).
   Mitigation: port the interpolation math first with unit tests against a captured `/comparison/compare` fixture
   before any rendering work.
3. **Chat protocol drift** — the SSE stage/token/tool-result frame shapes are only informally specified. Mitigation:
   record real SSE transcripts as fixtures in W0; contract-test the TS parser against them.
4. **Scope creep on Three.js.** Guardrail: 3D appears in exactly two places (Home hero; E3 enhancement); parity never
   depends on WebGL.
5. **Two UIs in compose during the strangler window** (RAM/ports on dev machines). Mitigation: compose profiles
   (`--profile legacy` / `--profile next`), documented in the submodule README.
6. **Backend/packaging bugs bite SPA developers** (dossier Findings 1–3: submodule `.git` repo-root walker, whisper
   build on fresh venv, `fastmcp` manifest drift). Not UI scope — file three backend issues in
   `F1_Telemetry_Manager` before W2 and document the Docker-first dev path meanwhile.
7. **Playwright e2e against the new comboboxes** — avoid re-creating dossier Finding 5: pick primitives with
   type-ahead and test via keyboard filtering, not scroll.

**Open questions (for the orchestrator / Víctor before Fase C)**
1. **Onboarding scope confirmation (F1-6):** no first-run gate exists in the current code; this plan treats the
   welcome/guided-setup/tour as *new required* work (W9) per the brief. Confirm that reading.
2. **Chat/report persistence delta (A5-1):** persisting chats/reports across refreshes improves on today's
   session-only behavior. Accept as default, or gate behind a setting?
3. **`components/comparison/legacy/*` (~1,090 LOC):** appears superseded by the synchronized animation. Confirm dead
   → not ported (else it's +1 M workstream).
4. **Port strategy at cutover:** keep the SPA on :8501 (this plan's default — zero doc churn, CORS already aligned)
   or move to :3000 permanently and update `FRONTEND_URL`?
5. **E6 (real backend progress events)** requires a backend change — explicitly out of the untouchable contract until
   approved. StatusStepper ships with today's scripted narration either way.
6. **Dark-only at parity (V3-1)** with light theme as E1 — confirm, since the brief says "support light too": the
   token architecture ships light-*ready* at parity; the designed light pass is E1.
7. **Where the new app lives in the submodule:** `webapp/` during strangler → renamed to `frontend/` at W10 (with the
   Streamlit tree archived one release) — confirm naming, since the tracking issue #25 and thesis docs reference paths.
