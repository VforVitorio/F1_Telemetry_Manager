# Model Lab — Design-First Spec (issue #38)

> Design-first blueprint (Fable, 2026-07-14). Take the Streamlit Model Lab's functionality and build the elevated migrated interface, NOT a port. Inherits the Dashboard grammar (URL=selectors, Zustand=UI, TanStack Query=data, ECharts+F1_THEME, design-system primitives) and the shared vocabulary from `strategy.md` (`ActionBadge`, `CompoundPill`, `ConfidenceDial`, state tiers, raw↔component URL boundary). Sources: `frontend/pages/model_lab.py` (930 LOC), `backend/api/v1/endpoints/strategy.py`, agent output dataclasses in `src/agents/*.py`, MIGRATION_PLAN §6.4/E10/W6, `st_4_Model_Lab.png`.

## 1. Purpose & the job

Model Lab is the **model inspector**: put any ONE of the six predictors on the bench, feed it a real race moment, and see exactly what it says and why. Strategy shows the orchestrated *decision*; the Lab shows each *instrument* in isolation — the transparency surface for the TFG's model family (XGBoost pace, TCN+MC-Dropout tyres, LightGBM overtake/SC, HistGBT pit + LightGBM undercut, the N24 NLP radio pipeline). Its job: *"For this GP/driver/lap, what does model X predict, with what uncertainty, against what threshold — and what did the LLM layer say about it?"*

Streamlit treats it as six repetitive form-tabs. The migrated version is a **workbench**: a model rail with identity cards (model type + thesis eval headline + run status), one shared bench frame (context → run → metrics → viz → reasoning), and a per-model run history. The audience is the developer/defender demoing models individually, and the curious analyst poking at a race moment.

**THREE KEY DISCOVERIES in the Streamlit source** that drive this design:
1. **Dead UI:** the Overtake tab's "Contextual factors" panel + factor bar chart (`model_lab.py:468-505`) read `data.contextual_factors` — a field **no agent ever returns** (zero matches in `src/agents/` and `backend/`). The panel has rendered its empty-fallback forever. Meanwhile the REAL context the agent returns (`gap_ahead_s`, `pace_delta_s`, `sc_currently_active`) is discarded.
2. **Fabricated data:** the Safety-car tab's 3/5/7-lap horizon bars (`model_lab.py:541-543`) invent the 5- and 7-lap values client-side as `sc3×1.2` and `sc3×1.4`. The model has ONE trained target (`sc_within_3_laps`). Two of the three bars are made up.
3. **Dropped fields:** `RadioOutput.corrections` (LLM-flagged NLP mismatches) and `rcm_events` are never rendered; both Overtake and SC tabs call the SAME `/situation` endpoint separately, so the one model runs twice and the two tabs can silently disagree.

Fixing these is the core of the elevation — same honesty move as Strategy's 14-vs-6-field discovery.

## 2. Functionality inventory (Streamlit → verdict)

| # | Streamlit feature (file:line) | Verdict | Why / target |
|---|---|---|---|
| 1 | "Only 2025 season data" `st.warning` (`model_lab.py:48`) | KEEP (demoted) | Info chip in the context bar, same as Strategy §2.1. |
| 2 | GP → Driver cascading selectors (`:50-74`) | KEEP | `Combobox`es, URL-bound, driver name in team colour. |
| 3 | Lap-range slider + single-lap slider BOTH always visible (`:88-100`) | IMPROVE | Only the control the active model uses renders: Pace → `DualRangeSlider`; Tyres/Overtake/SC/Pit → single `Slider`; Radio → corpus pickers. Kills the "which slider matters?" confusion. |
| 4 | `_fetch_lap_state` + session-state cache (`:105-132`) | KEEP (free) | TanStack Query keyed `['lab','lap-state',gp,driver,lap]`, staleTime Infinity. |
| 5 | Lap-state 404 → "driver may have retired" warning (`:118-129`) | KEEP + IMPROVE | Inline in context bar + one-click "jump to last valid lap" (max from `/lap-range`). |
| 6 | 6 tabs, each Run → metrics → chart → reasoning (`:896-929`) | KEEP (reshaped) | Model rail (vertical tablist) + ONE shared `RunFrame`; same run→metrics→viz→reasoning grammar for all six. §3. |
| 7 | Pace: batch lap-range run, 45–60 s spinner (`:209-267`) | KEEP + IMPROVE | Elapsed timer + honest "~N laps · typically 45–60 s" framing + chart skeleton + Cancel (AbortController). No fake staged copy — it's one POST. P4-9. |
| 8 | Pace chart: actual-vs-pred + CI band + compound dots + stint vlines + MAE badge (`:139-206`) | KEEP | ECharts: line + `ci_p10/p90` band, compound-coloured scatter via `tireColors`, stint `markLine`s, MAE chip in card header. Null `pred` rows (stint-first laps) render as gaps, never zeros. |
| 9 | Pace summary metrics: last pred / CI / range MAE (`:240-263`) | KEEP | 3 `StatCard`s. |
| 10 | Tyres: warning badge + 4 metrics (deg rate, cliff P10/50/90) (`:367-388`) | KEEP | `Pill` (PIT_SOON danger / MONITOR warning / OK success) + `StatCard`s, deg rate in mono. |
| 11 | Tyres: overlay cliff bar chart (`:274-311`) | IMPROVE | Replace the confusing 3-overlaid-bars with a **`StintRunway`** — the lap-axis strip from Strategy's `StintTimeline`, reused: "now" marker → P10→P50→P90 cliff gradient zone. Same data, legible form. |
| 12 | Tyres: degradation projection line + P50 cliff vline (`:314-347`) | KEEP | ECharts line + `markLine` at P50 cliff; area fill under curve. |
| 13 | 60-lap cliff cap + "capped" caption (`:370-394`) | KEEP | Domain guard, honest caption. Cap in the view layer, raw values in the run record. |
| 14 | Overtake: threat badge + probability gauge (`:441-466`) | KEEP + IMPROVE | Existing `Gauge` primitive + **threshold tick at 0.80** (the model's real `high_overtake` decision threshold from CFG) with caption. Threat `Pill`. |
| 15 | Overtake: contextual-factors panel + factor bars (`:468-505`) | **DROP (dead)** → REPLACE | Field never exists (Discovery 1). Replace with a **SituationFacts strip** of what `/situation` actually returns: gap-ahead chip (DRS badge when <1.0 s), pace-delta trend arrow (±s/lap vs car ahead), `sc_currently_active` flag. Real data, zero backend work. |
| 16 | SC: gauge (sc_prob_3lap) (`:534-538`) | KEEP + IMPROVE | `Gauge` + threshold tick at 0.30 (`high_sc`). |
| 17 | SC: 3/5/7-lap horizon bars (`:539-558`) | **DROP (fabricated)** → REPLACE | Discovery 2: 5/7-lap values are invented multipliers. Replace with an honest **baseline-lift bar**: this lap's P(SC≤3 laps) vs the season base rate (the model's real framing — lift 1.67× headline from N14). **§6.4 parity row needs amending** — flagged, with rationale, rather than silently ported. |
| 18 | SC: contextual factors panel (`:562-569`) | DROP (dead) | Same nonexistent field. SituationFacts strip covers it. |
| 19 | Overtake & SC each POST `/situation` separately (`:445,520`) | IMPROVE | ONE shared situation run feeds both models' views (Discovery 3). Running either fills both; a "shared run — Situation agent scores both" caption keeps it honest. Halves calls, kills divergence. |
| 20 | Pit: compound badge + stop P05/50/95 metrics (`:597-611`) | KEEP + IMPROVE | `CompoundPill` (strategy spec) + `ActionBadge` for `action` — **vocab must add `REACTIVE_SC`** (PitStrategyOutput emits it; strategy's 5-value enum doesn't include it): siren icon, danger, subtle pulse. |
| 21 | Pit: 3-bar stop-duration chart (`:615-635`) | IMPROVE | P05—P50—P95 is one distribution, not 3 categories: render a horizontal **interval strip** (dumbbell: band P05→P95, dot at P50, mono labels). Honest, half the height. |
| 22 | Pit: undercut gauge + window details (`:639-661`) | KEEP | `Gauge` (threshold 0.522 — N16's operating point) + detail list: `ActionBadge`, target driver in team colour, recommended lap. All fields nullable → conditional render. |
| 23 | Radio: dual mode toggle (`:765-779`) | KEEP | Segmented `Tabs`: "Race radio" / "Free text". Both modes are §6.4 parity. |
| 24 | Radio lookup: own GP/driver/lap pickers + transcript preview (`:782-830`) | KEEP + IMPROVE | Corpus has its own GP list (`/radio-available-gps`) — inherit the page GP/driver when present in the corpus, else prompt. Lap picker shows "(N with radio)"; transcript preview as a mono quote card. |
| 25 | Radio free text: textarea + analyse (`:854-879`) | KEEP + IMPROVE | Add 3 example chips ("Box box box, Plan B", "Tyres are gone", "Yellow flag sector 2") that fill the textarea — demo-friendly. Text never goes in the URL. |
| 26 | Radio results: alerts + NLP message cards (sentiment/intent/entities) + reasoning (`:672-762`) | KEEP + IMPROVE | `NlpMessageCard` component (sentiment-tinted edge, sentiment `Pill`, intent chip, typed entity chips) — **build once, share with Race Analysis Tab 3** (§6.3 renders the identical shape). |
| 27 | `RadioOutput.corrections` + `rcm_events` | **NEW (dropped today)** | Discovery 3: render corrections as an "LLM cross-check" panel (original intent → suggested intent + reason) and RCM events as flag-coloured rows. Free data. |
| 28 | Results persist silently across selector changes (`ml_*_result` keys) | IMPROVE | Stale-run honesty (same contract as Strategy): result stays visible but gets an amber "context changed — result is for Lap 18 / Monaco" banner + Re-run. |
| 29 | `_warning_badge` / `_metric_html` raw-HTML injection | DROP | `Pill` / `StatCard` primitives carry it. |
| 30 | Purple-border chart CSS injection (`:891`) | DROP | `ChartCard` + tokens. |

Zero functional loss except two deliberate, documented drops (#15, #17) whose replacements show MORE real information than the originals.

## 3. Layout & IA

Route `/lab` (stub exists, `router.tsx:55-58`).

**IA verdict: not 6 flat content-tabs — a model rail + one shared bench.** The six models keep tab semantics (vertical `role=tablist`), but each rail entry is a **model identity card**: icon, name, model-type chip (XGBoost / TCN+MC / LightGBM / HistGBT+LGBM / NLP×3), thesis eval headline (MAE 0.411 s · AUC-PR 0.549 · …), and a run-status dot (idle ○ / running ◐ pulse / done ● / stale ◍ amber). The rail answers at a glance "which models have I run against this moment?" — impossible in flat tabs. Below 1024 px the rail collapses to the horizontal segmented `Tabs` with the same status dots.

```
┌ Header: "Model Lab"                                  [→ Send to Strategy] ┐
│ ╔═ CONTEXT BAR (sticky, acrylic) ═════════════════════════════════════╗   │
│ ║ (2025 ·chip) [Grand Prix ▾]  [Driver ▾ NOR]   ⟨per-model lap ctrl⟩  ║   │
│ ║   Pace:   Lap window ●━━━━━━━● 8–28                                 ║   │
│ ║   others: Lap ●━━━○━━━ 18   · lap-state chip: ⟨MEDIUM · age 12 · P4⟩║   │
│ ║   Radio:  [GP w/ radio ▾][Driver ▾][Lap (7 with radio) ▾] | mode ⇄  ║   │
│ ╚═════════════════════════════════════════════════════════════════════╝   │
│ ┌ MODEL RAIL ─────────┐ ┌ BENCH — RunFrame (shared scaffold) ──────────┐  │
│ │ ● Pace              │ │ ┌ run header ────────────────────────────┐  │  │
│ │   XGBoost·MAE .411s │ │ │ Tyre degradation · TCN + MC-Dropout    │  │  │
│ │ ◐ Tyres      ←activo│ │ │ ⟨run for Lap 18 · 14:32⟩  [▶ Run] [✕]  │  │  │
│ │   TCN·MC N=50       │ │ └────────────────────────────────────────┘  │  │
│ │ ● Overtake ┐ shared │ │ [PIT_SOON pill]  [.041 s/lap][P10 6][P50 9] │  │
│ │ ● Safety c ┘ run    │ │ ┌ STINT RUNWAY ──────────────────────────┐  │  │
│ │ ○ Pit               │ │ │ now▼        ▒P10═P50═P90▒ cliff zone   │  │  │
│ │ ○ Radio             │ │ └────────────────────────────────────────┘  │  │
│ │                     │ │ ┌ DEG PROJECTION (ECharts line+cliff) ───┐  │  │
│ │ run history ▾       │ │ └────────────────────────────────────────┘  │  │
│ │  · L18 14:32 ●      │ │ ▸ 🧠 Agent reasoning (Markdown disclosure)  │  │
│ │  · L18 14:29 ●      │ └──────────────────────────────────────────────┘  │
│ └─────────────────────┘                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

**The shared frame contract** — every model renders the same four zones in order: (1) run header (title, model chip, run-context timestamp chip, Run/Re-run/Cancel), (2) verdict row (`Pill`s/`ActionBadge` + `StatCard`s), (3) viz zone (1–2 charts/gauges), (4) reasoning disclosure (`Markdown`, never truncated). Per model:

| Model | Verdict row | Viz zone |
|---|---|---|
| Pace | last pred · CI P10–P90 · range MAE | actual-vs-pred chart (CI band, compound dots, stint lines) |
| Tyres | warning `Pill` · deg rate · cliff P10/50/90 | `StintRunway` + deg projection line |
| Overtake | threat `Pill` · SituationFacts strip (gap/DRS · Δpace · SC-active) | `Gauge` w/ 0.80 threshold tick |
| Safety car | threat `Pill` · SituationFacts strip | `Gauge` w/ 0.30 tick + baseline-lift bar |
| Pit | `ActionBadge` · `CompoundPill` · rec lap | stop-duration interval strip + undercut `Gauge` (0.522 tick) + window details |
| Radio | alert banners (severity-sorted) | `NlpMessageCard` list + corrections panel + RCM rows |

**States (per model, independent):**
- **Idle** — identity card hero: one-line "what this model does", eval headline, ghosted preview sketch, `[▶ Run]` (disabled-with-reason until context complete; Radio-lookup additionally until a lap with radio is picked).
- **Running** — Run→Cancel, elapsed mono timer. Pace: chart-shaped `Skeleton` + "Scoring ~21 laps · typically 45–60 s" (no fake stages — it's one POST; StatusStepper would be theatre here). Others resolve in ≤ a few s: button spinner + result skeleton.
- **Done** — zones reveal staged (verdict → viz → reasoning, ≤400 ms total, motion-safe); run-context chip pinned ("Lap 18 · ran 14:32").
- **Stale** — context no longer matches the run: amber banner "Result is for Lap 18 — you're now on Lap 22" + Re-run. Result never silently lies (fixes #28).
- **Error** — 422/404 inline error card w/ agent name + Retry (config preserved); lap-state DNF 404 pinned to context bar with "jump to last valid lap"; 429 → `Toast` with limit info (pace-range is 5 runs/10 min — surface the budget).

**Cancel** is a client abort (AbortController); the pace-range run continues server-side — the button says "Stop waiting" semantics and the toast notes the rate-budget still burns. Honest, zero backend change.

## 4. Components

**Reuse as-is:** `Combobox`, `Slider` + `DualRangeSlider` (from #35), `Tabs` (mobile rail + radio mode toggle), `Card`, `ChartCard`, `StatCard`, `Pill`, `Skeleton`, `EmptyState`, `Toast`, `Tooltip`, `Button`, `Markdown`, **`Gauge`** (`charts/Gauge.tsx` — built for exactly these three probabilities), ECharts + `F1_THEME` + `tireColors`, `lib/drivers.ts` (team colours; already promoted by #35).

**Shared-primitive extensions (coordinate with #35):**
- `Gauge` + optional `threshold?: number` prop — a hairline tick + caption at the model's real decision threshold (0.80 overtake · 0.30 SC · 0.522 undercut). One prop, big honesty win; keeps the clean progress-arc design (no traffic-light bands).
- `ActionBadge` vocab + `REACTIVE_SC` (siren, danger, subtle pulse) — the Pit agent emits it; strategy's enum missed it.
- `CompoundPill` — used verbatim (pit rec, pace-chart legend, lap-state chip).
- `StintTimeline` (strategy spec) → parametrize into **`StintRunway`** shared under `src/components/` or `features/agents/`: Lab uses the bare form (now + cliff zone), Strategy the annotated form (+ pit target ▲, stint end).

**New shared (build here, consumed elsewhere):**
- `NlpMessageCard` — sentiment-edge card: sentiment `Pill`, intent chip, typed entity chips (driver/team/track entities get icons), mono transcript. **Race Analysis Tab 3 (§6.3) renders the identical shape — build once in `src/components/`, not feature-local.**

**Feature-local (`webapp/src/features/lab/`):**
- `LabPage.tsx` — owns URL, cascade resets, threads context.
- `ModelRail.tsx` — vertical tablist of `ModelRailItem`s (identity + status dot); collapses to `Tabs` <1024 px.
- `LabContextBar.tsx` — GP/Driver combos + per-model lap control + lap-state preview chip.
- `RunFrame.tsx` — the shared scaffold; consumes a `ModelDef` (`{id, icon, title, modelChip, evalHeadline, contextNeeds, run, ResultView}`) — adding a 7th model = one registry entry.
- `models/` — `PaceResultView`, `TyreResultView`, `SituationResultView` (two lenses: overtake/SC over ONE run), `PitResultView`, `RadioResultView` (+ `RadioLookupControls`, `FreeTextControls`, `CorrectionsPanel`), each with pure ECharts option-builder fns (`buildPaceChartOption` etc.) exported for reuse by Strategy's agent micro-tabs.
- `RunHistoryStrip.tsx` — per-model past runs (context chip + verdict glyph); click restores.
- `store.ts` — Zustand run records; `search.ts` — URL contract.

## 5. Interactions & flows

1. **Pick a model** — rail click; URL `model=` updates; bench swaps `ResultView` (fade ≤180 ms); context bar swaps the lap control. Status dots persist across switches.
2. **Set the moment** — GP → Driver (cascade clears downstream); lap slider live-updates the lap-state chip (query prefetch on release, so single-lap models show compound/age/position before any run). Pace never fetches lap-state (server builds per-lap states itself).
3. **Run** — mutation fires; button → Cancel + elapsed. Overtake/SC: one `/situation` mutation, `onSuccess` writes a run record tagged for BOTH models (rail shows both dots filled).
4. **Read** — verdict first, viz second, reasoning one disclosure away. Threshold ticks put every probability in context ("87% vs the 80% action threshold").
5. **Iterate** — nudge the lap → stale banner → Re-run; each run appends to history; two same-model runs at the same context expose MC-Dropout / LLM variance (tyre P50 wobble is a *feature* to show, not hide).
6. **Radio dual-mode** — mode toggle in the bench (not the context bar). Lookup: corpus GP ▾ (auto-inherits page GP when the corpus has it, marked "inherited") → driver ▾ → lap ▾ ("7 with radio") → transcript quote card → Analyse. Free text: textarea + example chips → Analyse. Both funnel into the same `RadioResultView`.
7. **Send to Strategy** — header action deep-links `/strategy?gp=…&driver=…&laps=…` prefilled ("what does the full council say about this moment?"). Never auto-runs (strategy rule).

## 6. Data & migration notes

All under `/api/v1/strategy` (`backend/api/v1/endpoints/strategy.py`):

| Endpoint | Line | Rate limit | Notes |
|---|---|---|---|
| `GET /available-gps?year` · `/available-drivers?gp&year` · `/lap-range?gp&driver&year` | 235/244/254 | — | Shared with Strategy; same query keys → cache shared across pages. |
| `GET /lap-state?gp&driver&lap&year` | 269 | — | 404 = DNF/no telemetry → context-bar error + jump-to-valid. |
| `POST /pace-range {year,gp,driver,lap_start,lap_end}` | 419 | **5 / 10 min** | → `{predictions[{lap,actual,pred,ci_p10,ci_p90,compound,stint}], count}`. `pred:null` on stint-first laps (no `Prev_LapTime`) → chart gaps. 45–60 s. |
| `POST /tire {lap_state}` | 538 | 20 / min | → `TireOutput`: `compound, current_tyre_life, deg_rate, laps_to_cliff_p10/p50/p90, warning_level(PIT_SOON\|MONITOR\|OK), reasoning`. |
| `POST /situation {lap_state}` | 564 | 20 / min | → `RaceSituationOutput`: `overtake_prob` (**nullable** — null when the car ahead is beyond the 2.5 s gap the model was trained on; render an absence, never 0%), `sc_prob_3lap, threat_level(LOW\|MEDIUM\|HIGH), gap_ahead_s, pace_delta_s, sc_currently_active, reasoning`. **Feeds both Overtake and SC views.** NO `contextual_factors`, NO 5/7-lap fields — do not type them. |
| `POST /pit {lap_state}` | 590 | 20 / min | → `PitStrategyOutput`: `action(…+REACTIVE_SC), recommended_lap?, compound_recommendation, stop_duration_p05/p50/p95, undercut_prob?, undercut_target?, sc_reactive, reasoning`. Nullable undercut pair → conditional render. |
| `POST /radio {lap_state, radio_msgs[], rcm_events[]}` | 616 | 20 / min | → `RadioOutput`: `radio_events[] (NLP dicts — type tolerantly: sentiment/intent/entities nested under `.analysis` or top-level), rcm_events[], alerts[], reasoning, corrections[{driver,original_intent,suggested_intent,span,reason}]`. Do NOT send a `source` key in radio_msgs (crashes `RadioMessage` — Streamlit comment `:837`). |
| `GET /radio-available-gps?year` · `/radio-laps?gp&year[&driver]` · `/radio-transcript?gp&driver&lap&year` | 745/763/824 | — | Corpus lookups; `radio-laps` returns per-driver `laps[{lap,text,has_transcript,audio_path}]`. |

Types in `lib/api/strategy.ts` (extend #35's file — same schemas, one source of truth).

**URL** (`features/lab/search.ts`, raw↔component boundary as Dashboard): `/lab?model=tyres&gp=Hungarian Grand Prix&driver=NOR&lap=18&laps=8-28&rmode=lookup&rgp=…&rdrv=VER&rlap=12`. `model` 6-enum default `pace`; `lap` clamped to `/lap-range` after fetch; `laps` encoded `a-b`; radio params only serialized when ≠ inherited context; free text NEVER in URL. Cascade: gp→clears driver/lap/laps/radio-overrides; driver→clears lap/laps. **Deep links reproduce config, never auto-run** (compute + rate budget).

**State split:** TanStack Query staleTime Infinity for gps/drivers/lap-range/lap-state/radio-corpus lookups. Model runs = **`useMutation`** (MC-Dropout + LLM reasoning are non-deterministic — a cache "hit" would misrepresent a fresh run), `onSuccess` appends to Zustand `features/lab/store.ts`: `runs: LabRun[]{id, model, context{gp,driver,lap|lapRange|radioInput}, result, ranAt}` (cap ~30, sessionStorage), `activeRunByModel: Record<ModelId, runId>`. Situation runs register under both `overtake` and `safetycar`. Stale = `run.context ≠ current context` (pure compare, rendered by `RunFrame`).

**Parity amendment to flag in the PR:** §6.4 row "Safety car: gauge + 3/5/7-lap horizon bars" — the 5/7-lap bars are client-fabricated (`model_lab.py:542-543`); this spec replaces them with the real 3-lap probability + baseline-lift framing. Update the row to "gauge + baseline-lift comparison" with a pointer here.

## 7. New features (ranked) & the Strategy overlap

1. **Model identity cards w/ thesis eval headlines** ⚡ (S) — type chip + headline metric (pace MAE 0.4104 s · tyre coverage 0.7078 · overtake AUC-PR 0.5491 · SC 0.0723 (lift 1.67×) · pit P50 MAE 0.4893 s · undercut 0.6739) as static registry constants sourced from the IEEE report. Makes the Lab a model museum — the defense flex.
2. **Run history + variance view** ⚡ (M, = plan E10) — history strip per model; select two runs of the same model+context → overlay (two runway zones / two dials) exposing MC-Dropout spread. Store already holds the records.
3. **Surface the dropped Radio fields** ⚡ (S) — corrections cross-check panel + RCM event rows. Free data, real insight.
4. **SituationFacts strip** ⚡ (S) — gap/DRS + Δpace + SC-active replacing the dead factors panel. Free.
5. **Send to Strategy / from Strategy** (S) — cross-links both ways ("inspect this instrument" ↔ "convene the council"). URL-only.
6. **Lap sweep for single-lap models** (M) — run Tyres (or Situation) across N laps sequentially (respects 20/min) → cliff-vs-lap curve; the pace-range treatment generalized. Client-side loop, progress per lap, cancelable.
7. **Progressive pace streaming** (M, backend-additive) — SSE/NDJSON variant of `/pace-range` emitting per-lap rows → chart paints as it computes, killing the 45–60 s black box. Not parity; note the seam (`RunFrame` running-state accepts partial results).
8. **Radio audio playback** (S, backend-additive) — corpus rows carry `audio_path`; a static-file route would enable a play button on `NlpMessageCard`.

**Share vs keep distinct (Strategy's agent tabs = same 4 predictors):**
- **SHARE:** result types (`lib/api/strategy.ts`), pure chart option-builders (`buildPaceChartOption`, `buildCliffRunway`, …), `Gauge`+threshold, `ActionBadge`/`CompoundPill`/`Pill` vocab, `StintRunway`, `NlpMessageCard` (also Race Analysis). Strategy's micro-tabs render the SAME builders at `size="micro"`; the Lab renders `size="full"`. One visual language for one model family — a tyre cliff looks identical everywhere.
- **KEEP DISTINCT:** the page frames. Lab = run controls + history + education (you fire the model). Strategy tabs = read-only evidence of an orchestrator run (the council fired it). Merging them would blur *who ran what when* — precisely the provenance the stale-run contract protects.

## 8. Better than Streamlit

One relevant lap control instead of two always-on sliders · zero dead UI (empty factors panel gone) and **zero fabricated data** (invented 5/7-lap bars replaced by real baseline-lift) · one `/situation` run feeds two views instead of two divergent runs · stale results labelled instead of silently lying · thresholds ON the dials (a probability finally means something) · corrections + RCM events surfaced (dropped on the floor today) · 45–60 s run is cancelable, framed, and skeleton'd instead of a blind spinner · deep-linkable model+moment · run history makes MC variance a demo feature · model identity cards turn six forms into an instrument collection · one design system (no injected HTML badges/CSS).

## Acceptance criteria (#38, condensed)

§6.4 rows pass (with the documented SC-horizon amendment) · all six models runnable from one context in ≤3 interactions after page load · Overtake+SC provably share one request (network assert in test) · pace-range cancel leaves UI consistent + budget toast · stale banner appears on any context change post-run · `pred:null` laps gap the pace chart (fixture test) · REACTIVE_SC renders a designed badge (not the unknown fallback) · radio free-text round-trips without URL leakage · keyboard: rail is arrow-navigable tablist, Run reachable, disclosures toggle on Enter · reduced-motion: no pulse dots, no staged reveal.

**Key files:** `frontend/pages/model_lab.py` (the source, 930 LOC) · `backend/api/v1/endpoints/strategy.py:398-870` (all endpoints) · output schemas `src/agents/{pace_agent.py:66, tire_agent.py:339, race_situation_agent.py:170, pit_strategy_agent.py:151, radio_agent.py:190}` · grammar `webapp/src/features/dashboard/{search.ts,store.ts,queries.ts,DashboardPage.tsx}` · `webapp/src/charts/Gauge.tsx` (exists — extend, don't rebuild) · sibling specs `docs/migration/design-specs/{strategy.md,comparison.md}` (shared vocab) · route stub `webapp/src/app/router.tsx:55-58`.
