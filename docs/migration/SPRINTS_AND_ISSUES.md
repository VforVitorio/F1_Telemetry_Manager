# Frontend migration — Fase C: epic → sprints → issues → PRs

> Translation of `MIGRATION_PLAN.md` (Fable 5) into the GitHub working structure, per PROJECT_BOOTSTRAP §1b.
> **Target repo = the submodule `VforVitorio/F1_Telemetry_Manager`** (the frontend lives there), tied to issue **#25**.
> The parent `F1_Strat_Manager` only bumps the submodule pointer at cutover. Víctor creates the issues/commits
> himself — this is the ready-to-create draft, NOT auto-created.

## Epic
**Epic #25 — Migrate the telemetry UI from Streamlit to a local React SPA.** All issues below `Closes`/link to it.
Suggested labels (create in the submodule if missing): `epic`, `migration`, `area: frontend`, `area: backend`,
`area: infra`, `enhancement`, plus type via Conventional-Commit prefix in the PR title.

## Branch/PR rules (submodule)
Follow the submodule's branch model (mirror the parent's `feat/…`→integration convention). **One PR = one concern**,
Conventional-Commit title, `Closes #N`. **No AI attribution.** Each parity issue's PR is not "done" until every
cited §6 row is ✅ against the named dossier PNG (visual side-by-side).

---

## Sprint 0 — Backend hardening (pre-W2 blockers, from dossier Findings 1–3)
These are backend/packaging bugs that bite SPA devs running the backend locally. File first.

| Issue | Type | Scope | Ref |
|---|---|---|---|
| S0-1 | `fix` | Repo-root `.git` walker breaks data paths on bare metal → add `/app` fallback / honor `F1_STRAT_DATA_ROOT` | Finding 1 / A5-6 |
| S0-2 | `fix(deps)` | `openai-whisper` build fails on a fresh venv → pin/patch build | Finding 2 |
| S0-3 | `fix(deps)` | `fastmcp` missing from `pyproject.toml` vs `requirements.txt` drift → reconcile manifests | Finding 3 / A5-6 |

---

## Sprint 1 — Foundations (W0 + W1) · Size M+M
| Issue | Type | Scope | Deps |
|---|---|---|---|
| S1-1 | `infra` | `webapp/` Vite+TS scaffold · Docker (node build → nginx:alpine) · compose service on :3000 · CI (lint/typecheck/build/vitest) | — |
| S1-2 | `feat` | Typed API layer + `openapi-typescript` from FastAPI schema · generic SSE client (`eventsource-parser`, AbortController) · Query/Router/Zustand wiring | S1-1 |
| S1-3 | `feat` | Tailwind v4 theme mapped 1:1 to `tokens.css` · self-hosted fonts (Space Grotesk/Inter/JetBrains Mono) · one ECharts theme from tokens | S1-1 |
| S1-4 | `feat` | Design-system primitives (Card, Button, Combobox, Sliders, Tabs, StatusStepper, StatCard, Pill, Gauge, ChartCard, DataTable, Modal, Toast, EmptyState, Skeleton, Markdown, FileDrop) + app shell (acrylic rail + sticky header + route transitions) | S1-3 |

## Sprint 2 — Pilot + core data screens (W2 + W3) · Size M+M
| Issue | Type | Scope | Deps |
|---|---|---|---|
| S2-1 | `feat` | **Pilot: Dashboard** full §6.1 parity (URL-bound selectors, ECharts click-to-load, 7-channel grid + grid⇄stack, circuit domination, client IQR toggles) — proves data layer/URL/chart theme | S1-* |
| S2-2 | `feat` | **Strategy** §6.2 (StatusStepper scripted stages, recommendation glow card, 4 agent sub-tabs, scenario bars, JSON download) | S1-4 (parallel-safe w/ S2-1) |

## Sprint 3 — Flagship + analysis (W4 + W5 + W6) · Size L+L+M
| Issue | Type | Scope | Deps |
|---|---|---|---|
| S3-1 | `feat` | **Comparison replay engine (flagship)** §6.5 — fetch channels once → distance-domain interpolation → rAF canvas 60fps → accessible HTML transport + scrubber. **Port interpolation math FIRST with unit tests vs a `/comparison/compare` fixture** (risk 2) | S2-1 |
| S3-2 | `feat` | **Race Analysis** §6.3 — 5 tabs, loader+file-drop (F1-4), tyre chart-switcher (U2-4), radio gate + NLP badges, RAG card, virtualized DataTable (kills `st.dataframe`) | S2-1 |
| S3-3 | `feat` | **Model Lab** §6.4 — shared context bar (U2-5), 6 tabs, ECharts gauges, cancelable Pace run + skeleton (P4-9) | S2-2 |

## Sprint 4 — Conversational (W7 + W8) · Size L+M
| Issue | Type | Scope | Deps |
|---|---|---|---|
| S4-1 | `feat` | **AI Chat** §6.6 — virtualized message list, SSE streaming + stage chips + Stop, tool-call badges, **`toolResult→EChartsOption` dispatcher (F1-1, don't drop inline charts)**, image attach, graceful tool-error pattern, reports store | S1-2 (SSE) + S1-4 |
| S4-2 | `feat` | **Voice** §6.7 — lift `AudioOrb/Iridescence/useAudioLevel` verbatim (drop the streamlit-iframe harness), `useVoiceSession` (MediaRecorder+AnalyserNode), voice picker, playback | S4-1 |

## Sprint 5 — Onboarding, Home & cutover (W9 + W10) · Size M+M+S
| Issue | Type | Scope | Deps |
|---|---|---|---|
| S5-1 | `feat` | **Onboarding** §4.6 (NEW work — see open Q1) — welcome overlay → 3-step guided setup → 4-mark tour → warmup ping. Gate `f1sl.onboarded.v1` | S2-1, S2-2, S3-1, S4-1 (tour anchors) |
| S5-2 | `feat` | **Home** §4.2 — Three.js track-ribbon hero (WebGL-optional, static `--grad-hero` fallback), 3 quick-start cards, recent-activity from localStorage | S1-4 |
| S5-3 | `chore` | **Cutover** — SPA takes :8501, remove Streamlit from compose (kept one release behind `--profile legacy`, then delete), README/INSTALL/thesis-doc paths, full §6 regression + dossier-PNG visual pass, bump submodule pointer in parent | all |

---

## Enhancements backlog (post-parity — separate `enhancement` milestone, none gate parity)
E1 real light theme · E2 ⌘K palette · E3 replay 3D upgrade · E4 one-click report · E5 chat/report search/pinning ·
**E6 real per-agent SSE progress (BACKEND change — needs approval)** · E7 live-timing WS adapter · E8 "ask AI about
this chart" deep-links · E9 Playwright visual-regression seeded from the 37 dossier PNGs · E10 Model Lab run history ·
E11 backend manifest unification · E12 Home hero (if not in W9).

## Milestone/sprint calendar
~7–9 weeks solo part-time. Strangler: SPA at `webapp/` beside the untouched Streamlit tree; compose runs BOTH UIs
(Streamlit :8501, SPA :3000) through Sprints 2–5 for side-by-side parity checks; cutover swaps ports.

## Blocking open questions (answer before/with the relevant sprint) — see chat
Q1 onboarding = new work (S5-1) · Q2 persist chats/reports (default yes) · Q3 `comparison/legacy/*` dead → not ported
(else +1 issue in S3-1) · Q4 keep SPA on :8501 at cutover · Q5 E6 backend progress out of scope until approved ·
Q6 dark-only at parity, light = E1 · Q7 `webapp/`→`frontend/` naming at cutover.
