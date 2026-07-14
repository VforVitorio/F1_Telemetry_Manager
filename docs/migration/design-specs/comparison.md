# Comparison — Design-First Spec (issue #36, flagship)

> Design-first blueprint (Fable, 2026-07-14). The app's demo centerpiece. Sources: `frontend/pages/comparison.py`, `frontend/components/comparison/synchronized_comparison_animation.py` (1116 LOC), `backend/api/v1/endpoints/comparison.py`, `backend/services/comparison_service.py`, MIGRATION_PLAN §1.2/§2.4-P4-2/§3.5/§4.2/§6.5/E3/W4, `st_5_Comparison.png`. `comparison/legacy/*` is dead — ignore.

## 1. Purpose & the job

Answers one question at three zoom levels: **"where does one driver gain on the other — and why?"** One glance = result banner (who won, by how much, microsector tally). One lap = the replay (watch the gap open/close at 60fps). One corner = pause anywhere, synced crosshairs across Delta/Speed/Brake/Throttle expose the mechanism.

**The idea that changes everything:** Streamlit's replay is *distance-locked* — both dots advance one index/frame, always side-by-side, the "gap" only in the delta subplot. The new engine runs on a **TIME clock**: at t=34.2s each dot sits at its own distance-at-time → the faster driver visibly pulls away on track. The replay stops being an animated chart and becomes a race. Earns the expressive motion register — but only on the replay card (glow reserved for the one primary card).

## 2. Functionality inventory (KEEP/IMPROVE/DROP)

| # | Streamlit (file) | Verdict | Target |
|---|---|---|---|
| 1 | Year/GP/Session cascading selectors (`comparison.py:109`) | KEEP | Dashboard `SelectorsToolbar` grammar in a sticky context bar, state in URL. |
| 2 | 2-driver multiselect cap 2 | KEEP | `Combobox` maxSelected=2, enforced in validateSearch. |
| 3 | Explicit COMPARE button (not reactive) | KEEP | Fetch is expensive (cold FastF1 ~60s, 120s timeout); selection cheap+reactive, comparison explicit+cancellable. |
| 4 | "Only fastest laps compared" notice | KEEP | Info chip (lucide `flag`) inline. |
| 5 | "animation takes time" warning toast | DROP | Existed because of Plotly frame-baking; staged skeleton replaces it. |
| 6 | "⏳ Rendering animation…" spinner (`:154`) | DROP | No frame pre-bake anymore; render instant on data. |
| 7 | Lap-times box, winner in team colour, "X first by Ns" (`_render_lap_times_info`) | IMPROVE | `ResultBanner`: same + microsector tally ("16/25") client-side from `circuit.colors`. |
| 8 | Q-phase green chip + amber fairness warning (`metadata.qualifying_phase`/`.warning`) | KEEP | `Pill` success/warning in banner. Real domain logic — surface verbatim. |
| 9 | Circuit animation: 25 microsectors reveal, 50-pt trails, ringed dots | IMPROVE | `TrackCanvas` 60fps, time-domain (dots separate physically), smooth trails, dominance reveal preserved as signature moment. |
| 10 | Delta subplot: faster = flat 0-line, slower = ±delta | IMPROVE | Single delta curve vs faster's zero baseline + signed area fill tinted by who's ahead — "who gains where" readable w/o motion. |
| 11 | Speed/Brake/Throttle progressive painting | IMPROVE | Full static ECharts (never redrawn) + shared playhead cursor + translucent "future dimmer" sliding w/ playhead (compositor-only). Full trace inspectable while paused. |
| 12 | Play 120ms/frame (~8fps) / Pause / ⟲ Reload | IMPROVE | `ReplayTransport`: real HTML buttons (fixes dossier #33 — Playwright couldn't click Play) + speed + keyboard. |
| 13 | Frame slider "Frame: N" | IMPROVE | Time-based `ReplayScrubber` in seconds + S1/S2/S3 sector ticks + `aria-valuetext`. |
| 14 | `hovermode='x unified'` cross-chart hover | KEEP | ECharts axisPointer + `echarts.connect` — the shipped `SyncedLineChart` pattern (ChannelChart.tsx). Active when paused. |
| 15 | Ask-AI button w/ COMPARISON_TEMPLATE | KEEP | "Ask AI about this comparison" ghost → deep-link `/chat` w/ context. Ships disabled-w/-tooltip if #39 not landed. |
| 16 | `session_state['comparison_data']` persistence | KEEP (free) | TanStack Query cache; survives navigation. |
| 17 | 404 "driver not found" toast | KEEP | Toast + inline error + "change driver" hint. |

Zero functional loss; two Streamlit workarounds (5,6) dropped because their cause is gone.

## 3. Layout & IA

Route `/comparison` (already stubbed sharing Dashboard search shape — keep, so "Go to comparison" carries context).

```
┌ STICKY CONTEXT BAR (acrylic) ────────────────────────────────────────────┐
│ [2024▾][Monaco GP▾][Q▾][VER✕ LEC✕ ▾(max 2)]  [⚑ fastest laps]  [COMPARE▸]│
├ RESULT BANNER (calm) ────────────────────────────────────────────────────┤
│ VER 1:10.342  LEC 1:11.824   ●VER first by 1.482s                        │
│ [✓ fastest laps from Q3] [⚠ phase warning]  faster in 16/25 microsectors │
├ ╔═══════════ REPLAY CARD — the ONE glow card ═════════════════════════╗ ─┤
│ ║   TRACK CANVAS (55%)          │ ┌DELTA(area±)┐ ┌SPEED(2 lines)┐    ║   │
│ ║   dominance ribbon + trails   │ │     ┊cursor │ │      ┊cursor │    ║   │
│ ║   + 2 team dots + gap "▲+.32s"│ ┌BRAKE────────┐ ┌THROTTLE──────┐    ║   │
│ ╟───────────────────────────────────────────────────────────────────╢   │
│ ║ TRANSPORT [⏮][▶/⏸][1×▾] 0:34.2 ──●──── 1:10.3  ticks S1│S2│S3 [⧉]║   │
│ ╚═══════════════════════════════════════════════════════════════════╝   │
└───────────────────────────────────────────────────────────────────────────┘
```

Replay card = hero (glow, expressive register, ~80% viewport ≥1280px): track left 55%, 2×2 channel grid right 45%, transport docked full-width bottom — one instrument, one clock. <1280px: track full-width top (min 360px), charts 2×2 below (1-col <720px), transport sticky to card bottom. Selectors+banner frame it (solid bg-3, no glow, ≤180ms mounts).

**States:** Idle (EmptyState, COMPARE disabled until all 5 selections — error-toast-on-click impossible by construction) · Comparing (skeleton of final layout, staged copy "Loading session→Extracting fastest laps→Synchronizing telemetry", cancel via AbortController) · Ready (paused t=0: full track neutral grey, dots on start line, full traces, delta fill; Play pulses once, motion-safe — already a complete static analysis screen) · Playing (clock runs, dominance reveals behind leader, trails stream, cursors sweep, live gap counts, hover suppressed) · Paused mid-lap (freeze; axisPointer hover + connect re-enabled → Dashboard-parity inspection) · Finished (full map lit, gap = final delta; ▶→⟲ Replay; no auto-loop unless toggled) · Error (404 detail inline + toast, Retry keeps selection).

## 4. The replay engine — one-clock architecture

**4.1 Clock is time, not frames.** Backend returns 500 pts/driver on a common DISTANCE grid + each driver's real `lap_time`, but NO time array (verified: `synchronize_telemetry` interpolates distance/x/y/speed/throttle/brake only). Client synthesizes each driver's time domain w/ the math the backend already uses for delta (`calculate_delta_time`):
```
tᵢ[k] = Σ_{j<k} Δd[j] / (vᵢ[j]/3.6)   (cumulative trapezoid, s)
tᵢ    = tᵢ · (lap_timeᵢ / tᵢ[last])     (scale to real lap time)
```
Strictly increasing `timeAtDistance` per driver; inverse `distanceAtTime(t)` = binary-search+lerp (the `interp()` in `ChannelChart.tsx:163` → promote to `lib/interp.ts`). **Replay duration = max(lap_time₁, lap_time₂)** → faster dot parks at the line while the slower finishes — the gap made physical.

**4.2 Data flow & state placement:**
```
URL search (TanStack Router, comparison/search.ts) — COMPARE sets compare=1 → enables query
  ▼ useComparison(search)  (TanStack Query, staleTime:Infinity) → GET /comparison/compare
  ▼ buildReplayModel(payload)  (PURE, memoized, UNIT-TESTED)
     ├ Float32Array channels per driver (distance,x,y,speed,throttle,brake)
     ├ timeAtDistance₁/₂ + distanceAtTime₁/₂ samplers
     ├ delta series + sign-split area segments
     ├ track geometry: bounds, y-flip, viewBox (reuses circuitDraw.ts), microsector segments
     └ duration, sector-boundary times, winner metadata
  ▼ useReplayClock(duration)  (the ONE clock)
     ├ rAF loop; playhead in a REF, never React state
     ├ transport API: play/pause/seek/setSpeed/restart
     ├ subscribe(cb) → every frame w/ tSec  (canvas + cursor overlays)
     └ useReplayTime(hz=10) → throttled React state (text readouts only)
  ▼ consumers, all from the same tick: TrackCanvas · CursorOverlay×4 · FutureDimmer×4 · LiveGapReadout · ReplayTransport
```
State tiers (A5-1): **URL** = year/gp/session/drivers(cap 2)+optional `t` moment-link · **TanStack Query** = payload (immutable, staleTime:Infinity) · **Zustand replayStore** (`f1sl.replay`) = status/speed/loop/trackMode · **ref inside useReplayClock** = playhead time (60 setState/s would re-render the tree; refs + imperative draw = standard rAF discipline, §1.2).

**4.3 rAF loop:** `t = min(t + dt·speed, duration); for cb of subscribers cb(t); if t>=duration finished`. Zero alloc in-loop (Float32Arrays pre-baked, trail slices = index ranges). `visibilitychange` pauses (no time jump on tab return). Budget <4ms/frame (canvas ~1-2ms, cursor transforms ~0). 60fps comfortable.

**4.4 Track renderer (`TrackCanvas` + pure `trackDraw.ts`):** offscreen STATIC layer (ribbon once per data/resize, reuse computeBounds/flipY, add `fitCanvas()` track-units→px w/ aspect lock + DPR≤2 cap, base grey #94a3b8 low-alpha ~10px) + DYNAMIC layer every tick: (1) dominance reveal — microsector segments whose end-distance < leader's distance stroked in `circuit.colors` (25 sectors, per-pixel smooth), (2) trails — last ~2.5s of each driver's real x/y racing line, 3px alpha fade (off under reduced-motion), (3) dots — 7px team-colour fill (`pilot.color` from payload), 2px white ring, soft glow (the one glow on data — it IS the data), (4) gap link — when on-track separation <~8% track length, dashed line connects dots w/ live gap label. Canvas `role=img`+aria-label; visually-hidden `aria-live=polite` announces pause/finish.

**4.5 Channel charts — ECharts static + DOM cursor (critical perf decision):** the 4 charts are ECharts w/ fully STATIC series — `setOption` once per data load, NEVER per frame. Playhead = **DOM overlay: absolutely-positioned 1px line, `transform: translateX(px)`** (compositor-only, ~0 main-thread) — chosen over `dispatchAction`/`setOption`-per-frame (both re-render chart internals). `CursorOverlay` maps playhead distance (leader's distance-at-time; all x-axes = distance like Dashboard) → px via `chart.convertToPixel({xAxisIndex:0}, d)` cached per resize (per-frame = one multiply-add). `FutureDimmer` = 2nd overlay (full-width `rgba(bg-2,.5)`, translateX(cursorPx)) restores progressive-reveal for free. Paused → overlays freeze, native `tooltip.trigger:axis` + `echarts.connect` group take over (Dashboard-parity). Delta: 1 series = slower's delta vs faster's zero baseline (dashed markLine at 0) + split-sign area fill tinted by who leads (driver-1 colour above zero, driver-2 below, 15% alpha) → dominance timeline even stopped.

**4.6 Transport & a11y (fixes dossier #33):** `ReplayTransport` real HTML controls (Button ghost + lucide): ⏮restart, ▶/⏸ (aria-pressed, 44px hit), speed menu (0.25/0.5/1/2), loop toggle, track-mode menu (§7), share-moment. `ReplayScrubber` on Radix Slider: value=seconds, `aria-valuetext="34.2s of 70.3 — VER ahead 0.32s"`, mono readouts, **S1/S2/S3 sector ticks** (placeholder 25/50/75% if sector data absent); drag=seek() live (O(1) redraw — humiliates Plotly), drag pauses + resumes on release. **Keyboard** (scoped to focused card): Space/K play-pause, ←/→ ±0.5s, Shift+←/→ ±5s, Home/End, J/L speed, R restart. `prefers-reduced-motion`: no pulse/trails/GSAP; replay only on explicit action (never autoplays → V3-5 by construction). Focus rings, tab order play→scrubber→speed→secondary.

## 5. Components

Reuse: `Card` glow (replay card, the one glow), `Button`/`Pill`/`Toast`/`Skeleton`/`EmptyState`/`Tooltip`, `Combobox` maxSelected (cap 2), `Slider` (scrubber base), `SyncedLineChart`+`echartsTheme`+connect group (paused inspection), `circuitDraw.ts` (extended w/ canvas `fitCanvas()`), `dashboard/search.ts` pattern (cloned MAX_DRIVERS=2), `getDriverColor` (fallback only — payload ships colours).

New (`webapp/src/features/comparison/`): `ComparisonPage.tsx`, `search.ts` (cap 2, optional t=), `queries.ts` (useComparison), `components/{ComparisonToolbar,ResultBanner,AskAiButton}.tsx`, `replay/{buildReplayModel.ts (PURE, unit-test seam), useReplayClock.ts, replayStore.ts, TrackCanvas.tsx, trackDraw.ts (PURE), ChannelGrid.tsx, ChannelPane.tsx, CursorOverlay.tsx, ReplayTransport.tsx, ReplayScrubber.tsx, LiveGapReadout.tsx}`. Promote `interp` → `lib/interp.ts`. **`ReplayTransport` + `useReplayClock` are the reusable seams** (future live-timing feed + Arcade consumers want a transport+clock abstraction — keep them free of comparison-specific types).

## 6. Data & migration notes

Endpoint (exists): `GET /api/v1/comparison/compare?year&gp&session&driver1&driver2` (schema.ts:191). Response:
```jsonc
{ "circuit": { "x":[500], "y":[500], "colors":["#hex"×500] },  // centreline avg; colors = 25-microsector dominance per point
  "pilot1": { "distance":[500],"x":[500],"y":[500],"speed":[500],"throttle":[500],"brake":[500],
              "lap_time":70.342,"color":"#3671C6","name":"VER","lap":14 },
  "pilot2": { /* same */ },
  "delta": [500],  // + = pilot1 slower here (speed-integrated, scaled to real lap-time diff)
  "metadata": { "rotation":40,"aspect_ratio":1.8,"qualifying_phase":"Q3"|null,"warning":"..."|null } }
```
Payload ≈500pts×13 arrays×~10B ≈ **150-250 kB** vs multi-MB pre-baked Plotly figure (P4-2 −90%+ met by NOT shipping frames).

Interp math to port (unit-test seam): (1) `np.interp`→`interp()` already in ChannelChart.tsx:163 → promote to `lib/interp.ts`; (2) time-domain synthesis + delta = TS port of `comparison_service.calculate_delta_time` (`Δd/(v/3.6)` cumulative + scale, comparison_service.py:185-232) in `buildReplayModel.ts`. **Golden-fixture test:** run the Python fns on 2023 Monaco Q VER/LEC → `tests/fixtures/comparison-monaco-2023.json`, assert TS port within 1e-6 (like `outliers.test.ts`). Pins the port to thesis-validated math.

URL (`comparison/search.ts`): `/comparison?year=2023&gp=Monaco Grand Prix&session=Q&drivers=VER,LEC[&t=34.2]`. Drivers CSV upper/dedup/**cap 2**; `t` optional float clamped [0,duration], applied once on load (moment link), written only by share button. Dashboard's "Go to comparison" gracefully truncates 3 drivers → 2.

**Optional additive backend (NOT parity gates):** B1 — real `time` arrays in compare payload (FastF1 has it; /lap-telemetry already returns it) → kills the speed-integration approx (client keeps synthesis as fallback), ~15 LOC. B2 — official S1/S2/S3 boundaries in metadata → true scrubber ticks + per-sector splits.

## 7. New features (ranked)

1. **Corner call-outs** (M) — detect braking zones (brake-rise) + apexes (speed minima) from arrays in hand; label T1..Tn; pause near one → micro-card "T5: LEC brakes 14m later, exits +6km/h, gains 0.09s". Pure client. **The** analyst feature.
2. **Track colour modes** (S) — transport menu: Dominance (parity) · Speed heatmap · Gain/loss (delta-derivative). One draw-fn switch.
3. **Ghost dot** (S) — hollow marker of the other driver at this elapsed time on your line; explains the delta visually.
4. **Share a moment** (XS) — copy URL w/ `&t=34.2` + toast. Zero backend.
5. **Export a clip** (M) — `canvas.captureStream(60)` + MediaRecorder → WebM for README/social. Dev-flag first.
6. **Official sector splits** (S+backend) — needs B2.
7. **3D upgrade (E3)** (L) — r3f track w/ elevation, chase-cam, emissive dominance. Lazy chunk, mounts on toggle, 2D fallback. Engine ready: useReplayClock subscribers don't care if consumer is canvas 2D or three. The defense flex; never parity.
8. **Any-lap comparison** (M+backend) — not only fastest; needs lap1/lap2 params.

Recommended for #36: parity + ranks 2-4 (near-free once engine exists). Rank 1 = fast-follow PR; 5-8 = backlog.

## 8. Better than Streamlit (demo script)
8fps→60fps (clock vs flipbook) · physically-true replay (dots on real time, you WATCH the gap open — no broadcast graphic does head-to-head like this) · multi-MB→~200kB · instant continuous scrubbing (seek(t) = 1 canvas frame, feels like a video editor) · accessible by construction (real buttons, labelled slider, keyboard map, live-region, reduced-motion) · paused = full analysis screen (complete curves + synced crosshairs) · shareable (`&t=` reproduces the moment) · state survives navigation.

## Acceptance criteria (#36, condensed)
§6.5 parity rows pass · 60fps sustained (DevTools trace in PR, <8ms/frame) · buildReplayModel golden test vs Python fixture green · keyboard-only transport (axe/Playwright can click Play — regression test named after dossier #33) · prefers-reduced-motion honored (no pulse/trails, replay only on explicit action) · URL round-trip incl `t=` · NO setOption inside the rAF loop (assert via spy).

**Key files:** `frontend/pages/comparison.py` + `frontend/components/comparison/synchronized_comparison_animation.py` · port math `backend/services/comparison_service.py` (synchronize_telemetry, calculate_delta_time, calculate_microsector_colors) · endpoint `backend/api/v1/endpoints/comparison.py` · grammar `webapp/src/features/dashboard/{search.ts,store.ts,queries.ts,components/ChannelChart.tsx,components/circuitDraw.ts}` · route stub `webapp/src/app/router.tsx:63-67`.
