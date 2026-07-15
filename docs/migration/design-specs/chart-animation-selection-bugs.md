# Diagnostic spec — chart entrance animation (BUG A) + fast-selection flakiness (BUG B)

> Root-cause audit (Fable, 2026-07-15), verified against the **installed** libraries
> (echarts 6.1.0, echarts-for-react 3.0.6, zustand 5.0.14, TanStack Query 5.101.2,
> React 19.2.7). Diagnosis only — the fix is a follow-up. All paths relative to
> `src/telemetry/webapp/`. Library line numbers are from `node_modules/…`.
>
> Symptoms (observed live): **A)** selecting a driver "spawns" the line with no
> paint animation. **B)** fast driver selection is flaky — jams, sometimes
> animates, sometimes not, and sometimes a driver's line never paints (a capture
> even ended with the selector **empty** after three quick picks).

## 0. Verified library semantics (the ground the hook was built on — partly wrong)

1. **echarts-for-react mounts ASYNC with a throwaway instance.** `componentDidMount` → `renderNewEcharts()` (core.js:115-139) → `await initEchartsInstance()` (core.js:68-90): inits a **temporary** instance with no option, waits for its `'finished'` event (≥1 zrender frame later), **disposes it**, re-inits at measured size, and only THEN calls `updateEChartsOption()`, reading `this.props` **at that later moment** (core.js:183-187). So the real first `setOption` lands 1-2+ frames after the React mount commit, with whatever the props are by then.
2. **Prop diffing is deep-equal** (`fast-deep-equal`): `componentDidUpdate` only `setOption`s when `pick([option, notMerge, …])` is not deep-equal (core.js:51-54). Functions compare by reference (formatter closures make rebuilt options "different"), and adding one `animation: false` key is enough to trigger a `setOption`.
3. **`notMerge: true` recreates the model but REUSES chart views.** `echarts/lib/core/echarts.js:463-466`: notMerge → `new GlobalModel()`, but view lookup (echarts.js:1156-1167) reuses the existing view when the id matches — auto-ids are deterministic from *type + name + index*, and series are named by driver code. So a notMerge `setOption` with the same driver series is an **UPDATE render, not an entrance**.
4. **Entrance vs update in `LineView`:** fresh view (no polyline) → `createLineClipPath(…, /*hasAnimation*/ true, …)` (LineView.js:569) = the left-to-right sweep, `animationDuration: 1000` (globalDefault.js:118). Reused view → `createLineClipPath(…, false, …)` + `graphic.initProps(oldClipPath, …)` (LineView.js:584-591): the in-flight sweep clip is replaced/tweened with **UPDATE** settings — with `animation: false` in the current option this is instant → **a running sweep snaps to the full line**.
5. `resize()` also cancels entrance animations (echarts-for-react's own comment, core.js:202).
6. **Non-causes (verified):** theme registration / `theme` prop (no `animation` keys in `buildEchartsTheme`, `charts/echartsTheme.ts:80-100`); `echarts.connect` (action-sync only); `animationThreshold: 2000` (telemetry ≈700-900 pts, lap ≈80 pts — both under); the `key={theme-maximized}` (stable during selection).
7. **Correction to the earlier hypothesis:** the charts do **not** render empty first — `TelemetryGrid.tsx:50` gates each card on `hasAny` (loader until the first lap's telemetry resolves), `LapChartSection.tsx:125-137` gates on `isLoading`/`isEmpty`. The mount option already has series.

---

## 1. BUG A — why the entrance animation never visibly plays

**Root cause (definitive):** `useFirstPaintAnimation` equates *"first React render with series"* with *"first ECharts paint"*. They are different events, and the gap between them is the bug.

- `charts/useFirstPaintAnimation.ts:36-39` — `hasPaintedRef.current = true` runs in the **mount commit's effect phase**, i.e. before the browser paints a frame and (per §0.1) before the real ECharts instance even exists.
- From then on, **any re-render returns `{ ...settledOption, animation: false }`** (`useFirstPaintAnimation.ts:43`). That new `animation` key breaks deep-equal exactly once (§0.2) → one `setOption` with animation globally off.

**Lap chart — the killer re-render is guaranteed, same tick as mount:**
1. `lapTimes` resolves → `LapChart` mounts (`LapChartSection.tsx:130-136`), `selectedLapsPerDriver` still `{}`. Mount render: `animate = true`, ReactECharts starts the async temp-init.
2. Effect phase (child effects first): the hook flips `hasPaintedRef`. Then the page **auto-load effect** fires — `DashboardPage.tsx:67-74` — `setLap(driver, fastestLap)` for every (missing) driver.
3. That store write re-renders `LapChart` with a changed `selectedLaps` → option `useMemo` recomputes (`LapChart.tsx:384-401`) → hook now returns `{…stale, animation:false}` (`LapChart.tsx:406`).
4. `componentDidUpdate` `setOption`s — usually onto the **doomed temp instance** (core.js:52-53). When `'finished'` fires, the REAL instance's first-ever `setOption` reads current props: **`animation: false`** (core.js:183-187). The entrance never starts. Deterministic — this is why three "paint once" attempts failed.

**Channel charts + Delta — near-deterministic under real usage:** they mount when driver 1's telemetry resolves (`TelemetryGrid.tsx:50`); with 2-3 drivers, driver 2's `useQueries` result lands within the 1000 ms sweep (often <120 ms warm) → `signature` changes (`queries.ts:205-209`) → new `byDriver` → re-render → `hasPaintedRef` already true → output flips to `{…stale, animation:false}` → §0.3/§0.4 same-name series ⇒ view reused ⇒ update ⇒ **sweep snaps instantly**. The debounce does NOT protect: the killer `setOption` comes from the *render output changing shape* (`animation` key on the stale `settledOption`), not from `settledOption` advancing, so 120 ms never sees it. Every driver added after first paint gets `animation:false` **by design** (`ChannelChart.tsx:270-273`). The only surviving-sweep config: single driver, warm cache, zero re-renders for ~1.1 s, no resize — hence "sometimes it does animate".

**Contributing cause #2 — option identity churn makes every unrelated render a potential killer:**
- `DashboardPage.tsx:32` — `const search = fromRaw(raw)` builds a **new `drivers` array every render** (`search.ts:108-115`).
- `ChannelChart.tsx:305` is shallow `memo` → the fresh `drivers` ref defeats it every `DashboardPage` render → `useMemo` rebuilds the option (new formatter closures, `ChannelChart.tsx:72-92`) → new `option` identity.
- `store.ts:42-50` — `pruneLaps` **always** builds a fresh map even when nothing is pruned → zustand v5 notifies on `Object.is` → every selection change re-renders all subscribers once more. `handleLapClick`'s toast (`LapChartSection.tsx:80-95`) adds another. Each such render inside a sweep window is the `animation:false` transition above.

**Fix hint (not applied):** delete the `hasPaintedRef` latch; always return `{ ...settledOption, animationDurationUpdate: 0 }` (never `animation:false`). Entrances (new series views — first mount AND newly-added drivers) play `animationDuration`; reused-view updates apply instantly (duration 0); there is no animate→no-animate transition left to race. Pair with the churn fixes below.

---

## 2. BUG B — the concrete races behind flaky fast selection

**B-1. Stale-closure driver drop (the "one driver's line never paints" / ended empty)** — `Combobox.tsx:276-283` + `DashboardPage.tsx:77-90`. `MultiCombobox.handleSelect` computes `onChange([...value, next])` from the **render-captured** `value`; the popover stays open after each pick (no `setOpen(false)`), so rapid consecutive clicks are normal. Per-click round-trip: `onChange` → `handleChange` → `applySelectionPatch` (also over a render-captured `search`) → `navigate` → router state → commit → new `value`. Until that commit a second click sees the OLD array: pick LEC (`[VER]→[VER,LEC]`, navigate queued), pick NOR 80 ms later with `value` still `[VER]` → `onChange([VER,NOR])` → the second navigate **wholesale replaces** the first → **LEC dropped**. Worse when faster because each commit is delayed by the main-thread cost of the previous selection (8 option rebuilds + notMerge `setOption`s on up to 8 instances), inflating the stale window to hundreds of ms. Same stale-base shape exists in `handleChange` (two patches before one commit), so fixing only the combobox is insufficient.

**B-2. Debounce starvation → the "jam"** — `useFirstPaintAnimation.ts:30-33` + §1's churn. The settle timer resets on every `option` identity change, and every `DashboardPage`/store/query/toast render produces a new identity even with identical content. In a fast burst, renders arrive <120 ms apart for as long as the user interacts → `setSettledOption` keeps deferring and the charts keep rendering `{…STALE settledOption, animation:false}` — old lines, or missing a driver whose telemetry already arrived — until 120 ms of quiet. Perceived as "se atasca", then everything pops in with no animation.

**B-3. The remount lottery — why it *sometimes* animates** — `TelemetryGrid.tsx:50` + `queries.ts:211-243`. Hook state is per-mount. A fast toggle animates only if it transiently drove `hasAny` false (all loaded laps pruned → cards fall back to `TelemetryLoader` → charts UNMOUNT → next data render remounts fresh hooks, `animate=true`) vs charts staying mounted (locked at `animation:false`). Remove the only loaded driver then add two → remount → entrance plays; add a driver to an existing selection → never animates. Same on the lap chart via the returning-from-Comparison path (`DashboardPage.tsx:46-54`).

**B-4. Auto-load latency under the combined lap-times key** — `queries.ts:113-117` + `DashboardPage.tsx:67-74`. `useLapTimes` keys on the sorted CSV of ALL drivers. Adding driver N re-keys → `data` is `undefined` while the combined fetch runs (no `placeholderData`) → auto-load early-returns (`DashboardPage.tsx:68`) → the new driver gets NO lap (no telemetry query, no line) until the full combined response lands. Rapid add/add/add abandons each intermediate key mid-fetch (request aborted) so only the final key resolves — 2nd/3rd drivers' laps arrive in one late burst. If the final query errors (`retry: 1`) auto-load never runs; the `lapTimesFailed` banner (`DashboardPage.tsx:96-99`) only shows on `isError`/empty, not abort-limbo. Also data-dependent: `fastestLapPerDriver` skips a zero-row driver (`lib/fastestLap.ts:15-18`) → chip present, line permanently absent, no notice (`failedDrivers` only tracks drivers *with* a telemetry query, `queries.ts:229`).

**B-5. In-library mount race** — core.js:68-90. Any `componentDidUpdate` during the temp-instance window sends its `setOption` to the about-to-be-disposed instance; the real instance renders only the latest props at `'finished'` time. Self-healing for final state, but (a) delays true first paint by frames — widening A's kill window; (b) during rapid remount cycles an unmount before `'finished'` leaves a promise unresolved (harmless leak; the node can flash blank). This is why A-1 is deterministic rather than merely likely.

**Churn amplifier** — `store.ts:42-50`: `pruneLaps` unconditionally publishing a new map turns every selection change into an extra notify-all → one more debounce reset and one more killer-render candidate. A content-equal early return silences it.

---

## 3. Interactions — how A and B compound

- The debounce holds a stale option **precisely when** data races are happening: rapid selection freezes `settledOption` (B-2) while the selection/data advance, and the `animation:false` spread on that stale option (A) is what gets `setOption`-ed — old lines AND no animation at once.
- The debounce never delivers its designed guarantee: the kill transition (raw option → `+animation:false`) happens on the first re-render after mount, outside the debounced path; and the mount paint is async (§0.1), so even "one setOption" arrives with animation already off in the lap-chart case.
- B-4's staggered resolutions are the metronome of A's kills on the channel charts.
- B-1 feedback loop: A/B-2 churn → more `setOption`s + rebuilds → longer main-thread stalls → wider stale-closure window → more dropped drivers the faster you click.

---

## 4. Fix plan (spec only, ranked)

### BUG A
1. **Replace the paint-once latch with declarative config** (smallest correct fix): in `useFirstPaintAnimation.ts` delete `hasPaintedRef` + the conditional return; always return `{ ...settledOption, animationDurationUpdate: 0 }`. Entrance (new series view) animates; every update applies instantly; no animate→frozen transition to race. Side effect (arguably desired): a driver added later gets a one-time line sweep. If per-series entrances for added drivers are unwanted, add `universalTransition: false` or swap `notMerge` for `replaceMerge: ['series']` — do NOT reintroduce the ref.
2. **Kill option identity churn** so no spurious mid-sweep `setOption` fires:
   - `DashboardPage.tsx:32` — `const search = useMemo(() => fromRaw(raw), [raw])` (TanStack Router keeps `raw` stable across unrelated renders) → stable `drivers` → `ChannelChart` memo holds → debounce stops resetting.
   - Stabilize the formatter closures (`buildTooltipFormatter(year)` cached per `year`) so rebuilt options stay deep-equal.
   - `store.ts:42-50` — `pruneLaps` returns the SAME map when nothing was removed.
3. With (2) in, keep the 120 ms debounce only for true data bursts, or key its effect on a content signature instead of object identity. Optional: a `shouldSetOption` data-signature comparison at the ECharts boundary.

### BUG B
1. **Eliminate the stale selection base (B-1)** — two layers:
   - `DashboardPage.handleChange` → TanStack Router functional updater: `navigate({ search: (prev) => toRaw(applySelectionPatch(fromRaw(prev), patch)) })` so each patch composes over the committed-latest URL.
   - `MultiCombobox` → stop shipping whole arrays from a captured prop: expose `onToggle(value)` (owner reduces over current state) or keep a `valueRef` updated each render. The router-level fix alone already stops the drop; the combobox change removes the last window.
2. **Silence `pruneLaps` no-ops** (store.ts:42-50) — same as A-2c; one fewer render + killer-render source per selection change.
3. **B-4 mitigation (optional, UX)**: `placeholderData: keepPreviousData` on `useLapTimes` so the lap chart doesn't blank on re-key. (Bigger alternative: per-driver lap-times queries merged client-side — N calls vs 1; defer.)
4. **B-3** disappears once A-fix lands (animation no longer depends on mount identity).
5. **B-5**: no code owed to us; A-fix + churn fixes make the temp-instance window benign. If flashes persist, fixed sizing (`opts={{width,height}}`) skips the double-init — note only.

**Suggested order:** A-1 + A-2 (one PR — one mechanism) → B-1 + B-2 (one PR) → optional B-4.
**Re-test after A:** single driver (sweep plays and survives); add 2nd driver mid-sweep (1st unharmed, 2nd sweeps once); rapid 3-driver toggle burst (no dropped chips, no stale lines beyond 120 ms).
