# Strategy — Design-First Spec (issue #35)

> Design-first blueprint (Fable, 2026-07-14). Take the Streamlit Strategy tab's functionality and build the elevated migrated interface, NOT a 1:1 port. Inherits the Dashboard grammar (URL=selectors, Zustand=UI, TanStack Query=data, ECharts, design-system primitives).

## 1. Purpose & the job

Strategy is the **pit-wall decision surface**: the UI of the N31 multi-agent orchestrator, the crown jewel of the TFG. Its job: *"Put me at any lap of any 2025 race, let me set my risk appetite, and give me a defensible strategy call — with the evidence trail (per-agent analysis, Monte Carlo scores, regulation basis) one click deep."*

Streamlit treats this as a form → results dump. The migrated version = a **three-act experience**: configure a scenario → watch the agent council deliberate → read a decision brief. **KEY DISCOVERY: the orchestrator returns a 14-field v2 recommendation (`src/agents/strategy_orchestrator.py:319`) and Streamlit renders only 6.** The core move is surfacing the whole schema (pit plan, pace instruction, contingencies, key risks) — "a badge and prose" → a genuine strategy brief. Zero backend work.

## 2. Functionality inventory (Streamlit → verdict)

| # | Streamlit feature (file) | Verdict | Why / target |
|---|---|---|---|
| 1 | "Only 2025 season data" `st.warning` (`strategy.py:37`) | KEEP (demoted) | Info chip inside the scenario bar, not a full-width banner. §6.2. |
| 2 | GP selector (`strategy.py:45`) | KEEP | `Combobox`, URL-bound. |
| 3 | Driver selector, gated on GP (`strategy.py:60`) | KEEP | disabled until GP; cascading reset. |
| 4 | Optional Rival selector (`strategy.py:70`) | KEEP + IMPROVE | Team-colour names; rival powers a "duel strip" with deltas. |
| 5 | Lap-range dual slider + "analyses lap X (end of range)" (`strategy.py:94-100`) | KEEP + IMPROVE | `DualRangeSlider`; explicit "Analysing lap 28" chip; range = viewport of the Stint Timeline. |
| 6 | Risk slider 0-1 + captions (`strategy.py:102-105`) | KEEP + IMPROVE | `Slider` with Conservative/Balanced/Aggressive tick labels + live zone label. |
| 7 | Run button (`strategy.py:111`) | KEEP + IMPROVE | Primary CTA; disabled-with-reason; elapsed timer + cancel (client abort). |
| 8 | `st.status` narrated stages (`strategy.py:210-230`) | KEEP + IMPROVE | `StatusStepper` → an **Agent Deliberation panel** (§5). Same scripted stages, premium choreography. |
| 9 | Lap snapshot: compound/tyre age/gap/lap time/SC prob (`strategy.py:160-188`) | KEEP | 5 `StatCard`s; compound as `CompoundPill` in tyre colour. |
| 10 | Rival snapshot (`strategy.py:120-157`) | KEEP + IMPROVE | Folded into the duel strip with computed deltas. |
| 11 | Recommendation card (`strategy_card.py`) | KEEP + IMPROVE (the big one) | Glow `Card`. Surfaces the FULL v2 schema: `pace_mode`, `target_lap_time_s`, `pit_lap_target`, `compound_next`, `undercut_target`, `risk_posture`, `key_risks`, `contingencies`, `expected_stint_end` — all discarded by Streamlit today. |
| 12 | Reasoning truncated to 800 chars (`strategy_card.py:65`) | DROP truncation | Full LLM prose via `Markdown` in an "Engineer's note" disclosure. |
| 13 | `risk_level` metric (`strategy_card.py:59`) | DROP (superseded) | Render `risk_posture` (AGGRESSIVE/BALANCED/DEFENSIVE) pill; renderer stays tolerant if absent. |
| 14 | Regulation context expander (`strategy_card.py:69`) | KEEP | Disclosure with lucide `Scale`, only when `regulation_context !== ""`. |
| 15 | JSON download (`strategy.py:255`) | KEEP | Blob download as card header action; filename `strategy_{gp}_{driver}_lap{lap}.json`. |
| 16 | Scenario score bars, winner in accent (`scenario_chart.py`) | KEEP + IMPROVE | ECharts bars, plot **E with P10-P90 whiskers** (backend returns `{E,P10,P90,score}`; Streamlit plots only `score`) + delta-to-winner. |
| 17 | `EXTEND_STINT` in colour maps (`strategy_card.py:17`, `scenario_chart.py:14`) | DROP | v2 enum = `STAY_OUT｜PIT_NOW｜UNDERCUT｜OVERCUT｜ALERT`. Add ALERT (pulsing danger) + neutral fallback. |
| 18 | 4 agent sub-tabs, lazy-fetch + cache (`agent_tabs.py`) | KEEP + IMPROVE | Segmented `Tabs`; lazy via TanStack Query `enabled`-on-first-open; cache free via queryKey; each tab gets a micro-chart. Optional 5th Radio tab (§7). |
| 19 | Per-agent collapsible reasoning (`agent_tabs.py`) | KEEP | Disclosure per tab. |
| 20 | Result persists (`st.session_state["strategy_result"]`) | KEEP + IMPROVE | Zustand run records; survives route changes; enables run history (§7). |
| 21 | Purple-border chart CSS injection (`strategy.py:196`) | DROP | `ChartCard` + tokens carry the language. |
| 22 | Centered "Strategy Advisor" title | KEEP (adapted) | Standard `Header title="Strategy"`. |

## 3. Layout & IA

IA: sticky Scenario Bar → Deliberation (transient) → Decision Brief (hero) → Evidence (scenario scores + timeline + agent tabs). Decision first, evidence below.

```
┌ Header: "Strategy"                        [⬇ JSON] [🔗 Copy scenario link] ┐
│ ╔═ SCENARIO BAR (sticky; collapses to a chip row after a run) ═══════════╗ │
│ ║ (2025 season · chip)                                                   ║ │
│ ║ [Grand Prix ▾]   [Driver ▾ VER]   [Rival ▾ LEC (optional)]             ║ │
│ ║ Lap window  ●━━━━━━━━━━● 8–28   → Analysing lap 28                     ║ │
│ ║ Risk  ●━━━━○  0.55 · Balanced          [▶ Run strategy]                ║ │
│ ╚════════════════════════════════════════════════════════════════════════╝ │
│    collapsed after run:  ⟨Hungarian GP⟩ ⟨VER⟩ ⟨vs LEC⟩ ⟨Lap 28⟩ ⟨risk .55⟩ │
│                                            [Edit scenario] [↻ Re-run]       │
│ ── RUNNING (replaces zones below) ── Agent Deliberation: StatusStepper +   │
│    5 pulsing agent chips (Pace·Tire·Pit·SC·Radio) + elapsed + [Cancel]      │
│ ── COMPLETE ──                                                             │
│ ┌ SITUATION STRIP: [● MEDIUM][Tyre 14][Gap +2.4s][Lap 78.912][SC 12%]     │
│ │  duel row w/ rival: VER vs LEC : Δtyre −3, gap +2.4s, LEC HARD 79.1 ────┐│
│ ┌ DECISION CARD (glow) ──────────────┐ ┌ SCENARIO SCORES ────────────────┐│
│ │ ⛭ PIT NOW              ◔ 82%       │ │ PIT NOW ▓▓▓▓▓▓ .61 ─┼─          ││
│ │ BALANCED · PUSH · target 78.450    │ │ STAY OUT ▓▓▓▓ .44  ─┼─          ││
│ │ Plan: box lap 29 → MEDIUM · under- │ │ (E dot + P10–P90 bar)          ││
│ │ cut SAI · ▸ Engineer's note        │ ├ STINT TIMELINE ────────────────┤│
│ │ Key risks: • cliff P10 @ lap 22    │ │ 8══now 28═▒cliff▒═▲box 29 ⌁end │││
│ │ Playbook: IF SC → PIT NOW (P1) …   │ └────────────────────────────────┘│
│ │ ▸ ⚖ Regulation context             │                                   │
│ └────────────────────────────────────┘                                    │
│ ┌ AGENT BREAKDOWN — segmented Tabs: Pace|Tyres|Situation|Pit ────────────┐│
│ │  MetricRow/StatCards + one micro-chart + ▸ reasoning disclosure         ││
└─────────────────────────────────────────────────────────────────────────────┘
```

**States:** Idle (bar expanded + EmptyState with ghosted preview; progressive gating) · Running (bar locks, deliberation IS the loading state, no fake skeletons) · Complete (deliberation collapses, brief reveals staged, bar collapses to chips) · Error (lap-state 404 → inline pinned to bar; orchestrator 422/500 → error Card + Retry, config preserved; 429 rate-limit 5/min → Toast) · Stale (selector changed after a run → results stay but labelled "scenario has changed" + prominent Re-run).

## 4. Components

Reuse: `Combobox`, `DualRangeSlider`+`Slider`, `StatusStepper` (written for this pipeline), `Card` glow (decision — the one glow), `Card` resting, `Tabs` segmented, `StatCard`/`MetricRow`, `Pill`, `Markdown`, `ChartCard`, `Skeleton`/`EmptyState`/`Toast`/`Tooltip`/`Button`, ECharts+`F1_THEME`+`tireColors`. Lift `features/dashboard/lib/drivers.ts` → `src/lib/` (two features need it).

**New shared primitives (3):** `ActionBadge` (action vocab at hero+sm sizes: STAY_OUT→CircleCheck/success · PIT_NOW→Wrench/danger · UNDERCUT→ArrowDownRight/warning · OVERCUT→ArrowUpRight/blue · ALERT→TriangleAlert/danger pulse · unknown→neutral) · `ConfidenceDial` (SVG radial %, tooltip "LLM self-assessed — qualitative, not calibrated") · `CompoundPill` (tyre chip from `tireColors`).

**Feature-local (`features/strategy/components/`):** `ScenarioBar`, `AgentDeliberation`, `DecisionCard`, `ContingencyList` (playbook: IF trigger → ActionBadge (priority), renders `contingencies[≤4]`), `ScenarioScoresChart` (E bar + P10-P90 whisker + Δ-to-winner), `StintTimeline` (SVG lap axis: now marker, cliff zone from Tyre P10→P90, `pit_lap_target` ▲ + `compound_next` pill, `expected_stint_end`; degrades gracefully), `SituationStrip`+`RivalDuel`, `AgentTabs` (micro-charts per tab: Pace→CI band, Tyres→cliff P10/50/90 3-bar, Situation→2 ConfidenceDials, Pit→stop P05/50/95 range + undercut dial + CompoundPill).

## 5. Interactions & flows

1. **Configure** — progressive disclosure (GP→Driver→sliders+Run); risk slider live-labels zone; analysed-lap chip tracks the range's right thumb; Run disabled-with-reason.
2. **Deliberate** — on Run, bar locks, deliberation mounts. StatusStepper stages (only 2 real backend boundaries): *Building lap state…* (real GET /lap-state) → *Running agents Pace·Tire·Pit·SC·Radio…* (real POST /recommend; 5 chips pulse 800ms looping, motion-safe) → *Scoring 500 Monte Carlo ×4…* (scripted timer ~60% elapsed) → *Synthesizing…* (until POST resolves). Elapsed mono; Cancel = AbortController; `aria-live=polite`.
3. **Decide** — stepper→complete, panel collapses, brief enters staged (card fade+rise 250ms → strip → bars animate → timeline draws → tabs), <800ms, motion-safe. Bar collapses to sticky chips.
4. **Audit** — confidence dial + qualitative tooltip; reasoning one disclosure away (full Markdown, no truncation); agent tabs lazy-fire on first open, cached; regulation disclosure only when non-empty.
5. **Iterate** — nudge lap/risk → stale notice + Re-run; each run appends to session history → lap-by-lap walk.

## 6. Data & migration notes

Backend (`backend/api/v1/endpoints/strategy.py`, `/api/v1/strategy`): `GET /available-gps?year=2025` (235) · `GET /available-drivers?gp&year` (244) · `GET /lap-range?gp&driver&year` (254) · `GET /lap-state?gp&driver&lap&year` (269) · `POST /recommend {lap_state, gap_ahead_s, pace_delta_s:0, risk_tolerance}` → `{agent:"orchestrator", result: StrategyRecommendation}` (677; **rate-limit 5/min**) · `POST /pace|/tire|/situation|/pit {lap_state}` → typed results (398-614) · `POST /radio`,`GET /radio-*` (optional 5th tab) · `POST /simulate` SSE (899, NOT for #35 — future streaming race-mode seam).

Type in `lib/api/strategy.ts`. Orchestrator v2 schema (`strategy_orchestrator.py:319`): `action` (5-enum incl ALERT), `reasoning`, `confidence`, `pit_lap_target?`, `compound_next?`, `undercut_target?`, `pace_mode`, `target_lap_time_s?`, `risk_posture`, `contingencies[≤4]{trigger,action,priority,rationale}`, `key_risks[≤5]`, `expected_stint_end?`, `scenario_scores: Record<string,{E,P10,P90,score}>`, `regulation_context`. **Every optional field renders conditionally — null-tolerant throughout** (a no-LLM run returns sparse fields).

URL (`features/strategy/search.ts`, same raw↔component boundary as Dashboard): `/strategy?gp=...&driver=NOR&rival=PIA&laps=8-28&risk=0.55`. `laps` encoded "a-b"; `risk` clamped [0,1] default 0.5; `rival` dropped if == driver; year constant 2025. Cascade: gp→clears driver/rival/laps; driver→clears rival/laps. **Deep links reproduce config, NEVER auto-fire the run** (LLM call, rate-limited, non-deterministic) — land on prefilled idle w/ Run highlighted.

State split: TanStack Query staleTime:Infinity for gps/drivers/lap-range/lap-state + the 4 agent POSTs as queries keyed `['strategy','agent',<name>,gp,driver,lap]` `enabled` on first tab open. `useMutation` for POST /recommend (non-deterministic, rate-limited). Zustand `features/strategy/store.ts` (not persisted / sessionStorage): `runs: RunRecord[]{id,config,lapState,result,ranAt}` (cap ~20), `activeRunId`, `pinnedRunId`. Mutation onSuccess appends → history + compare nearly free.

Gotchas: map old→new vocab (EXTEND_STINT gone, ALERT new, risk_level→risk_posture); JSON download serializes full `result` verbatim; `gap_ahead_s` from `lap_state.driver.gap_ahead_s` w/ 2.0 fallback (as Streamlit).

## 7. New features (ranked)

1. **Full v2 decision brief** ⚡ — render pace_mode, target_lap_time_s (radio line `TARGET 78.450 — PUSH`), pit plan (pit_lap_target+compound_next+undercut_target in team colour), risk_posture, key_risks, contingencies. Data already in every response.
2. **Scenario scores with uncertainty** ⚡ — E + P10-P90 whiskers + Δ-to-winner. Shows how close the call was.
3. **Run history rail + lap-walk** — session strip of past runs; click restores; confidence-across-laps sparkline. Cheap (store holds records).
4. **Pin & compare** — two-column diff of two runs.
5. **Risk sweep** — fire /recommend at risk 0.25/0.5/0.75, show if the action flips. Burns 3/5 rate budget → explicit button, sequential, post-core.
6. **Radio evidence tab (5th agent)** — POST /radio + radio GETs exist; share components w/ Race Analysis radio.
7. **Race mode (streaming)** — POST /simulate streams SSE lap-by-lap. Out of scope; build deliberation+card as pure fns of a RunRecord so a streaming producer can drive them later. Note the seam.

## 8. Better than Streamlit
Whole recommendation not 40% of it (14 vs 6 fields, free) · uncertainty visible (P10-P90 whiskers, CI band) · shareable scenarios (URL=config) · deliberation moment vs spinner · stale-result honesty · untruncated reasoning · iteration as first-class loop · coherent system (shared grammar, no injected CSS/raw-HTML metric blocks).

**Key files:** `frontend/pages/strategy.py` · `frontend/components/strategy/{strategy_card,agent_tabs,scenario_chart}.py` · `backend/api/v1/endpoints/strategy.py` (235-745) · `src/agents/strategy_orchestrator.py:319` (v2 schema, the centerpiece) · grammar `webapp/src/features/dashboard/*` + `webapp/src/components/{Card,StatusStepper,Tabs,Slider,StatCard,Pill}.tsx` + `charts/echartsTheme.ts` + `styles/tokens.css`.
