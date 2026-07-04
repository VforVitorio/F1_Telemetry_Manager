# AUDIT P1 — FastAPI Web Backend (`src/telemetry/backend/`)

> **Auditor:** Fable 5 · **Date:** 2026-07-04 · **Scope:** the HTTP layer the React SPA (migration P0) will consume.
> **Out of scope:** CLI + Arcade runtime (they run the core in-process → P2b), Streamlit frontend internals (P0 run), `src/agents/` internals (UNTOUCHABLE — additive only).
> **Constraints honored:** backend stays FastAPI · LLM = OpenAI / LM Studio, never Anthropic · no code in this document — decisions, tables, rationale.
> **Inputs read:** `AUDITS_BACKLOG.md` §P1 · `MIGRATION_PLAN.md` (§2.5 A5-1..A5-7, §9) · memory `project_chat_mcp_refactor`, `project_streamlit_refactor_backlog`, `project_fastmcp_architecture` · every `.py` under `backend/` (≈7,500 lines) · submodule `pyproject.toml`, `backend/requirements.txt`, `Dockerfile`, `docker-compose.yml` · parent `pyproject.toml` (mypy scope) · frontend `services/` (consumption cross-check).

---

## 0. Executive summary

The backend is in **better shape than a typical TFG backend**: the MCP refactor genuinely removed the legacy chat routing (handlers/, router/, prompts/, extractor, `/chat/query` — all confirmed gone), the strategy router has a structured error helper, the simulation SSE service is well-documented and CLI-parity-annotated, and 45 unit tests cover the chat engine + MCP bridge.

But it has **two blockers for the SPA migration** and a cluster of P1s that should land before the typed API client (migration A5-4) is generated:

1. **The repo-root `.git` walker is broken on bare metal** (it stops at the submodule's `.git` *file*), so every parquet-backed endpoint (all of `/strategy/*`, radio corpus, lap-state) silently degrades to 503/empty for any SPA dev running the backend outside Docker. The migration flagged it (A5-6 / dossier Finding 1); this audit confirms the exact mechanism and the 5 copies of the walker.
2. **Blocking I/O runs directly on the event loop** in the chat, voice, and FastF1 telemetry routes — and the LM Studio HTTP call has **no timeout**. One in-flight chat message freezes *every* other request (including the `/chat/status` poll that exists precisely to report progress during that call, and any SSE stream). A hung LM Studio freezes the whole server forever. Tolerable for single-user Streamlit; fatal for a SPA that fires parallel TanStack queries + SSE + polling.

The rest: a **200-with-error** anti-pattern on `/chat/tool-message`, services that swallow exceptions into empty-200s, an **untyped strategy contract** (`result: Dict[str, Any]` — the typed result models exist but are never wired), **manifest drift** between `pyproject.toml` and `requirements.txt` (including the dead `openai-whisper` pin that *is* the fresh-venv build failure), a real **behavioral bug in `/voice/synthesize`** (rate defaults to 175 "wpm" but is sent to Edge-TTS as **+175 %** speed), and a tail of dead code that survived the MCP cleanup (2 legacy chat endpoints, 1 unused 279-line module, 4 dead Pydantic models, dead auth dependencies).

Everything is fixable in **7 phases of small, single-concern PRs** (§5). Phases 1–3 should land **before or during migration W0–W2**; the rest can trail.

---

## 1. API surface inventory & target spec (the A5-4 deliverable)

38 REST routes + 1 SSE-only + the `/mcp` mount. Verdict column = what the frozen v1 contract should do with each.

### 1.1 Telemetry — `/api/v1/telemetry` (router: `api/v1/endpoints/telemetry.py`)

| Method/Path | Params | Response shape | Consumer | Async? | Verdict |
|---|---|---|---|---|---|
| GET `/data` | year, gp, session, drivers (CSV) | `{year, gp, session, drivers, laps[]}` | frontend dashboard | `async` + blocking FastF1 | **Keep, fix blocking**; validate `session` |
| GET `/gps` | year | `{gps[]}` | selectors | `async` + blocking | Keep, fix blocking |
| GET `/sessions` | year, gp | `{sessions[]}` | selectors | `async` + blocking (7 sequential `get_session` probes) | Keep, fix blocking + probe loop |
| GET `/drivers` | year, gp, session | `{drivers[{code,name}]}` | selectors | `async` + blocking | Keep, fix blocking |
| GET `/lap-times` | year, gp, session, drivers | `{lap_times[]}` | charts + MCP Phase 2 (`get_lap_times`) | `async` + blocking (worst: per-lap `get_car_data()` verification) | Keep, fix blocking + perf (F-20) |
| GET `/lap-telemetry` | year, gp, session, driver, lap_number | trace dict | charts + MCP (`get_telemetry`) | `async` + blocking | Keep, fix blocking |
| GET `/race-data` | year, gp, driver? | `{race_data[], count}` | race analysis + MCP (`get_race_data`) | `def` ✔ | Keep (already threadpooled) |

### 1.2 Comparison & circuit — (`comparison.py`, `circuit_domination.py`)

| Method/Path | Params | Consumer | Async? | Verdict |
|---|---|---|---|---|
| GET `/comparison/compare` | year, gp, session, driver1, driver2 | comparison page + MCP (`compare_drivers`) | `async` + `session.load()` (can be minutes cold) | Keep, fix blocking |
| GET `/circuit-domination` | year, gp, session, drivers (validated ✔) | dashboard | `async` + `session.load()` | Keep, fix blocking. Its Query validation (ge/le/pattern) is the model the other routers should copy |

### 1.3 Chat — `/api/v1/chat` (`chat.py`)

| Method/Path | Consumer today | Verdict |
|---|---|---|
| GET `/health` | frontend | Keep; **unify health semantics** (raises 500 on error, while `/voice/health` returns 200+`status:"unhealthy"` — pick the voice style) |
| GET `/models` | model picker | Keep |
| POST `/message` | **nobody** (only a dead frontend function references it) | **Deprecate → remove** (F-13) |
| POST `/stream` | **nobody** | **Deprecate → remove** (F-13) |
| GET `/status` | Streamlit spinner poll | Keep during strangler window; **mark deprecated post-migration** — the SSE `stage` events carry the same signal (A5-2 client consumes them directly) |
| POST `/tool-message` | report generation | Keep; **fix 200-with-error** (F-11) |
| POST `/tool-message-stream` | the chat (SSE) | Keep — this is the flagship route; document the event grammar (`stage` / `tool_result` / `token` / `done`) as part of the frozen contract |

### 1.4 Voice — `/api/v1/voice` (`voice.py`)

| Method/Path | Verdict |
|---|---|
| POST `/transcribe` | Keep; run Whisper off-loop; enforce `MAX_AUDIO_SIZE` (declared in `voice_config.py:24` but never checked) |
| POST `/synthesize` | Keep; **fix the rate-unit bug** (F-12) |
| POST `/voice-chat` | Keep; off-loop STT + LLM |
| GET `/health` | Keep (its degrade-not-500 semantics become the standard) |
| GET `/voices` | Keep |

### 1.5 Strategy — `/api/v1/strategy` (`strategy.py`, 15 routes)

| Method/Path | Notes | Verdict |
|---|---|---|
| GET `/available-gps`, `/available-drivers`, `/lap-range` | parquet selectors; return empty/`{1,1}` fallbacks when parquet missing | Keep; **replace silent fallbacks with 503/404** (F-16) |
| GET `/lap-state` | builds the canonical `lap_state`; correct 503/404s ✔ | Keep; extract builder to a service (F-24) |
| POST `/pace` `/tire` `/situation` `/pit` `/radio` `/rag` `/recommend` | sync `def` ✔, structured `_agent_error` ✔, lazy agent imports | Keep; wire the **already-written but unused** typed result models (F-14); fix hidden `year` query param (F-15) |
| POST `/pace-range` | sequential per-lap agent calls — the 45–60 s Model Lab wait (migration P4-9) | Keep; batch/cache later (F-21) |
| GET `/radio-available-gps` `/radio-laps` `/radio-transcript` | per-request parquet + JSON reads | Keep; cheap caching later |
| POST `/simulate` | SSE; validation happens *inside* the stream → setup errors arrive as 200 + error frame | Keep; pre-validate before streaming (F-18); unify SSE framing (F-19) |

### 1.6 Contract-freeze actions (the spec itself)

- **A. `operation_id` everywhere.** Only 4 routes have one today (`compare_drivers`, `get_lap_times`, `get_telemetry`, `get_race_data` — set for MCP Phase 2). `openapi-typescript` (A5-4) derives function names from operationIds; without them the generated client is `getApiV1StrategyLapState`-style noise. One PR, pure metadata, zero behavior change.
- **B. `response_model` on every route.** Telemetry/strategy-selector routes return raw dicts today — the generated TS types will be `Record<string, unknown>`. The strategy POST routes have models *defined* (see F-14) but return the untyped envelope.
- **C. Remove the two dead chat endpoints first** so they never enter the generated client.
- **D. Document the two SSE grammars** (chat: named `event:` frames; simulate: `data:`-only with inner `type`) — or better, unify (F-19) before the `RaceFeed` transport client (A5-2) is written against them.
- **E. Version discipline:** everything already lives under `/api/v1` ✔. Breaking response-shape changes from this audit (error envelope, silent-fallback removal) should land **before** the SPA's typed layer is generated, so they're v1, not v2.

---

## 2. Findings — scored P0 (blocker) → P3 (nice)

### P0 — blockers

| ID | Finding | Evidence | Impact | Decision |
|---|---|---|---|---|
| **F-1** | **Repo-root walker stops at the submodule's `.git` *file* → all parquet/radio/data paths wrong on bare metal.** The walker pattern `while not (root/".git").exists()` treats the gitlink *file* at `src/telemetry/.git` as the repo root, so `data/processed/laps_featured_*.parquet` resolves to `src/telemetry/data/...` (doesn't exist). Docker survives only because the image has no `.git` at all → `/app` fallback + compose mounts. **5 copies of the walker:** `utils/laps_cache.py:11-16`, `api/v1/endpoints/strategy.py:27-34`, `mcp_tools.py:28-35`, `core/config.py:8-11`, `services/simulation/simulator.py:38-45`. The simulator *works around it* (docstring at `simulator.py:219-222` names the bug explicitly) by preferring `src.f1_strat_manager.data_cache.get_data_root()` — and keeps **its own second parquet cache** (`simulator.py:213`) because the shared one resolves wrong. Compose already exports `F1_STRAT_DATA_ROOT=/app/data` but `laps_cache`/`strategy.py` **never read it**. | = dossier Finding 1 / migration A5-6. Every SPA dev running the backend bare-metal (the normal Vite dev loop) gets 503/empty from all 15 strategy routes + radio corpus. | One shared `resolve_repo_root()`/`get_data_root()` util (honor `F1_STRAT_DATA_ROOT` → walk for a `.git` **directory** → `/app` fallback), adopted by all 5 sites; delete the simulator's private cache; **additive** — no agent internals touched. Effort **M**. |
| **F-2** | **Blocking I/O on the event loop + unbounded LM Studio calls.** (a) `llm_service.py:40` — `DEFAULT_TIMEOUT = 60 if _is_openai else None`: LM Studio requests have **no timeout**. (b) `chat_engine.py:22-24` admits it: the sync `requests` LLM calls run *inside* the async generator on the loop (`_safe_send` → `send_message`). (c) `build_messages` can trigger a **hidden second blocking LLM call** (`_compress_chat_history`, `llm_service.py:331-389`) when history >10 messages. (d) Voice: `voice.py:275` runs Whisper GPU inference and `voice.py:293` the LLM call inside `async def voice_chat`; first `/transcribe` also loads the Whisper model in-request. (e) All FastF1 routes (`telemetry.py`, `comparison.py:91-92`, `circuit_domination.py`) are `async def` wrapping seconds-to-minutes of blocking `session.load()` / per-lap `get_car_data()`. | While any of these runs, the loop is frozen: SSE streams stall, `/chat/status` (polled every 1 s *for that very request*) can't answer, and every parallel SPA query queues. A hung LM Studio = permanently hung server (no timeout). | Three cheap, targeted fixes, no framework change: (1) give LM Studio calls a generous configurable timeout (~120 s); (2) run every LLM/STT call via a worker thread (or switch `llm_service` to an async HTTP client — bigger, optional); (3) **flip the FastF1 routes from `async def` to `def`** — FastAPI then runs them in the threadpool, exactly like `/race-data` and all strategy POSTs already do. Effort **M**. |

### P1 — must land before/with the SPA typed client

| ID | Finding | Evidence | Decision |
|---|---|---|---|
| **F-11** | **Error contract is inconsistent across routers; worst case is 200-with-error.** `POST /chat/tool-message` catches *all* exceptions and returns HTTP 200 with `response="Error contacting the LLM: …"` (`chat.py:272-274`). `get_lap_times` swallows every exception → 200 + `[]` (`services/telemetry/telemetry_service.py:274-278`); `get_lap_telemetry` → `{}`. `/strategy/lap-range` returns `{min_lap:1,max_lap:1}` when the driver/GP doesn't exist (`strategy.py:260-264`). Meanwhile strategy POSTs return a *good* structured `{error, agent, detail}` (`strategy.py:204-221`), comparison maps ValueError→404, and the two health endpoints disagree (chat 500s, voice 200-degrades). | The SPA cannot distinguish "no data" from "backend broke", and TanStack Query error states never fire on the 200-with-error paths. **Decision:** one error envelope for the whole API (extend the strategy router's shape: `{error: {code, message, agent?, hint?}}` via app-level exception handlers), correct status codes (422 validation / 404 not-found / 503 dependency-down / 500 bug), remove all silent-empty fallbacks, standardize health on the voice style (200 + status field). Effort **M** — but coordinate with the SPA typed layer, it is a breaking shape change (do it at W0, see §5). |
| **F-12** | **`/voice/synthesize` rate-unit bug.** `TTSRequest.rate` defaults to **175** documented as "words per minute" (`models/voice_models.py:33-38`), but `tts_service._format_rate` converts the integer to an Edge-TTS **percentage** string → default requests synthesize at **+175 % speed** (`tts_service.py:29-39`). `/voice-chat` is unaffected (passes `None` → `+0%`). | Fix the contract to a signed percent (or map wpm→percent); align model docs, bounds (`ge=50,le=400` is a wpm range, nonsense for percent), and frontend callers. Effort **S**. |
| **F-13** | **Dead/deprecated code — the cleanup the backlog asked to confirm.** ✔ *Confirmed removed:* `services/chatbot/handlers/`, `router/`, `prompts/`, `utils/query_classifier.py`, `utils/tool_param_extractor.py`, `utils/validators.py`, `/chat/query`, `test_query_router.py` (memory `project_chat_mcp_refactor` "Continuación" — verified against the tree; `utils/__init__.py` is an empty stub). ✘ *Still present:* (a) endpoints `POST /chat/message` + `POST /chat/stream` — **no live frontend caller** (pages import only `get_chat_status`, `check_lm_studio_health`, `generate_report`, `stream_tool_message`; the frontend functions wrapping `/message` + `/stream` are themselves dead); (b) the **stale default system prompt** in `build_messages` (`llm_service.py:421-466`) still describes the *retired* extractor architecture ("You do NOT call tools yourself. The backend extracts intent…") — only the dead endpoints use it; (c) `services/voice/audio_processor.py` — **279 lines, zero imports anywhere**; (d) dead models: `QueryResponse`, `ChatMessage` (`chat_models.py:11-14, 43-48`), `ToolCall` + `ToolCallParams` (extraction-era, `tool_schemas.py:77-124`) — no usages outside their modules; (e) dev scripts inside the package: `backend/test_voice_api.py` (233 ln), `backend/verify_dependencies.py` (100 ln); (f) dead deps in `requirements.txt`: `python-jose`, `passlib`, `bcrypt`, `realtime` (the auth module they served is gone — only a stale `auth.cpython-310.pyc` remains in `__pycache__`); (g) `fastf1_client.py` print-style notebook methods `show_driver_lap_times` / `compare_drivers` (unused). | One "dead code sweep" PR-cluster; each item S. Delete the two endpoints **before** OpenAPI type generation. |
| **F-14** | **Typed strategy results exist but are never used.** `PaceResult`, `TireResult`, `SituationResult`, `PitResult`, `RadioResult`, `RagResult` are fully defined (`strategy.py:123-190`) yet every route responds `StrategyResponse{agent, result: Dict[str, Any]}` (`strategy.py:192-196`). | The single highest-leverage typing fix for A5-4: parameterize the envelope (or per-route response models) so the generated TS knows the fields of each agent's output. Effort **S–M** (models already written; verify against real agent dataclass fields). |
| **F-15** | **Hidden `year` query parameter on strategy POSTs, divergent from the body.** `Depends(_require_laps_df)` exposes the dependency's `year: int = 2025` as a **query param** on `/tire`, `/situation`, `/pit`, `/radio`, `/recommend` — while the `lap_state` body carries its own `session_meta.year`. A 2024 `lap_state` with the default query year silently scores against the 2025 parquet. | Derive the parquet year from `lap_state.session_meta.year` inside the route (or an explicit body field); remove the dependency-leaked query param from the contract. Effort **S**. |
| **F-16** | **Packaging/manifest drift (dossier Findings 2+3, migration E11) — backend side confirmed.** (a) Submodule `pyproject.toml` still pins **`openai-whisper==20231117`** — the fresh-venv build failure — while **no code imports `whisper`** (STT is `transformers.pipeline`, `stt_service.py:52-59`): it's a *dead dependency that is also the build blocker* → delete, don't fix. (b) `fastmcp==3.2.0` lives only in `requirements.txt`, missing from `pyproject.toml`. (c) Version pins disagree (fastapi `0.109.0` vs `>=0.115.0`; pydantic `2.5.0` vs `>=2.7.4`), and the submodule pyproject mixes frontend deps (`streamlit`, `plotly`, `kaleido`, `hydralit`) with backend ones — the migration's cutover (deleting the Streamlit tree) is the natural moment to split, but the *whisper deletion and fastmcp addition should not wait*. | File the three backend issues the migration plan §9 asks for; land (a)+(b) now (**S**), full manifest unification at cutover (**M**, = E11). |
| **F-17** | **mypy scope: the backend is 100 % untyped-checked.** Parent `pyproject.toml:197-203` excludes `src/telemetry/` wholesale; CI's `typecheck` job runs `mypy src/rag/` only. The backend is exactly the code a typed TS client will be generated from. | Phased adoption (see §5 Phase 6): start with `backend/models/` + `backend/utils/` + `services/chatbot/` (pure, already tested), then endpoints. Config lives in the **submodule** (own `[tool.mypy]`), a new CI job in the submodule repo (tied to issue #25's CI). Effort **M** overall, S per tranche. |

### P2 — should fix, schedulable

| ID | Finding | Evidence | Decision |
|---|---|---|---|
| **F-18** | `/strategy/simulate` builds `SimConfig` and loads the parquet **inside** the stream generator → bad GP/driver/missing parquet arrive as HTTP 200 + `error` frame (`strategy.py:913-926`, `simulator.py:737-741`). | Pre-validate (parquet exists, race dir exists, driver in GP) *before* returning the `StreamingResponse`; only per-lap failures belong in-stream. **S** |
| **F-19** | **Two SSE dialects.** Chat streams named `event:` frames (`chat.py:329-337`); simulate streams `data:`-only with an inner `type` (`strategy.py:917-918`); heartbeats differ (chat: none; simulate: every 15 *laps* — a slow LLM lap can exceed proxy idle timeouts anyway). | Unify on one framing (named events + time-based heartbeat comment every ~15 s) so the A5-2 `RaceFeed` client has one parser. Coordinate with the SPA sprint that builds the SSE client. **M** |
| **F-20** | **`get_lap_times` per-lap telemetry verification.** For *every* candidate lap it calls `lap.get_car_data()` just to check column completeness (`services/telemetry/telemetry_service.py:200-241`) — the dominant cost of `/telemetry/lap-times`, minutes on cold cache, and it runs on the event loop today (F-2). | Verify lazily (only laps actually plotted), or trust FastF1's `IsAccurate` + spot-check one lap per driver. **M** |
| **F-21** | **No in-process FastF1 session cache.** Each request re-runs `fastf1.get_session().load()` (comparison, circuit-domination, every SessionData construction). Disk cache helps network, not the seconds of parse. `/pace-range` runs the pace agent strictly sequentially per lap (`strategy.py:448-480`) — the 45–60 s Model Lab wait (migration P4-9 calls the backend latency "legitimate"; it is, but it's improvable *here*, out of the SPA's scope). | Small LRU keyed `(year, gp, session)` (maxsize ~4, sessions are ~100 MB) + batch/vectorize pace-range or cache per `(gp, driver, range)`. **M** |
| **F-22** | **Docker/runtime hygiene.** (a) `Dockerfile` CMD and compose both run uvicorn with `--reload` — a dev file-watcher in the "prod" container. (b) FastF1's cache is pinned to `<repo>/cache` → `/app/cache` in-container (`services/telemetry_service.py:27-29`), which is **not** the `backend_cache` volume (`/root/.cache`) → FastF1 cache dies on container recreation while the volume persists only HF models. (c) `logging.basicConfig` at import in a service module (`telemetry_service.py:23`) hijacks root logging config. | Drop `--reload` from the image (keep in a compose override), point FastF1 cache at a volume-backed path, move logging config to app startup. **S** |
| **F-23** | **Cross-request mutable state.** (a) `POST /strategy/simulate` sets `os.environ["F1_LLM_PROVIDER"]` per request (`simulator.py:185-194`) — two concurrent sims with different providers race, and the env leak also flips the provider for *chat* requests. (b) `tts.set_voice()` mutates the TTS singleton per request (`voice.py:325-327`) — one user's voice choice changes another's. | (a) pass provider explicitly to the orchestrator entry point if the (additive) signature allows; otherwise document single-sim-at-a-time and reject concurrent sims with 409. (b) pass voice per-call instead of mutating the singleton. **S–M** |
| **F-24** | **Layering: MCP tools import route handlers.** `mcp_tools.py` calls `get_lap_state`, `available_gps`, `lap_range` *from the endpoints module* (`mcp_tools.py:253-259, 422-448`) — endpoint raises `HTTPException` inside an MCP tool context; business logic lives in the HTTP layer. Phase-2 MCP tools additionally call the API **over loopback HTTP** with a hardcoded `http://localhost:8000` (`mcp_tools.py:533, 593`) — breaks on any port change and adds a self-roundtrip. | Extract the lap-state builder + selector queries into a service module both REST and MCP import (additive); make the loopback base URL configurable; longer-term consider in-process dispatch for Phase 2 tools. **M** |
| **F-25** | **Two `telemetry_service.py` modules, overlapping names, split styles.** Flat `services/telemetry_service.py` (680 ln, logging, comparison+domination) vs package `services/telemetry/telemetry_service.py` (444 ln, `print()`-based, selectors+lap-times) + `fastf1_client.py`. Near-duplicate telemetry-extraction blocks also live inside the flat module (`fetch_lap_telemetry` vs `extract_telemetry_from_lap`, `telemetry_service.py:424-471` vs `631-676`). | Merge into one `services/telemetry/` package with clear modules (sessions, laps, comparison, domination); replace `print()` with logging; dedupe extraction. **M** |
| **F-26** | **Voice service gaps.** `MAX_AUDIO_SIZE` / `MAX_AUDIO_DURATION` declared but unenforced (`voice_config.py:23-24`, `voice.py:98-122` checks extension only; `audio.file.read()` slurps unbounded uploads into RAM). `WHISPER_DEVICE = 0` hardcoded CUDA index (`voice_config.py:12`) — CPU-only dev machines crash STT init → 503 with no env override. | Enforce size cap at upload; make device env-configurable with CPU fallback. **S** |
| **F-27** | **Chat-history compression is a hidden latency cliff.** >10 history messages triggers a synchronous extra LLM round-trip inside `build_messages` (`llm_service.py:499-524`) on every message thereafter — invisible to the stage tracker (happens before `model_choosing_tool` completes). | Post-migration the SPA owns history (A5-1, localStorage); decide: move compression client-side / cache the summary per conversation / at minimum surface a `compressing_history` stage and run it off-loop (covered by F-2 fix). **S–M** |

### P3 — nice to have

| ID | Finding | Decision |
|---|---|---|
| **F-31** | Response envelope inconsistency: `{gps:[]}` vs `{drivers:[…]}` vs raw dicts vs `StrategyResponse` — key names and wrapper styles vary per router. | Normalize during the F-14/contract-freeze pass; don't churn otherwise. |
| **F-32** | Hardcoded GP-alias table + driver codes/surnames for 2023-25 grids in `mcp_tools.py:62-176` — collides with the house rule "consult `data/` before hardcoding mappings" and will silently rot for 2026. Substring alias matching (`mcp_tools.py:150-152`) is longest-first-defended but fragile. | Derive driver codes from the parquet at startup; keep the alias map but load from a data file; add a "2026 grids" reminder to the P5 audit. |
| **F-33** | Style: `import json as _json` re-imported inside functions (`telemetry.py:276`, `strategy.py:773, 829`); local `HTTPException` re-import (`strategy.py:283`); regex import inside `_strip_leaked_tool_call` (`chat_engine.py:378`); `api/`, `api/v1/` lack `__init__.py` (implicit namespace pkgs — works, but surprising with `explicit_package_bases`). | Fold into the dead-code sweep PR. |
| **F-34** | Provider-mismatch messages: `llm_service.send_message` error strings say "LM Studio" even when `F1_LLM_PROVIDER=openai` (`llm_service.py:231-249`); LM Studio port 1234 not env-configurable (host is). | Parameterize the provider name in messages; add `LM_STUDIO_PORT`. |
| **F-35** | `OFFICIAL_TRACK_LENGTHS` keyed by country names while the rest of the API prefers city/circuit names — silent fallback to calculated length on mismatch (`telemetry_service.py:33-58, 112-115`). | Key by canonical GP name (reuse the F-32 alias source). |
| **F-36** | No aggregate `/healthz`: SPA boot has to probe `/chat/health` + `/voice/health` + parquet availability separately. | Optional: one composite health route feeding the SPA's boot/warmup ping (migration P4-10). |
| **F-37** | Curated Edge-TTS voice list + `AvailableVoicesResponse.voices: list` untyped (`tts_service.py:150-184`, `voice_models.py:133`). | Type the item model when touching voice for F-12. |
| **F-38** | Stage tracker is in-process memory — fine single-worker, breaks under multi-worker uvicorn. | Document the single-worker assumption in the Dockerfile/compose; no code change needed for the local-only posture. |

---

## 3. Cross-reference: the 3 packaging findings the migration flagged (A5-6 / §9)

| Dossier finding | Backend reality (this audit) | Owner fix |
|---|---|---|
| **1. Repo-root walker breaks bare-metal data paths** | Confirmed, mechanism identified (submodule `.git` **file** satisfies `exists()`), **5 walker copies**, compose's `F1_STRAT_DATA_ROOT` ignored by 4 of them, simulator carries a private workaround + duplicate cache. | **F-1** (P0) — Phase 1. |
| **2. `openai-whisper` build failure on fresh venv** | The pin is a **dead dependency**: no `import whisper` anywhere; STT uses `transformers.pipeline("automatic-speech-recognition")`. Deleting the pin *is* the fix; requirements.txt already ships with it commented out. | **F-16(a)** (P1) — Phase 1. |
| **3. `fastmcp` missing from `pyproject.toml` (manifest drift)** | Confirmed; plus fastapi/pydantic pin disagreements and frontend deps mixed into the backend manifest; full unification = migration E11 at Streamlit cutover. | **F-16(b,c)** (P1) — add fastmcp now, unify at cutover. |

---

## 4. Async/blocking inventory (reference table for the F-2 PR)

| Route(s) | Declared | Blocking work on the loop | Fix |
|---|---|---|---|
| `/chat/tool-message`, `/tool-message-stream` | `async` | `requests` LLM calls (×2 per tool turn; no LM Studio timeout); possible hidden compression call | to-thread (or async client) + timeout |
| `/chat/message`, `/chat/stream` | `async` | same | **delete instead** (F-13) |
| `/voice/voice-chat`, `/transcribe` | `async` | Whisper inference; first-call model load; LLM call | to-thread; optional lifespan warmup flag |
| `/voice/synthesize` | `async` | none — already awaits Edge-TTS ✔ | — |
| `/telemetry/*` (6 routes), `/comparison/compare`, `/circuit-domination` | `async` | FastF1 `session.load()`, per-lap `get_car_data()` | flip to `def` (threadpool) |
| `/telemetry/race-data`, all `/strategy/*` | `def` ✔ | heavy but threadpooled correctly | — (pattern to copy) |
| `/strategy/simulate` | `def` + sync generator | occupies one threadpool thread for the whole run; no cancellation of the in-flight lap on disconnect | acceptable for local posture; document; pre-validate (F-18) |

---

## 5. Phased improvement plan (chunkable → issues/PRs, sized S/M/L)

Ordering rationale: Phase 1 unblocks SPA developers (bare-metal backend), Phase 2 freezes the contract the typed client is generated from (migration W0), Phase 3 makes the server survive SPA concurrency (before W2-W3 feature sprints), then quality trails. Each bullet ≈ one issue; group per phase into a milestone. All work is **additive or backend-local**; nothing touches `src/agents/` internals, the CLI, or notebooks.

### Phase 1 — Paths & packaging (unblock devs) — **target: before migration W2**
1. **[M] F-1** Shared data-root resolver honoring `F1_STRAT_DATA_ROOT` → `.git`-*directory* walk → `/app`; adopt in `laps_cache`, `strategy.py`, `mcp_tools.py`, `core/config.py`; delete the simulator's private cache/workaround.
2. **[S] F-16a+b** Submodule manifests: delete `openai-whisper` pin; add `fastmcp`; note the E11 full unification for cutover.
3. **[S] F-22** Dockerfile/compose: drop `--reload` from the image; FastF1 cache onto a volume-backed path; logging config at startup.

### Phase 2 — Contract freeze (feeds A5-4 typed client) — **target: migration W0**
4. **[S] F-13(a)** Remove `POST /chat/message` + `/chat/stream` (+ dead frontend wrappers, stale default system prompt in `build_messages`).
5. **[S] §1.6A** `operation_id` on all ~36 surviving routes.
6. **[S–M] F-14 + §1.6B** Wire the existing typed strategy result models; add `response_model` to the untyped GET routes.
7. **[S] F-15** Kill the dependency-leaked `year` query param; year comes from `lap_state`.
8. **[M] F-11** Unified error envelope + exception handlers; fix 200-with-error on `/tool-message`; remove silent-empty fallbacks (`lap-range`, `get_lap_times`, `available-gps`); standardize health semantics. *(Breaking — must precede TS generation.)*
9. **[S]** Publish the frozen surface: the §1 table + SSE event grammar committed as `docs/api-contract.md` in the submodule.

### Phase 3 — Event-loop correctness — **target: before SPA feature sprints (W2-W3)**
10. **[S] F-2(a)** LM Studio timeout (configurable, ~120 s default).
11. **[M] F-2(b,c)** LLM + compression calls off-loop (worker thread now; async client as a later refactor if wanted).
12. **[S] F-2(e)** Flip the 8 FastF1 `async def` routes to `def`.
13. **[S] F-2(d)** Voice STT off-loop + optional warmup at lifespan (pairs with migration P4-10's boot ping; F-36 composite health optional here).

### Phase 4 — Behavior & validation fixes
14. **[S] F-12** `/voice/synthesize` rate-unit fix (+ model bounds + frontend caller).
15. **[S] F-26** Enforce `MAX_AUDIO_SIZE`; env-configurable Whisper device with CPU fallback.
16. **[S] F-18** Pre-validate `/strategy/simulate` inputs before streaming.
17. **[S–M] F-23** Provider env race (explicit provider pass or 409 on concurrent sims); per-call TTS voice.
18. **[M] F-19** Unify SSE framing + time-based heartbeats (coordinate with the SPA's `RaceFeed`/SSE-client sprint).

### Phase 5 — Dead-code sweep (one small PR-cluster)
19. **[S] F-13(c–g)** Delete `audio_processor.py`, dead models (`QueryResponse`, `ChatMessage`, `ToolCall`, `ToolCallParams`), auth-era deps (`python-jose`, `passlib`, `bcrypt`, `realtime`), notebook-era `fastf1_client` methods; relocate `test_voice_api.py` → `tests/` (or scripts) and `verify_dependencies.py` → scripts; F-33 style nits.

### Phase 6 — Typing & tests
20. **[S] F-17-t1** Submodule `[tool.mypy]`; check `backend/models` + `backend/utils` + `services/chatbot`.
21. **[S] F-17-t2** Extend to `api/v1/endpoints` (post F-14 the payoff is real).
22. **[M]** Contract tests: FastAPI `TestClient` smoke per router (status codes, error envelope, one happy path each) — today only chat_engine/mcp_bridge have tests (45); the other 30+ routes have zero. Wire into the submodule CI (issue #25).

### Phase 7 — Performance & structure (post-migration comfort)
23. **[M] F-21** FastF1 session LRU; **[M] F-20** lap-times verification rework; **[M] F-21b** pace-range batching (revisits migration P4-9's "legitimate" 45–60 s).
24. **[M] F-25** Merge the two telemetry services; dedupe extraction helpers.
25. **[M] F-24** Lap-state builder → service layer; configurable MCP loopback base URL.
26. **[S–M] F-27** History-compression strategy decision once SPA owns chat history.
27. **[S] F-32/F-35** Data-driven driver/GP mappings (feeds the 2026-reg P5 audit).

**Suggested sprint cut (issue-first per house rules):** Sprint B1 = Phases 1+2 (epic "Backend contract & paths for SPA"), Sprint B2 = Phase 3+4 (epic "Backend concurrency & correctness"), Sprint B3 = Phases 5+6, Sprint B4 = Phase 7. Phases 1–2 are the only hard dependency of the frontend migration; announce their completion to the migration run so type generation starts from the frozen surface.

---

## 6. Risk register & explicit non-goals

- **The simulator's CLI duplication is intentional** (`simulator.py` docstring lines 1-17 + `guard_rails.py` header) with pair-commit breadcrumbs to `run_simulation_cli.py` line ranges. Do **not** "fix" it by refactoring the CLI (UNTOUCHABLE) — the P4 audit owns a duplicate-and-improve plan; any guard-rail change must be mirrored by hand until then.
- **No framework moves.** Everything above is achievable inside FastAPI + FastMCP as deployed; the async fixes deliberately prefer `def`/threadpool + timeouts over an async-client rewrite to keep diffs small.
- **LLM provider constraint holds everywhere**: `llm_service` routes only to LM Studio/OpenAI (`F1_LLM_PROVIDER`), `/simulate` validates `^(lmstudio|openai)$`. No change introduces another provider.
- **Breaking changes are concentrated** in Phase 2 items 6–8 and Phase 4 item 14; they must land **before** the SPA's generated types (or be re-generated after). Everything else is behavior-preserving.
- **Single-user/local posture** is assumed throughout (no auth, in-memory stage tracker, single worker). This audit does not propose auth, rate limiting, or horizontal scaling — out of scope for the product's local-first design; revisit only if the deployment story changes.
