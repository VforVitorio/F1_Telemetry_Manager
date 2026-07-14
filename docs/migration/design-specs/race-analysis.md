# Race Analysis — Design-First Spec (issues #36/#37)

> Design-first blueprint (Fable, 2026-07-14). Take the Streamlit Race Analysis tab's functionality and build the elevated migrated interface, NOT a port. Inherits the Dashboard grammar (URL=selectors, Zustand=UI, TanStack Query=data, ECharts+F1_THEME, design-system primitives) and the shared decisions in `strategy.md` / `comparison.md` (CompoundPill, raw↔component URL boundary, state-tier contract, never-auto-fire-LLM rule).

## 1. Purpose & the job

Race Analysis is the **post-race debrief room**: the only surface that looks at a WHOLE race, whole field, through the engineered features the ML models trained on (fuel-adjusted degradation, deg rate, gap consistency — the featured parquet itself). Job: *"Load any 2025 race, pick up to 3 drivers, and reconstruct the strategic story: how the tyres died, where the pit windows opened, what the radio said, and what the rulebook allowed."* Dashboard = one lap's telemetry; Strategy = one lap's decision; Comparison = one lap head-to-head; **Race Analysis = the 60-lap narrative.**

**THREE KEY DISCOVERIES (all fixable client-side, zero backend work):**
1. **The radio lookup analyzes nothing.** `race_analysis.py` posts `/strategy/radio` with `lap_state` only and an EMPTY `radio_msgs` list — the agent needs the transcript IN `radio_msgs` (docstring `radio_agent.py:1106`; Model Lab does it right at `model_lab.py:838`). Today's tab runs the whole NLP stack on zero messages.
2. **RAG citations never render.** Streamlit reads `data["sources"]` — the backend returns `{question, answer, chunks[{text,article,doc_type,year,score}], articles[]}` (`rag_agent.py:91`, `RegulationContext`). The `sources` key doesn't exist, so the citations expander is permanently empty while real article references sit unused in every response.
3. **The NLP payload is half-discarded.** `run_pipeline` (`radio_agent.py:552`) returns `sentiment_score`, `intent_confidence`, entity `label`s and LLM `corrections[]` (the model auditing the NLP classifiers) — Streamlit drops all four. Also its intent icon map (`box_call`, `tyre_info`…) never matches the real vocab (`INFORMATION·PROBLEM·ORDER·WARNING·QUESTION`), so intent icons have never displayed.

## 2. Functionality inventory (Streamlit → verdict)

| # | Streamlit feature (file) | Verdict | Why / target |
|---|---|---|---|
| 1 | "Only 2025 season data" warning (`race_analysis.py:60`) | KEEP (demoted) | `2025 season` chip in the context bar, per strategy.md #1. |
| 2 | GP selectbox + explicit "Load race data" button (`:70-95`) | KEEP + IMPROVE | GP `Combobox` URL-bound; **auto-fetch on selection** (TanStack Query kills the rerun-refetch reason the button existed for; picking from a combobox is already deliberate intent). The §6.3 "loader panel" = the context bar's loading state, cancellable. |
| 3 | Manual CSV/parquet upload in expander (`:141`) | KEEP + IMPROVE | `FileDrop` (.csv/.parquet) inside a "Local data" disclosure of the context bar; becomes the offline/no-backend demo path. Sets a `Local dataset` pill; cleared by picking a GP. |
| 4 | Driver multiselect max 3 filtering "all tabs" (`:99`) | KEEP + FIX the lie | Multi-`Combobox` cap 3 (Dashboard `MAX_DRIVERS` grammar), team-colour names, URL-bound. Truth today: it filters ONLY Tyres+Gaps (Radio has its own selector; Overview shows the unfiltered head(50)). Define the contract: filters Tyres+Gaps; Dataset gets an All/Selected toggle; Radio browser seeds from first selected driver. Filtering is **client-side over the cached frame — zero network**. |
| 5 | "Viewing: GP · drivers · laps" caption (`:120-131`) | KEEP + IMPROVE | Proper context strip: GP · `2025` · N drivers · N laps + compounds seen (`CompoundPill` row) — absorbs half of Overview's metrics. |
| 6 | Tab 1 Tyre deg: compound selectbox + 5 charts (`tire_charts.py`, `race_viz.py`) | KEEP all 5 | Chart switcher (segmented `Tabs`) + "Show all" stacked toggle per §6.3. Compound selector → `CompoundPill` toggle group (only compounds present). Driver-colour lines + compound dash encoding preserved verbatim. |
| 7 | Tab 2 Gaps: 3 charts + 3-metric summary (`gap_charts.py`) | KEEP + IMPROVE | ECharts (zones → `markArea`, thresholds → labelled `markLine`); summary → 3 `StatCard`s **split per driver** (today the counts blur all selected drivers together) and clickable → highlights qualifying laps on the gap chart. |
| 8 | Radio activation gate button (`:171-183`) | DROP (cause gone) | Existed to avoid corpus refetch on every Streamlit rerun/tab switch. TanStack Query fetches once on first tab open (`enabled`), cached forever. |
| 9 | Radio driver/lap dropdowns (blind lap numbers) (`:196-224`) | IMPROVE hard | The `/radio-laps` response ALREADY ships transcript preview text per lap — Streamlit discards it and makes you pick a lap number blind. Build a **radio browser**: driver rail (team colours + message counts) → message list with transcript previews → select → Analyse. |
| 10 | "Analyse radio" → `render_radio_panel(lap_state)` (`:230`) | KEEP + **FIX BUG** | Must post `radio_msgs=[{driver, lap, text}]` with the corpus transcript (discovery #1). Never pass `source` (crashes `RadioMessage`, per `model_lab.py:837`). |
| 11 | Radio result: alerts + message cards + sentiment badge + intent + entity chips (`radio_panel.py`) | KEEP + IMPROVE | Premium NLP result card (§3): sentiment `Pill` + score, intent pill w/ correct-vocab lucide icon + confidence, **entities highlighted inline in the transcript**, alerts row, corrections footnote, reasoning disclosure. |
| 12 | Radio "free text" expander with driver+lap inputs, NO text field (`:263-280`) | REPLACE | It's mislabelled and posts empty `radio_msgs` → analyzes nothing. Replace with a real free-text composer (textarea → `radio_msgs=[{driver:'UNK', lap:1, text}]`, Model Lab pattern) — one shared component that §6.4's Model Lab radio tab reuses. |
| 13 | Radio JSON download (`:243`) | KEEP | Card header action, filename `radio_{gp}_{driver}_lap{lap}.json`. |
| 14 | Tab 4 RAG: textarea + query button + answer markdown (`:283-300`) | KEEP + IMPROVE | Query card with suggested-question chips; answer via `Markdown`. |
| 15 | RAG "Sources" expander (`:295`) | FIX (dead today) | Render `articles[]` as citation chips + `chunks[]` as expandable source passages with doc_type/year/similarity (discovery #2). |
| 16 | RAG JSON download (`:305`) | KEEP | Card action, serializes the full result verbatim. |
| 17 | Tab 5 Overview: 3 metrics + columns expander + `df.head(50)` + CSV export (`:315-345`) | KEEP + IMPROVE | Metrics absorbed into context strip; **full virtualized `DataTable`** (not head-50) with column-group presets (Timing / Tyres / Speeds / Gaps / Weather — 26 cols is too many at once); CSV export via DataTable's built-in `buildCsv`. |
| 18 | Per-tab downloads (§6.3 row) | KEEP + EXTEND | Radio/RAG JSON as today; Dataset CSV; Tyres/Gaps get "Download series (CSV)" as a `ChartCard` action (new, cheap). |
| 19 | Purple-border chart CSS injection (`:150`) | DROP | `ChartCard` + tokens carry the language (same verdict as strategy.md #21). |
| 20 | `add_race_lap_column` on upload (`race_processing.py:12`) | KEEP (port) | Pure TS port (LapNumber from Stint+TyreAge cumulative), unit-tested; runs only on uploaded files missing `LapNumber`. |
| 21 | Client `calculate_gap_consistency`/`calculate_strategic_windows` (`race_processing.py:44,99`) | KEEP (port, upload-only + windows) | `/race-data` already returns `consistent_gap_*`; port both as pure fns — consistency needed for uploads, strategic windows always derived client-side (trivial boolean masks). |

**IA verdict — 5 flat tabs is the wrong grouping, keep 5 areas but in two families.** Tyres/Gaps/Dataset are views of ONE loaded frame; Radio needs only the GP (corpus, not parquet); Regulations needs NOTHING. Streamlit gates all five behind "Load race data" — the redesign gates only the three data tabs, enables Radio as soon as a GP is picked, and **never gates Regulations** (asking a rules question shouldn't require downloading a race).

## 3. Layout & IA

Route `/race` (stub exists, `router.tsx:49-51`).

```
┌ Header: "Race Analysis"                                  [🔗 Copy link] ┐
│ ╔═ CONTEXT BAR (sticky, acrylic) ══════════════════════════════════════╗
│ ║ (2025 · chip) [Grand Prix ▾ Spanish GP]  [Drivers ▾ VER✕ NOR✕ (max 3)]║
│ ║ loaded strip:  1 182 rows · 20 drivers · 66 laps · 🛞 S M H          ║
│ ║ ▸ Local data (FileDrop .csv/.parquet)        [Local dataset ✕] pill  ║
│ ╚═══════════════════════════════════════════════════════════════════════╝
│ ── Tabs (underline, URL-bound) ─────────────────────────────────────────
│   TYRES   GAPS   DATASET   │   RADIO   REGULATIONS
│   └── need loaded data ──┘     └ GP only┘ └ always on ┘
│
│ [TYRES]  CompoundPills (S)(M)(H) · switcher: Speed│Fuel-adj│Reg-vs-adj│Rate│% · [Show all]
│   ┌ STINT GANTT (new): per driver, compound blocks across laps ────────┐
│   │ VER ▓S▓▓▓│▓▓M▓▓▓▓▓│▓H▓▓   NOR ▓M▓▓▓▓│▓H▓▓▓▓▓                      │
│   └ ChartCard: active chart (driver colour + compound dash) ───────────┘
│ [GAPS]   ┌ Gap evolution ┐ ┌ Undercut zones (markArea) ┐
│          └ Consistency bars ┘  StatCards/driver: Undercut 4 · Overcut 2 · Defend 3
│ [RADIO]  ┌ browser: drivers rail → msg list w/ transcript previews ┐
│          │ ▶ lap 23 "box box, we are…"  [Analyse]                  │
│          └ NLP RESULT CARD: alerts row · blockquote transcript with │
│            highlighted entities · sentiment+intent pills w/ conf %  │
│            · corrections footnote · ▸ reasoning · [⬇ JSON]          │
│          ▸ Free-text composer (shared w/ Model Lab)                 │
│ [REGULATIONS] query card + suggested chips → ANSWER CARD:           │
│            Markdown answer · citation chips ⚖ Art 48.3 ⚖ Art 55.1  │
│            · ▸ source passages (doc_type · year · score) · [⬇ JSON] │
│            · session Q&A history rail                               │
│ [DATASET] column presets: Timing│Tyres│Speeds│Gaps│Weather · All/Selected
│            virtualized DataTable (full frame) · [⬇ CSV]             │
└──────────────────────────────────────────────────────────────────────┘
```

**States:** Idle (no GP: EmptyState hero + GP quick-pick from `available-gps` + FileDrop; only Regulations tab live) · Loading (context strip skeleton + tab-area `Skeleton`, cancellable AbortController) · Loaded (tabs enable, staged ≤300ms; no drivers selected → Tyres/Gaps show EmptyState with **podium quick-pick chips** — one click seeds the filter from final-lap `Position`) · Error (`/race-data` 404/500 → inline error card + Retry + FileDrop promoted as the fallback — its real job) · Upload-active (`Local dataset` pill; GP combobox cleared; radio/RAG unaffected) · Radio no-corpus (EmptyState "No radio corpus for this GP" + free-text composer still available) · RAG rate-limited (429 → Toast + button cooldown, burst capacity 5).

## 4. Components

Reuse: `Tabs` (underline top-level, segmented for the tyre chart switcher), `Combobox` (GP, drivers cap 3), `FileDrop`, `Pill` (+`compound` prop for tyre chips; tones for sentiment/intent/alerts), `DataTable`+`buildCsv`, `ChartCard` (collapse + actions slot), `StatCard`, `EmptyState`/`Skeleton`/`Toast`/`Tooltip`/`Button`/`Card`, `Markdown` (RAG answers, radio reasoning), ECharts+`F1_THEME`, `tireColors`, dashboard `lib/compounds.ts` (CompoundID→name map lives here) and `lib/drivers.ts` (lifted to `src/lib/` per strategy.md). Shared primitives from strategy.md: `CompoundPill` (stint gantt + compound toggles), `ConfidenceDial` at `sm` (sentiment/intent confidence).

**No new SHARED primitives.** Feature-local (`features/race/components/`): `RaceContextBar` (selectors + loaded strip + FileDrop disclosure), `StintGantt` (SVG lap axis, compound blocks from Driver×Stint×Compound — doubles as the legend for compound dashes), `TyreChartSwitcher` (segmented + show-all; wraps the 5 ECharts builders), `GapCharts` (3 builders + `markArea` zones), `StrategicWindowCards`, `RadioBrowser` (driver rail + message list w/ previews), `RadioResultCard` (alerts + `TranscriptQuote` with entity `<mark>`s + pills + corrections + reasoning), `RadioFreeTextComposer` (**shared seam: Model Lab §6.4 imports this**), `RagQueryCard` + `RagAnswerCard` (+`CitationChip`, `SourcePassage` — Chat's future RAG rendering can lift them), `DatasetTable` (presets + toggle). Pure libs (`features/race/lib/`): `raceFrame.ts` (parse/normalize records, `addRaceLapColumn`, gap consistency + strategic windows ports — ALL unit-tested against Python behaviour), `tyreSeries.ts` / `gapSeries.ts` (frame → ECharts option builders, driver-colour + compound-dash encoding).

## 5. Interactions & flows

1. **Load** — pick GP → auto-fetch `/race-data` (staleTime Infinity) → strip fills, tabs enable. Upload path: FileDrop → parse client-side (CSV via Papa-style parser; parquet via `hyparquet`, lazy-loaded chunk) → normalize through `raceFrame.ts` → same downstream rendering, `Local dataset` pill.
2. **Filter** — driver chips add/remove instantly (client-side slice of the cached frame, zero refetch). Cascade: GP change clears drivers + radio selection (URL boundary, Dashboard pattern).
3. **Explore tyres** — compound pill filters chart 1; switcher flips between the 5 views; "Show all" stacks them (ChartCards, collapsible); stint gantt hover highlights that driver's series.
4. **Explore gaps** — hover unified tooltip (axisPointer); click a window StatCard → `markPoint`s flag its laps; **"Analyse this lap in Strategy" context action** on chart click → deep-link `/strategy?gp&driver&laps=a-b` (prefilled, never auto-runs — coherence with strategy.md §6).
5. **Radio** — open tab → corpus query fires once → browser renders; select message (URL `rdriver`/`rlap`) → Analyse → POST with the transcript in `radio_msgs` → result card staged reveal (alerts → transcript → pills → disclosure), `aria-live=polite`. Cached per (gp,driver,lap) — re-selecting a past message is instant. Free-text composer always one disclosure away.
6. **Regulations** — type or tap a suggested chip → POST `/rag` → answer card; each Q&A appends to a session history rail (click restores). Deep link `?q=` prefills, never auto-fires.
7. **Export** — per-tab: radio JSON, RAG JSON, dataset CSV, chart-series CSV.

## 6. Data & migration notes

Endpoints (all already in `lib/api/schema.ts` — typed client ready, zero backend work):
- `GET /api/v1/strategy/available-gps?year=2025` (`strategy.py:235`) — GP list matching the featured parquet.
- `GET /api/v1/telemetry/race-data?year&gp[&driver]` (`telemetry.py:226`) → `{race_data: Record[], count}`; 26 cols (`_RACE_DATA_COLS` + `TyreAge`): Driver, DriverNumber, LapNumber, Stint, SpeedI1/I2/FL/ST, Compound, TyreLife, FreshTyre, Team, Position, CompoundID, LapTime_s, FuelLoad, FuelAdjusted{LapTime,DegAbsolute,DegPercent}, DegradationRate, Air/TrackTemp, GP_Name, GapToCarAhead/Behind, consistent_gap_{ahead,behind}_laps. NaN→null already sanitized. Payload = whole field (~1-3 MB) → fetch once, filter client-side.
- `GET /api/v1/strategy/radio-available-gps?year` (`strategy.py:746`) — badge radio availability on the GP combobox.
- `GET /api/v1/strategy/radio-laps?gp&year[&driver]` (`:764`) → `{drivers:[{driver, driver_number, laps:[{lap, text, has_transcript, audio_path}]}]}` — **the browser's preview text is here**.
- `POST /api/v1/strategy/radio {lap_state, radio_msgs, rcm_events}` (`:616`, rate 20/min) → `result: {radio_events[{message, timestamp, analysis:{sentiment, sentiment_score, intent, intent_confidence, entities[{text,label}], rcm}}], rcm_events[], alerts[{source,intent,message,driver}], reasoning, corrections[{driver, original_intent, suggested_intent, span, reason}]}`. **Contract: transcript goes IN `radio_msgs`** (discovery #1). Intent vocab: INFORMATION·PROBLEM·ORDER·WARNING·QUESTION; sentiment: negative/neutral/positive (normalize case).
- `POST /api/v1/strategy/rag {question}` (`:656`, burst 5) → `result: {question, answer, chunks[{text, article, doc_type, year, score}], articles[]}` — cite from `articles`, never from answer prose (`rag_agent.py:84-88`: the LLM may hallucinate article numbers; chunk metadata is reliable).

URL (`features/race/search.ts`, raw↔component boundary cloned from Dashboard): `/race?gp=Spanish Grand Prix&drivers=VER,NOR&tab=tyres[&compound=SOFT][&rdriver=VER&rlap=23][&q=...]`. `drivers` CSV upper/dedup/cap-3 (reuse `capDriversCsv` shape); `tab` enum tyres|gaps|dataset|radio|regs default tyres; year constant 2025. GP change cascades: clears drivers, rdriver/rlap, compound. Deep links reproduce selection; **POSTs never auto-fire.**

State tiers: **URL** = gp/drivers/tab/compound/radio-selection/q-prefill · **TanStack Query** (staleTime Infinity) = race-data, radio-available-gps, radio-laps, and radio analyses as queries keyed `['strategy','agent','radio', gp, driver, lap]` enabled on Analyse (the agent-POST-as-query precedent from strategy.md §6 — caching per message for free, mirroring Streamlit's `radio_result_{gp}_{driver}_{lap}`) · **useMutation + Zustand history** = RAG Q&A (free-input generative → `features/race/store.ts`, `ragHistory` cap 10, not persisted) · **Zustand UI** = tyre show-all toggle, dataset column preset + All/Selected (ephemeral; only view-layout persists, Dashboard convention). Uploaded frames live in a non-persisted store slice (too big for storage), flagged `source:'upload'`.

Gotchas: `race_analysis.py` maps codes↔numbers both ways — keep DriverNumber as the join key internally, codes in URL/UI · uploads may lack LapNumber → run `addRaceLapColumn` port · uploads lack gap-consistency cols → run the port before gap charts · `MAX_LAPS=66` clamp in every race_viz builder — preserve · compound dash map (solid/dash/dot/dashdot/longdash by CompoundID) is the established encoding, keep it · radio `laps[].has_transcript=false` entries: show greyed with "no transcript" (analysable only via Whisper on backend — out of scope, disable Analyse).

## 7. New features (ranked)

1. **Stint gantt** ⚡ (S) — the classic tyre-strategy graphic from Driver×Stint×Compound already in the frame; anchors the whole Tyres tab and legends the dash encoding. 
2. **Entity-highlighted transcripts + confidence meters + corrections** ⚡ (S) — renders payload fields discarded today (`sentiment_score`, `intent_confidence`, entity labels, LLM `corrections[]` = "the model auditing the models", a thesis-demo gem).
3. **RAG citations + source passages** ⚡ (S) — `articles[]` chips + `chunks[]` disclosures; fixes the permanently-empty Sources expander.
4. **Radio browser with previews** (M) — transcript text already in `/radio-laps`; kills the blind lap dropdown.
5. **Per-driver strategic-window cards + chart highlight** (S) — clickable counts → markPoints.
6. **Cross-links with context** (S) — gap chart lap → `/strategy` prefilled; header "Ask AI about this race" → `/chat` (disabled-w/-tooltip until #39, comparison.md #15 pattern).
7. **Podium quick-pick** (XS) — empty-filter EmptyState seeds top-3 from final `Position`.
8. **Position/race-story chart** (M) — Position per lap is in the frame; a 6th "Race story" view (the `/race-data` docstring already envisions position evolution). Backlog, not parity.
9. **Radio audio playback** (M + backend) — `audio_path` exists in the corpus but no serving endpoint; additive B1 if wanted.

Recommended for the build issue: parity + ranks 1-5 (all client-side, mostly rendering data already in hand); 6-7 cheap follow-ups; 8-9 backlog.

## 8. Better than Streamlit

Radio analysis actually analyzes (the empty-`radio_msgs` bug is structurally impossible: the browser owns the transcript and the POST builder requires it) · RAG answers carry their citations (dead `sources` key → real `articles`/`chunks`) · the NLP result shows its confidence and its self-audit instead of discarding both · browse radio by transcript preview, not blind lap numbers · Regulations never gated behind a data load, Radio needs only the GP · driver filtering is instant and honest about scope (no fake "filters all tabs") · full virtualized table vs head(50) · every view deep-linkable (`tab`, `compound`, radio message in the URL) · no activation-gate ceremony, no injected CSS, one coherent chart language (ECharts F1_THEME, ChartCard, team colours everywhere).

## Acceptance criteria (condensed)

§6.3 parity rows all pass (5 tyre charts, 3 gap charts + summary, radio gate-flow superseded by lazy query + browser, RAG with citation, dataset + exports) · radio POST carries the corpus transcript in `radio_msgs` (regression test: never empty when a corpus message is selected) · RAG card renders `articles[]` when non-empty · `raceFrame.ts` ports (lap column, gap consistency, strategic windows) unit-tested against Python-derived fixtures · upload path: CSV + parquet round-trip renders all three data tabs · URL round-trip incl. `tab`/`rdriver`/`rlap` · Regulations usable with zero race data loaded · driver cap 3 enforced at the search boundary.

**Key files:** `frontend/pages/race_analysis.py` · `frontend/components/race_analysis/{tire_charts,gap_charts,radio_panel}.py` · `frontend/utils/{race_viz,race_processing}.py` · `backend/api/v1/endpoints/telemetry.py:139-284` (`/race-data`) · `backend/api/v1/endpoints/strategy.py:616-871` (`/radio`, `/rag`, radio corpus GETs) · `src/agents/radio_agent.py:552` (pipeline schema) + `src/agents/rag_agent.py:62-111` (`RegulationContext`) · correct radio contract exemplar `frontend/pages/model_lab.py:832-841` · grammar `webapp/src/features/dashboard/{search,store,queries}.ts` + `webapp/src/components/{Tabs,DataTable,FileDrop,Pill,Markdown,ChartCard,StatCard,EmptyState}.tsx` + `charts/echartsTheme.ts` + `styles/tokens.css`.
