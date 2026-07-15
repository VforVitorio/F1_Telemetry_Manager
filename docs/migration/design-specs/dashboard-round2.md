# Dashboard - Round 2 Fixes Plan

> Execution plan (Fable, 2026-07-14). Five refinements to the shipped Dashboard (issue #34 + elevation round 1), designed from the real code and the current screenshot (2023 Monaco R, VER/LEC). This is a build-tomorrow plan, not a design-first spec: each item carries root-cause/analysis, the concrete file:line change plan, and an S/M/L effort tag. All paths relative to `webapp/src/` unless noted. Golden verify session: **2023 Monaco R, VER+LEC** (only offline-cached FastF1 session).

**Scope of files touched:**

| Item | Files |
|---|---|
| 1 Click bug | `features/dashboard/components/LapChart.tsx`, `LapChartSection.tsx` |
| 2 Drivers loading | `components/Combobox.tsx`, `features/dashboard/components/SelectorsToolbar.tsx` (+ backend follow-up issue) |
| 3 Controls fold-in | `components/ChartCard.tsx`, `features/dashboard/components/{LapChartSection,LapControls,CompoundLegend}.tsx` (+ new `LapChartFooter.tsx`) |
| 4 8th chart | `features/dashboard/components/{channels.ts,ChannelChart.tsx,TelemetryGrid.tsx}` (+ new `accel.test.ts`) |
| 5 Drag-to-zoom | `features/dashboard/components/{ChannelChart,LapChart}.tsx` |

---

## 1. BUG - clicking a lap-chart point does nothing (M)

### Root cause

The handler chain is **wired correctly and sound**, verified end to end: `LapChart.tsx:233` binds `onEvents={{ click: handleClick }}` -> `handleClick` (:218-224) -> `extractLapClick` (:184-194) -> `onLapClick`; `LapChartSection.tsx:87` passes `onLapClick={setLap}`; `store.ts:39-40` merges into `selectedLapsPerDriver`; `TelemetryGrid.tsx:98-101` reads it via `useLapTelemetries` (`queries.ts:172-244`), which fires a new `lap-telemetry` query per changed (driver, lap). So the candidates rule out as follows:

- **(c) wrapper interception - RULED OUT.** `role="img"` (`LapChart.tsx:227`) is ARIA-only, it does not affect pointer events; the ChartCard body (`components/ChartCard.tsx:97`, `overflow-auto p-4`) sits behind the canvas, not over it.
- **(d) echarts-for-react binding - RULED OUT.** v3.0.6 binds `onEvents` at init and only re-binds on a deep-equality miss; `handleClick` is `useCallback`-stable over zustand's stable `setLap`, so `{ click: handleClick }` deep-equals across renders. `notMerge` drives `setOption`, not re-init, so the listener survives option rebuilds.
- **(a) hit area - PRIMARY CAUSE.** With `tooltip.trigger: 'item'` and default line-series hit-testing, ECharts fires a series `click` only when the pointer hits a drawn graphic. After the round-1 de-bead, symbols are `symbolSize: 5` (`LapChart.tsx:94`); a ~78-lap race across a ~700-900 px grid spaces dots ~9-11 px apart, so the real target is a 5 px dot (`emphasis.scale: 1.6` only grows it *after* hover registers, which is the same tiny target). Clicking the connecting line does not help: `triggerLineEvent` defaults to false, and even when enabled the polyline event carries no per-point `data`, so `extractLapClick` correctly returns `null` through its guards. Most clicks land 3-10 px off a dot and **no event fires at all**.
- **(b) invisible success - COMPOUNDING CAUSE.** When a click *does* land, there is often nothing to see. The page auto-loads each driver's fastest lap on mount (`DashboardPage.tsx:67-74`), so clicking in the fastest region re-selects the already-loaded lap (a same-value `setLap` merge, zero state change). Clicking a genuinely different lap changes only the small caption (`LapChartSection.tsx:109-128`) and the telemetry grid **below the fold** (see the screenshot's page height). No marker on the chart, no toast, no scroll. Successful clicks read as "nothing happened" too.

So: not a broken handler, a **hit-area + feedback** defect. The fix must work regardless of which factor bit the user on any given click.

### Fix plan (three layers, all land together)

**1a. Nearest-point picking (decouple the hit area from the 5 px dot).** In `LapChart.tsx`:

- Remove the `onEvents` item-click path (:218-224, :233) - one deterministic code path instead of two racing ones.
- Add `onChartReady={(chart) => bindNearestPointClick(chart, propsRef)}` on the `ReactECharts` (:228-234). New helper `bindNearestPointClick` registers `chart.getZr().on('click', handler)`:
  - Guard: `if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return` - legend/axis/title clicks stay inert.
  - For every plotted point (per visible series), `chart.convertToPixel({ seriesIndex }, value)`, compare squared pixel distance to the click, keep the minimum, accept when within a **20 px radius** (comfortable touch-size target). Max ~240 points (3 drivers x ~80 laps), trivial per click.
  - Pixel-space nearest (not `convertFromPixel` + data-space nearest) because it matches what the eye considers "the closest dot" when lap times differ wildly on y (the Monaco rain wall in the screenshot).
- The zr handler binds once per chart instance, so it reads laps/`onLapClick` from a `useRef` updated on every render (`propsRef.current = { laps: plotted per-series data, onLapClick }`).
- `symbolSize: 5` stays - the de-bead visual is untouched; only the interaction radius grows.

**1b. Visible selected-lap marker.** Pass `selectedLaps: Record<string, number>` into `LapChart` (new prop; `LapChartSection.tsx:60` already reads `selectedLapsPerDriver`, hand it down at :83-88). In `buildDriverSeries` (`LapChart.tsx:90-100`), when `lap.lap_number === selectedLaps[driver]`, emit a per-point override object: `{ value, compound, symbolSize: 11, itemStyle: { borderColor: '#fff', borderWidth: 2 } }`. Each driver's loaded lap renders as a ring; a successful click **visibly moves the ring at the click site**, independent of the below-the-fold grid.

**1c. Click feedback toast.** In `LapChartSection.tsx`, replace the direct `onLapClick={setLap}` (:87) with a local `handleLapClick(driver, lap)`:

- Same lap already loaded -> `toast({ title: "${driver} lap ${lap}", description: 'Already showing this lap.', tone: 'info' })`, no store write.
- New lap -> `setLap(driver, lap)` + `toast({ title: "${driver} lap ${lap} loaded", description: 'Telemetry updated below.', tone: 'success' })`.
- `useToast` from `@/components/Toast`; the provider is already mounted app-wide (`app/providers.tsx:21`), nothing to add.

No store or query changes anywhere.

### Browser verification

Backend on :8000, `npm run dev` in `webapp/`, open `/dashboard?year=2023&gp=Monaco Grand Prix&session=R&drivers=VER,LEC`.

1. Click **8-10 px off** any dot -> DevTools Network shows `GET /api/v1/telemetry/lap-telemetry?...&lap_number=N`, the ring jumps to that lap, success toast, caption updates.
2. Click the already-ringed fastest lap -> "already showing" info toast, **no** refetch.
3. Click the legend / axis area -> nothing (containPixel guard).
4. Toggle Outliers/Invalid, click near a filtered-out region -> picker only finds *visible* points (it searches the plotted series data, which is `filterResult.visible`).
5. After item 5 lands: drag a zoom/pan gesture -> no phantom lap pick (zrender suppresses `click` after a real drag; if a phantom fires, add a mousedown->mouseup delta < 4 px guard in the handler).

Optionally script 1-2 as a Playwright check per the `shot.mjs` harness.

---

## 2. Drivers combobox unusable too long after picking a session (S + backend follow-up)

### Analysis

`useDrivers` (`features/dashboard/queries.ts:69-89`) hits `GET /api/v1/telemetry/drivers` -> `get_drivers` (`backend/api/v1/endpoints/telemetry.py:79`) -> `get_available_drivers` (`backend/services/telemetry/telemetry_service.py:92-105`), which constructs `SessionData` -> `session_cache.get_loaded_session` (`backend/services/telemetry/session_cache.py:51-82`) doing a **full** `load(telemetry=True, laps=True, weather=True)`: 2-15 s warm, 30 s+ on a cold FastF1 download. The prewarm POST (`DashboardPage.tsx:85-87`) fires on the same navigation, so `/drivers` just queues behind the same per-key lock (`session_cache.py:67`) for the whole parse. Meanwhile the combobox renders `disabled={!value.session || driversQuery.isLoading}` (`SelectorsToolbar.tsx:101`) - **visually identical** (`opacity-50`) to "no session picked yet", so 15 s of legitimate work reads as "broken control".

### Fix plan (frontend, this round)

- `components/Combobox.tsx`: add `loading?: boolean` to `ComboboxProps` (:122-131) and `MultiComboboxProps` (:185-199). In both triggers, when loading:
  - render an inline spinner SVG (`animate-spin`, same hand-rolled-icon pattern as :18-61, no new dep) in place of `ChevronDownIcon` (:165 single / :292 multi);
  - set `aria-busy="true"` and make the trigger non-interactive (`pointer-events-none`);
  - do **not** apply the disabled `opacity-50` dim; use a lighter treatment (e.g. `opacity-80`) so *working* is visually distinct from *unavailable*.
- `SelectorsToolbar.tsx:94-105` (Drivers cell): `disabled={!value.session}`, `loading={driversQuery.isLoading}`, `placeholder={driversQuery.isLoading ? 'Loading drivers…' : 'Select drivers (max 3)'}`.
- Same `loading` pass on the GP (:79) and Session (:90) comboboxes - those queries are fast, but the consistency is one prop each.
- Error one-liner: when `driversQuery.isError`, placeholder becomes "Couldn't load drivers - reselect the session" (retry already capped at 1 by `HISTORICAL`, `queries.ts:31`).

### Backend follow-up (file as its own issue, do NOT block this round)

A light roster path so the combobox fills in <1 s while the full parse continues in the background:

- **Option A (preferred):** `GET /drivers` gains a fast path using a laps/telemetry-free FastF1 load (`session.load(laps=False, telemetry=False, weather=False, messages=False)` + `session.results`) behind its own tiny cache; codes + names come from the API results, no parquet parse, no contention on the heavy per-key lock. Must verify `results` populates without laps for 2023-2025.
- **Option B:** static roster index `(year, gp, session) -> [{code, name}]` generated offline from the featured parquet / HF dataset, served as JSON. Zero FastF1 in the path; costs a build step + a staleness story.
- Anti-option: the webapp's `features/dashboard/lib/drivers.ts` team-colour map knows season-level codes but **not who ran a given session** - never fake the roster from it.

---

## 3. Controls/legend block mini-redesign (M)

### Analysis

Below the chart card, `LapChartSection.tsx` stacks four loose blocks at section `gap-4` (:76): the `LapControls` row (:92-102), a standalone tip line (:104-107), the "Showing telemetry" caption (:109-128), and `CompoundLegend` with its own "TYRE COMPOUNDS" `SectionHeader` (`CompoundLegend.tsx:71`). Four different vertical rhythms, plus a second section-style header floating right under a card, produce the "un poco raro" reading in the screenshot: the block belongs to the lap chart but doesn't *look* owned by it. All four pieces are dashboard-local (grep: no usages outside `features/dashboard/`), safe to reshape.

### New layout

Everything folds into the Lap Chart `ChartCard`: **controls -> card header** (the `actions` slot already exists, `ChartCard.tsx:44-46` + :74), **status + compounds -> a new card footer strip**.

```
┌ Lap Chart ————— [⏱ Fastest laps] [👁 Outliers·0] [👁 Invalid·0] · [–] [⛶] ┐
│                                                                           │
│                          (chart, 400 px)                                  │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│ ⚡ VER Lap 23 · LEC Lap 46   · click any point to switch lap               │
│                     (Medium) VER 53 · LEC 9   (Hard) LEC 42   (Inter) 22  │
└───────────────────────────────────────────────────────────────────────────┘
```

One strip, two clusters: left = telemetry status (team-coloured codes, mono lap numbers) with the click tip demoted to a subdued suffix; right = inline compound micro-legend (pill + per-driver counts). `flex flex-wrap items-center justify-between gap-x-6 gap-y-2`; narrow screens stack the clusters naturally.

### Concrete moves

1. `components/ChartCard.tsx`: add optional `footer?: ReactNode`; render `{footer ? <div className="shrink-0 border-t border-hairline px-4 py-2.5">{footer}</div> : null}` after the body in **both** the normal card (:121-126) and the maximized overlay (:99-118) so the strip survives maximize. Hide it while collapsed (same branch as `body`, :97). Shared-primitive change; other charts can adopt later.
2. `LapChartSection.tsx`: `:77` becomes `<ChartCard title="Lap Chart" actions={<LapControls …/>} footer={footer}>`; delete the standalone blocks :92-130. `footer` renders only when `lapTimes.length > 0` (while loading, the body `Skeleton` :79 is the whole story).
3. New `components/LapChartFooter.tsx` (feature-local): left cluster = the caption content currently at :109-128 plus the ` · click any point to switch lap` suffix (replaces the whole MousePointerClick tip block :104-107); right cluster = the inline `CompoundLegend`.
4. `LapControls.tsx`: logic untouched (:64-101); it just renders inside `actions` now. If the header wraps badly under ~480 px, add `flex-wrap` to the ChartCard header row (`ChartCard.tsx:71`), nothing else.
5. `CompoundLegend.tsx`: reshape from column-per-compound (:70-103) to a single inline row - `[Pill] VER 53 · LEC 9` groups separated by `gap-x-4`; delete the `SectionHeader` (:71), the pills are self-labelling. Keep the invariant that counts come from the FULL unfiltered `lapTimes` (:5-7).

Result: one card = one unit (chart + its controls + its status); the page below returns to clean section-level rhythm (Lap Chart card, Circuit Domination card, Telemetry section). Verify with before/after full-page screenshots (dark only, parity rule).

---

## 4. 8th telemetry chart - fill the DRS gap (M)

### Analysis

The grid is `xl:grid-cols-2` (`TelemetryGrid.tsx:31`) rendering 7 cards in Streamlit order speed/delta/throttle/brake/rpm/gear/drs (:113 + `channels.ts:57-91`); DRS is a short 180 px state band (`ChannelChart.tsx:37`) sitting **alone** in the last row - the emptiest-looking corner of the page.

### The pick: Longitudinal acceleration (g)

Derived entirely from arrays already in every `lap-telemetry` response (`lib/api/telemetry.ts:23-34`): central difference over `speed` + `time`, `a[i] = ((v[i+1] - v[i-1]) / 3.6) / (t[i+1] - t[i-1]) / 9.81`, then a 3-point moving average to tame FastF1's ~4-5 Hz sampling noise.

Why this over the alternatives:

- **Real race-engineering channel.** Braking spikes (-4..-5 g) expose braking points and intensity; traction zones show corner-exit quality; lift-and-coast is directly visible. None of that is readable off the speed trace alone, so it adds information instead of rearranging it.
- **Works with 1 driver.** A speed-delta channel degenerates exactly like Delta (`ChannelChart.tsx:386-390`, "needs >= 2 drivers"), which would leave 2 of 8 slots dead in single-driver use.
- **Zero new data / zero backend.** Sector splits have no sector data in the payload; circuit-domination (`lib/api/telemetry.ts:37-42`) is x/y-indexed with no distance mapping, so a dominance strip can't honestly join the distance crosshair.
- **No duplication.** A throttle+brake "inputs" overlay only pays if it *replaces* the two existing cards (7 -> 6, the opposite of the goal).

### Plan

- `channels.ts`: extend the `key` union (:27) with `'accel'`; add helper `longitudinalAccelG(t: LapTelemetry): number[]` (central diff + 3-point smoothing; guard `dt === 0` on repeated timestamps by carrying the previous value); insert the entry after `gear`, **before** `drs`: `{ key: 'accel', title: 'Longitudinal Accel', yName: 'Long. Accel (g)', transform: longitudinalAccelG }`. Y autoranges via the shared `scale: true` (`ChannelChart.tsx:99-105`). Declared order then yields rows **[Speed · Delta] [Throttle · Brake] [RPM · Gear] [Accel · DRS]** - 8 slots, symmetric, with the two "state-ish" charts sharing the last row.
- `TelemetryGrid.tsx`: no structural change (:144-154 already maps rest-channels in declared order); update the 7-chart header comment (:1-6). CSS grid stretch already equalizes the last row's card shells; center the 180 px DRS band vertically inside its stretched card (wrap the chart in `flex h-full flex-col justify-center` when `channel.band`, around `ChannelChart.tsx:261-267`) so the short plot doesn't hug the card top.
- Test: `features/dashboard/components/accel.test.ts` beside `outliers.test.ts` - synthetic constant-accel ramp -> constant g; flat speed -> 0 g; `dt=0` guard.
- **Fallback** (decision point on real Monaco data during build): if the derivative is too noisy even smoothed, do the grid reflow instead - DRS card spans both columns (`xl:col-span-2`) as a full-width state strip under the 3x2 grid. One-line change, no new channel, still no lonely slot.

---

## 5. Drag-to-zoom on every chart (M)

### Analysis

ECharts 6.1.0 / echarts-for-react 3.0.6 (`webapp/package.json`). The 7 telemetry charts share crosshair group `'telemetry-crosshair'` via `echarts.connect` (`ChannelChart.tsx:48`, :227-230); connected charts **propagate dataZoom actions**, and x = distance on all of them, so a synced x-zoom is meaningful, not cosmetic. `LapChart` is *not* in the group (x = lap number) and gets its own independent zoom. Streamlit/Plotly's native box-zoom is the parity bar.

### Plan

- `ChannelChart.tsx` `baseOption` (:92-144), two additions every telemetry chart inherits:
  - `dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: true, moveOnMouseWheel: false }]` - drag-pan + Shift+wheel zoom. Plain wheel **must remain page scroll**: 7-8 tall charts with unconditional wheel-capture is a scroll trap. `filterMode: 'none'` keeps each chart's y range stable while panning (no rescale jitter across 8 synced charts).
  - `toolbox: { right: 8, top: 0, feature: { dataZoom: { yAxisIndex: 'none', filterMode: 'none' }, restore: {} } }` - the toolbox magnifier is the Plotly-style **box zoom** (click, drag a box, x-only via `yAxisIndex: 'none'`); `restore` is the reset. Check icon collision with the centered legend (:114-122) at 2-3 drivers; nudge `right` if needed.
- **Sync check:** zoom Speed via box-zoom -> Gear/DRS/Accel crosshair AND window follow (connect propagates `dataZoom` + `restore` through the group). The DRS band participates (same x axis).
- **Reset:** toolbox restore per chart, propagated group-wide. Known caveat: `restore` re-applies the init-time option, and both chart types rebuild options with `notMerge` on data changes (which already resets zoom on driver/filter change - acceptable: zoom is transient inspection state). If restore misfires under echarts-for-react's re-`setOption`, fall back to a small "Reset zoom" action dispatching `{ type: 'dataZoom', start: 0, end: 100 }` - the ChartCard `actions` slot from item 3 is the natural home.
- `LapChart.tsx` `buildLapChartOption` (:140-175): same `dataZoom` inside + toolbox pair, no group. Keep `zoomOnMouseWheel: 'shift'` for cross-page consistency. Box-zooming into the flat low-1:15 pack (screenshot) is the actual Streamlit-era use case.
- **Interplay with item 1:** after any pan/box drag on the lap chart, verify the zr nearest-point handler doesn't fire a phantom pick (zrender suppresses `click` after a genuine drag; if not, the delta guard from item 1's verification list covers it). Also re-verify `convertToPixel` picking under an active zoom window - it maps through the current axis scale, so picking zoomed-out (hidden) points is naturally excluded by the 20 px radius, but confirm in browser.

---

## Do-first ordering

| # | Item | Effort | Why this slot |
|---|---|---|---|
| 1 | Lap-click bug (item 1) | M | The UI literally says "Click a lap to inspect it" - a broken promise is the highest-pain defect. Everything else is polish on top of a working core loop. |
| 2 | Drivers loading affordance (item 2) | S | Smallest diff, fully independent files, big perceived-quality win. File the backend roster follow-up issue at the same time. |
| 3 | Controls fold-in (item 3) | M | Reshapes the strip whose copy item 1 touches (the tip line becomes the footer suffix) - landing 1 first avoids writing that caption twice. Also creates the ChartCard `footer`/`actions` seams item 5's reset fallback may use. |
| 4 | Drag-to-zoom (item 5) | M | Pure chart-option work; verify the click-vs-drag interplay against item 1's picker while both are fresh in-head. |
| 5 | 8th chart (item 4) | M | New feature with a data-dependent decision point (accel vs DRS-span reflow); lowest cost to cut or defer if the round runs long. |

Branching: one `feat/` branch per PR to `dev` per project flow; natural split is 1+2 (fix + quick win), 3+5 (layout + interaction), 4 (new channel). Every PR: screenshot-verify on the golden session (dark only at parity), `npm run typecheck && npm run lint && npm run test` in `webapp/`, commit explicit paths (never `-A`, Windows autocrlf gotcha).
