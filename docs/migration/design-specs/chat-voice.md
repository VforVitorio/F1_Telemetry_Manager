# AI Chat + Voice — Design-First Spec (issues #39 + #40)

> Design-first blueprint (Fable, 2026-07-14). Take the Streamlit AI Chat + Voice functionality and build the elevated migrated interface, NOT a port. Inherits the Dashboard grammar (URL=selectors, Zustand=UI, TanStack Query=data, ECharts+F1_THEME, design-system primitives) and the shared vocabulary from `strategy.md`/`model-lab.md` (`ActionBadge`, `CompoundPill`, `ConfidenceDial`, `NlpMessageCard`, state tiers, deep-links-never-auto-fire). Sources: `frontend/pages/chat.py` (532), `frontend/components/chatbot/*` (~1.5k), `frontend/components/voice/*` + `streamlit_audio_viz` (React+ogl orb), `frontend/services/{chat_service,voice_api}.py`, `frontend/utils/{chat_state,chat_navigation,report_storage}.py`, `backend/api/v1/endpoints/{chat,voice}.py`, `backend/services/chatbot/chat_engine.py`, `backend/models/tool_schemas.py`, MIGRATION_PLAN §6.6/§6.7/§6.8/E4/E5/E8/W7/W8, `st_6_AI_Chat.png`.

## 1. Purpose & the job

Chat is the **conversational front door to the entire model family**: an analyst that CALLS the real tools. The backend chat engine is an MCP client exposing 14 tools (6 predictors + orchestrator + RAG regulations + FastF1 telemetry/lap-times/compare/race-data + listings) to the LLM via OpenAI `tools=`; the SPA speaks **REST/SSE only** and never touches MCP. Its job: *"Ask anything about a race moment in plain language, watch the system pick and run the right instrument, and get the evidence (metrics, strategy cards, INLINE charts) plus a plain-English read - then take the whole session home as a Markdown report."* Voice is the same analyst hands-free, fronted by the audio-reactive orb - the demo's emotional signature. This surface is the TFG agent work made tangible; it must feel like a serious Claude/ChatGPT-class client, not a widget.

**FIVE KEY DISCOVERIES in the Streamlit source** that drive this design:
1. **Stop is cosmetic today.** The Stop button only sets `chat_should_stop`, checked *between* SSE events (`chat.py:337-339`); the HTTP stream and the LLM keep running server-side. The SPA's `postStream` + AbortController + `reader.cancel()` (`sse.ts:54-57`) actually tears the connection down - a real Stop, free.
2. **The status-poller thread is a Streamlit workaround.** A daemon thread polls `GET /chat/status` every 1 s to relabel the spinner (`chat.py:99-128`) because Streamlit can't consume the `stage` SSE events mid-rerun. The stream already carries them (`chat_engine.py:158-314`) - the SPA renders stages inline and drops the poller AND the endpoint dependency.
3. **"Rename" doesn't exist, and saved chats collide.** §6.6 lists "saved-chat list + rename"; `chat_sidebar.py` has no rename UI, and chats are keyed by an auto-generated *name* (first 30 chars of message 1, `chat_state.py:159-197`) - two chats opening with the same words silently overwrite each other. The SPA stores id-keyed records with a `title` field + real inline rename: satisfies the parity row AND fixes the collision bug.
4. **The voice loop is tool-less.** `POST /voice-chat` goes straight to the LLM (`voice.py:257-345`, no MCP dispatch): "tyre status for VER lap 30" *typed* runs the TCN; *spoken*, it gets improvised prose. The three building blocks (`/transcribe`, `/tool-message-stream`, `/synthesize`) already exist - the SPA can compose a tool-aware voice loop client-side (§7.1).
5. **The orb hot-mics on mount.** `useAudioLevel.start()` fires as soon as the orb renders (`AudioOrb.tsx:53-57`) - the mic is live with no visible indicator. The SPA requests mic permission only on entering Voice mode and shows an explicit listening state.

## 2. Functionality inventory (Streamlit → verdict)

### 2.1 Chat (§6.6)

| # | Streamlit feature (file:line) | Verdict | Why / target |
|---|---|---|---|
| 1 | Sidebar Text/Voice toggle (`chat_sidebar.py:38-58`) | KEEP | Segmented `Tabs` at sidebar top; mode in URL (`?mode=voice`). |
| 2 | New Chat button (`:61-71`) | KEEP | Primary `Button`; also `⌘/Ctrl+Shift+O`. |
| 3 | Saved-chat list, active highlight, load, delete-current (`:74-113`) | KEEP + FIX | Id-keyed `ConversationList` (Discovery 3): inline rename (pencil / double-click), per-row delete with `Toast`+undo, active ring. Auto-title from first message preserved (`chat_state.py:176-180` logic ported). |
| 4 | Reports(n) expander: list + download + delete + clear all (`:116-145`) | KEEP | `ReportsPanel` disclosure; rows = timestamp · chat title · size, download + delete actions. Cap 20 (parity, `report_storage.py:50-52`). |
| 5 | Empty state: hint line + 4 example-prompt chips (`chat_history.py:199-236`) | **KEEP VERBATIM** | Same copy + behavior (click = send that exact prompt). Chips: Tyre status → "Tyre status for VER at lap 30 in Bahrain" · Pace prediction → "Predict pace for LEC lap 25 Monaco" · FIA regulation → "What do articles 55 and 57 say about safety car procedures?" · Full strategy → "Full strategy for NOR lap 40 Australia risk 0.7". Hint: "Mention a **driver**, **GP**, and **lap** to trigger an analysis, or try an example below." Chip click auto-sends (explicit in-page action - allowed; deep links are not, §5.4). |
| 6 | `st.chat_input` Enter-to-send (`chat_input.py:31-37`) | KEEP + IMPROVE | `Composer`: autosize textarea, Enter=send, Shift+Enter=newline, disabled-with-Stop while streaming. |
| 7 | Image attach behind expander, png/jpg/jpeg → base64 data-URI (`chat_input.py:20-28`, `chat_service.py:23-48`) | KEEP + IMPROVE | Paperclip popover with `FileDrop` + paste-from-clipboard + drag-anywhere-onto-thread; preview `AttachmentChip` with remove. Client-side downscale to ≤768 px JPEG before send (the Qwen3-VL sizing rationale from `chat_navigation.py:85-101`, now client-side). |
| 8 | Latest user image rides along on text-only follow-ups (`chat.py:297-306`) | KEEP | Subtle but load-bearing: `_last_user_image` port in the send builder, so "and what about the braking zones?" still sees the screenshot. |
| 9 | SSE streaming, token-by-token bubble (`chat.py:309-369`, `chat_service.py:311-377`) | KEEP (free upgrade) | `useChatStream` on `postStream` (`lib/api/sse.ts` - already built). Tokens append to a live `Markdown` bubble; no rerun-per-token. |
| 10 | Stage narration via /chat/status poll thread (`chat.py:33-52,99-128`) | KEEP labels / DROP poller | `StageTicker` renders the inline `stage` events with the SAME humanized copy map (`_STAGE_LABELS`, ported verbatim - it's good copy). Poller + `X-Request-Id` plumbing dropped (Discovery 2; keep sending a uuid header for backend logs). |
| 11 | Stop button, partial kept + "_[Response stopped by user]_" marker (`chat.py:68-96,349-350`) | KEEP + FIX | Real abort (Discovery 1). Same marker text appended to the persisted partial. Esc also stops. |
| 12 | Tool-call badge per invoked tool (`tool_result_renderer.py:38-46`) | KEEP + IMPROVE | `ToolBadge`: lucide icon per tool family + label + state (running pulse → done / error). Appears at `calling_<tool>` stage, resolves when `tool_result` lands - the badge IS the tool timeline. |
| 13 | Tool result renderers by display_type: metrics / strategy_card / table / text / chart (`tool_result_renderer.py:331-337`) | KEEP (reshaped) | `ToolResultCard` switches on `display_type` (§6.3). strategy_card renders with the **shared Strategy vocabulary**: `ActionBadge` + confidence + scenario scores + reasoning disclosure - a mini `DecisionCard`, same visual language as `/strategy`. |
| 14 | Inline charts for lap-times / telemetry / compare / race-data, Plotly (`chart_builders.py`) | KEEP (re-engined) | `InlineChart` + TS option-builder dispatcher → ECharts (F1-1, §6.3). Compound-tinted markers, pit-stop markLines, pit-lap outlier masking all ported as pure lib fns with tests. |
| 15 | Graceful tool-error: red error card + LLM plain-English follow-up (`tool_result_renderer.py:244-271`, dossier #36) | KEEP (both halves) | `ToolErrorCard` (danger left edge, tool name, message) for the `{"error": …}` envelope; the token stream that follows IS the LLM explanation - render both, never swallow either. |
| 16 | Report generation → save + Markdown download; reports in sidebar (`chat.py:382-423`, `chat_service.py:381-426`) | KEEP + IMPROVE (=E4) | One click: header action "Generate report" → button spinner → saves to Reports + triggers download + `Toast`. Two-step dance dropped (E4 accepted). Same backend call: `POST /tool-message` with the fixed summary instruction, temp 0.4, max_tokens 4000. |
| 17 | System prompt + injected F1 context (`chat_system_prompt`, `chat_f1_context`) | KEEP (clarified) | The real system prompt lives server-side (`chat_engine._SYSTEM_PROMPT`); the session key is vestigial (always ""). SPA keeps only `context{}` on the wire - held by `ContextCapsule` (§5.4) and the chat record. |
| 18 | LLM health warning banner (`chat.py:450-455`) | KEEP (demoted) | `GET /chat/health` on mount (Query, staleTime 30 s) → amber "LLM offline" `Pill` in the header; non-blocking, composer stays usable. |
| 19 | History/saved/reports lost on refresh | IMPROVE (accepted §6.8) | Chat slice persisted (§6.5). Voice stays ephemeral (parity). |
| 20 | Cross-page "Ask AI" pending-message flow, auto-send (`chat_navigation.py:15-72`, `chat.py:167-223,515-527`) | KEEP (re-gated) | Deep-link INTO chat with context + optional image; lands as prefilled, focused composer + `ContextCapsule` - **one Enter to fire, never auto-send** (§5.4; documented deviation, consistent with the sibling-spec rule that deep links never auto-fire LLM calls). |
| 21 | Empty-SSE defensive fallback message (`chat.py:358-363`) | KEEP | If a stream ends with no tokens and no tool_result, render the same "no response received" notice instead of a blank bubble. |
| 22 | Injected bubble/sidebar CSS, python-markdown rendering (`chat_history.py:21-193`, `chat_message.py`) | DROP | `Markdown` component + tokens carry it; zero injected CSS. |

### 2.2 Voice (§6.7)

| # | Streamlit feature (file:line) | Verdict | Why / target |
|---|---|---|---|
| 23 | Audio-reactive orb, React+ogl Iridescence shader, states idle/recording/processing/playing (`streamlit_audio_viz/frontend/src/*`) | **KEEP - lift verbatim** | It is already React+TS. Drop the `streamlit-component-lib` bridge (`index.tsx`), keep `AudioOrb.tsx` + `Iridescence.tsx` + `useAudioLevel.ts` + `styles.css` as `features/chat/voice/orb/`. Delete the `console.log` debug (`AudioOrb.tsx:31-37`). Mic capture gated on explicit mode entry (Discovery 5) + visible LISTENING chip. `prefers-reduced-motion` → static gradient orb, level-driven only. |
| 24 | Voice picker: curated 4-voice catalog, never calls the API (`voice_chat.py:16-22,292-313`) | KEEP + FIX row | §6.7 says "picker from `GET /voice/voices`" but Streamlit hardcodes `VOICE_CATALOG`. SPA: curated 4 as the default list (same ids + descriptions), "All voices…" expands from the real endpoint. Row satisfied for the first time. |
| 25 | Mic record via `st.audio_input`, dedupe vs `last_processed_audio` (`voice_input.py:14-65`) | IMPROVE | `MicBar`: 44 px record toggle + live mono timer + cancel; MediaRecorder (webm/opus - backend accepts `.webm`, `voice_api.py:274-280`). Dedupe hack dies with Streamlit reruns. |
| 26 | Full loop `POST /voice-chat` (STT→LLM→TTS), voice form field (`voice_api.py:194-246`) | KEEP (parity path) | `useVoiceSession` state machine drives it. Tool-aware composed loop is §7.1 (needs a 3-LOC backend additive for voice selection). |
| 27 | Exchange history: transcript bubble + reply bubble + MP3 player, latest autoplays (`voice_chat.py:94-181`) | KEEP (reshaped) | `VoiceExchangeCard` in the same thread grammar: transcript (user), reply (assistant), replay button, `processing_time` chip. One shared `HTMLAudioElement` + analyser feeds the orb; autoplay latest only. |
| 28 | Services-ready guard: poll /voice/health up to 60 s with warming copy (`voice_chat.py:256-289`) | KEEP + IMPROVE | Warmup panel over the orb: elapsed + "warming voice services (first launch downloads models)…", 2 s poll; record disabled until `stt_ready && tts_ready`. Failure → error card with the health JSON behind a disclosure. |
| 29 | Playing badge tied to `is_playing`, reset on next recording (`voice_chat.py:198-236,479-485`) | KEEP | `useVoiceSession` status drives a single state chip (LISTENING / TRANSCRIBING / THINKING / SPEAKING) + orb state - one source of truth, no flicker. |
| 30 | Voice report button (history → chat shape → generate_report) (`voice_chat.py:316-366`) | KEEP | Same one-click report treatment as #16. |
| 31 | Clear history (`voice_chat.py:520-532`) | KEEP | Ghost button + confirm. Voice history ephemeral (§6.8 parity). |
| 32 | Page-level iframe CSS nukes for the orb (`voice_chat.py:396-432`) | DROP (cause gone) | The orb is a native component now; no iframe, no blanket CSS overrides. |

Zero functional loss; three deliberate re-gatings (#20 no auto-fire, #24 real endpoint, #23 mic consent), each documented here.

## 3. Layout & IA

Route `/chat` (stub exists, `router.tsx:70-74`). One page, two modes; the sidebar and thread grammar are shared so switching modes feels like changing instruments, not pages.

```
┌ SIDEBAR (acrylic; Sheet overlay <1024px) ┐┌ THREAD ─────────────────────────────────────┐
│ [ 💬 Text ┃ 🎙 Voice ]  (segmented)      ││ header: "AI Chat"  (LLM offline·pill)       │
│ [+ New chat]                             ││        [⤓ Generate report] (≥2 messages)   │
│ HISTORY (3)                              ││                                             │
│ ▸ Tyre status for VER at lap 3…  ✎ ⌫    ││ ┌ user ────────────────────── [img chip] ┐  │
│   Predict pace for LEC lap 25…           ││ │ Full strategy for NOR lap 40 Australia │  │
│   What do articles 55 and 57…            ││ └─────────────────────────────────────────┘ │
│ REPORTS (2) ▾                            ││ ┌ assistant ──────────────────────────────┐ │
│   07/14 09:12 · Tyre status…  ⬇ ✕       ││ │ [⛭ Recommend Strategy ●done]  ToolBadge │ │
│                                          ││ │ ┌ mini DecisionCard ──────────────────┐ │ │
│ (voice mode: same sidebar,               ││ │ │ [PIT_NOW] conf 82% · scenarios list │ │ │
│  history list stays text-chats)          ││ │ │ ▸ reasoning                        │ │ │
└──────────────────────────────────────────┘│ │ └────────────────────────────────────┘ │ │
                                            │ │ Streamed prose (Markdown, live)…       │ │
  EMPTY STATE (no messages):                │ └─────────────────────────────────────────┘ │
  hint line + 4 example chips (2×2),        │ streaming: StageTicker "Running the full    │
  verbatim copy (§2.1 #5)                   │ strategy orchestrator (5 agents + LLM)..."  │
                                            │ ┌ COMPOSER ───────────────────────────────┐ │
                                            │ │ [📎][img ×] Ask me anything about F1…   │ │
                                            │ │            [▸ Send] / [⏹ Stop] while ⚡ │ │
                                            │ └─────────────────────────────────────────┘ │
                                            └─────────────────────────────────────────────┘
VOICE MODE (same shell; thread center swaps):
│   ╭────────╮   state chip: ● LISTENING / TRANSCRIBING / THINKING / SPEAKING │
│   │  ORB   │   voice: [Aria - US female, conversational ▾]  (All voices…)  │
│   ╰────────╯   warming overlay until stt_ready && tts_ready                │
│   VoiceExchangeCards (transcript → reply · ▶ replay · 3.2s chip)           │
│   MicBar: [ ● Record  00:07 ]  [✕ cancel]        [⤓ report] [⌫ clear]     │
```

**States:** Empty (hint + 4 chips; composer focused) · Streaming (StageTicker narrates stages; ToolBadge pulses on `calling_*`; tokens fill the bubble; composer → Stop; thread `aria-live=polite`) · Tool-error (ToolErrorCard + the streamed LLM explanation below it) · Transport error (Toast + inline "retry last message" on the failed bubble; input preserved) · Rate-limited (429 → Toast "Chat is limited to 20 requests/min"; composer stays) · LLM offline (amber header pill; send still attempts) · Voice warming (orb dimmed + progress copy; record disabled) · Voice error (per-stage: transcription failed → retry keeps the recording; TTS failed → text reply still shown with a "couldn't speak this" note) · Empty voice (orb idle-breathing + "hold Record and ask about a race moment").

## 4. Components

**Reuse as-is:** `Markdown` (message prose + reports), `Pill`, `Toast`, `FileDrop`, `Button`, `Card`, `Tabs` (mode toggle), `Tooltip`, `Skeleton`, `EmptyState`, `DataTable` (table display_type), `Sheet` (in `Modal.tsx` - mobile sidebar), **`postStream`** (`lib/api/sse.ts` - built for exactly this), ECharts + `F1_THEME` + `tireColors`, `lib/drivers.ts` (team colours in chart series).

**Shared vocabulary from sibling specs (consume, don't fork):** `ActionBadge` + `ConfidenceDial` + `CompoundPill` (strategy.md §4) render the `strategy_card` display type - `recommend_strategy` / `predict_tire` / `predict_pit` results in chat look EXACTLY like their Strategy/Lab counterparts at `size="sm"`. `NlpMessageCard` (model-lab.md §4) upgrades `analyze_radio` results (display_type `table` stays as fallback). One model family, one visual language, third surface.

**New shared (build here):**
- `MessageThread` - `role=log` scrollable column of message groups; sticky day dividers; auto-scroll with "jump to latest" affordance when the user has scrolled up; `content-visibility:auto` on bubbles (no virtualization needed at these lengths).
- `ToolBadge` - pill w/ lucide icon per tool family (Gauge=pace, CircleDot=tire, Swords=situation, Wrench=pit, RadioTower=radio, Scale=regulations, Brain=strategy, LineChart=telemetry family, List=listings) + running/done/error state. Also wanted by Model Lab's run header long-term.
- `InlineChart` - lazy-mounted ECharts host for chat bubbles: fixed 340 px height, theme'd, toolbox save-image, `IntersectionObserver` render-on-visible (charts below the fold cost nothing).

**Feature-local (`webapp/src/features/chat/`):**
- `ChatPage.tsx` (owns `?mode&c`, mounts sidebar/thread/composer) · `search.ts` (`mode: 'text'|'voice'` default text; `c?: chatId`) · `store.ts` (persisted chat slice §6.5) · `useChatStream.ts` (postStream → typed event reducer: stage/tool_result/token/done; AbortController owner).
- `components/`: `ChatSidebar` (+`ConversationList`, `ReportsPanel`), `MessageBubble`, `StageTicker`, `ToolResultCard` (display_type switch), `ToolErrorCard`, `Composer` (+`AttachmentChip`, `ExamplePrompts`), `ContextCapsule`.
- `charts/`: `buildLapTimesOption.ts`, `buildTelemetryOption.ts`, `buildCompareOption.ts`, `buildRaceDataOptions.ts` (returns TWO options - positions + lap times, parity with `build_race_data_figure`), `index.ts` dispatcher `buildToolChartOptions(toolName, data): EChartsOption[] | null`. Pure, unit-tested against captured payload fixtures. Reuse `features/dashboard/components/channels.ts` series styling for the telemetry panes and the Comparison delta fill treatment for `compare_drivers` - do not invent a fourth chart dialect.
- `voice/`: `VoicePanel.tsx`, `orb/` (lifted `AudioOrb`+`Iridescence`+`useAudioLevel`), `VoiceOrb.tsx` (thin wrapper mapping `useVoiceSession` status → orb props), `MicBar.tsx`, `VoicePicker.tsx`, `VoiceExchangeCard.tsx`, `useVoiceSession.ts` (state machine + MediaRecorder + playback analyser), `voiceStore.ts` (ephemeral).
- Promote to `lib/`: `lib/lapMarks.ts` - `detectPitLaps()` + `maskPitLapOutliers()` ported pure from `chart_builders.py:66-151,471-490` with unit tests (stint-increment first, compound-change fallback; median×1.15 outlier mask). `lib/api/chat.ts` + `lib/api/voice.ts` types.

## 5. Interactions & flows

1. **Send** - Enter → optimistic user bubble (+image chip) → `useChatStream` fires POST `tool-message-stream` with history-before-this-message (the `_prepare_send_context` exclusion, trivial here) → `stage` events tick the StageTicker with the verbatim `_STAGE_LABELS` copy → `calling_<tool>` mounts a pulsing ToolBadge → `tool_result` renders the card/chart instantly (before the summary!) → `token`s stream the prose → `done` persists the turn + auto-titles a new chat. The tool card appearing *before* the LLM explanation is the correct dramaturgy: evidence first, narrative second - Streamlit already ordered it this way, the SPA makes it visible.
2. **Stop** - Stop button or Esc → `abort()` → connection torn down (Discovery 1) → partial text kept + "_[Response stopped by user]_" → composer re-enabled. If a tool_result already landed, it stays.
3. **Example chips** - click sends the verbatim prompt immediately (parity behavior; an explicit in-page click, not a deep link).
4. **"Ask AI about this view" (E8, the product glue)** - other tabs call `navigate({to:'/chat'})` with a `pendingAsk` handoff written to the chat store (never URL - prompts/images don't belong in query strings): `{prompt, image?, context{year,gp,session,drivers,chart_type}, newChat?}`. Chat lands with a `ContextCapsule` chip row (GP · session · drivers, dismissible) + prefilled focused composer; **one Enter fires it**. Images come from ECharts `getDataURL()` client-side - the Plotly-kaleido server render (`chat_navigation.py:75-131`) dies. Capsule context rides as `context{}` on every subsequent send in that chat.
5. **Report** - one click: button spins → `POST /tool-message` (fixed instruction, temp 0.4, max_tokens 4000) → saved to Reports + browser download + Toast (E4). Sidebar rows re-download anytime.
6. **Chats** - New Chat snapshots current (auto-title) and opens fresh; switching loads instantly from the store; rename inline; delete with undo Toast. Active chat id in URL (`?c=`) → a conversation is shareable-in-place across refreshes.
7. **Voice loop (parity path)** - Record (MediaRecorder, live timer) → stop → `useVoiceSession`: TRANSCRIBING → `POST /voice-chat` (multipart + `voice` field) → exchange card appended (transcript + reply) → SPEAKING: decode `audio_base64`, play through the shared audio element + analyser → orb reacts → idle. Errors per stage keep the recording for retry. 429 (6-cap / 12-min limit) → Toast with the budget.
8. **Mode switch** - segmented toggle; both histories survive the switch (separate slices); mic permission requested on first Voice entry, orb shows LISTENING only while the analyser is actually running.
9. **Keyboard** - Enter send · Shift+Enter newline · Esc stop · ⌘/Ctrl+Shift+O new chat · ↑ in empty composer edits your last message (recall). Thread is `role=log` + `aria-live=polite`; chips, badges and transport all real buttons.

## 6. Data & migration notes

**Chat endpoints** (`backend/api/v1/endpoints/chat.py`; all rate-limited capacity 10 / 20 per min):

| Endpoint | Use |
|---|---|
| `POST /api/v1/chat/tool-message-stream` (:282) | THE chat call. Body `{text, image?: dataURI, chat_history[], context{}, model, temperature, max_tokens}` (+ optional `X-Request-Id` header, logs only). SSE events, in order: `stage {stage}` (keys: `preparing_tools`, `model_choosing_tool`, `calling_<tool>`, `summarizing_with_llm`, `composing_response` - label map ported verbatim from `chat.py:33-52` with the same sentence-case fallback for unknown keys) → optional `tool_result {tool_result:{tool_name, display_type, data, summary}}` → `token {token}` × N → `done {llm_model?, tokens_used?, error?}`. |
| `POST /tool-message` (:244) | Non-streaming variant - report generation only. |
| `GET /chat/health` (:43) | `{lm_studio_reachable}` → header pill. |
| `GET /chat/status` (:233) | NOT used by the SPA (Discovery 2). Do not port the poller. |

`display_type` contract (`tool_schemas.py:43-70`): metrics → `predict_pace`, `predict_situation` · strategy_card → `predict_tire`, `predict_pit`, `recommend_strategy` · table → `analyze_radio` · chart → `get_lap_times`, `get_telemetry`, `compare_drivers`, `get_race_data` · text → `query_regulations` (answer + source-articles disclosure), `list_gps`/`list_drivers` (chip lists), `get_lap_range` (one-liner), JSON fallback. Error envelope: `data == {"error": …}` (≤2 keys, `tool_result_renderer.py:244-250`) forces text → `ToolErrorCard`. **Type `data` tolerantly per family and always keep the JSON-disclosure fallback** - payloads are tool-shaped, not schema'd. One `tool_result` per turn today; type the store field as an array so a future multi-tool engine costs nothing.

**Wire history:** `[{role:'user'|'assistant', type:'text'|'image'|'tool_result', content, timestamp}]` - keep the exact shape (backend `build_messages` compresses to the last 5 interactions server-side, `llm_service.py:397-421`). Improvement (verify against `build_messages` first): substitute `tool_result` content with its `summary` string on the wire - the LLM never consumed the raw chart arrays anyway, and today they inflate every subsequent request.

**Voice endpoints** (`backend/api/v1/endpoints/voice.py`): `GET /voice/health` `{status, stt_ready, tts_ready, stt_model}` (cold start 30-60 s - model download; poll 2 s) · `GET /voice/voices` `{voices[{id,name,language}], count}` · `POST /voice/transcribe` multipart → `{text, language, duration}` · `POST /voice/synthesize` `{text, rate, volume}` → MP3 bytes (**no `voice` param today** - see §7.1) · `POST /voice/voice-chat` multipart + `voice` form field → `{transcript, response_text, audio_base64, processing_time}`, rate-limited capacity 6 / 12 per min.

**State split (§6.8 disposition):** URL = `mode`, `c` (chat id). TanStack Query = `/chat/health`, `/voice/health` (polling), `/voice/voices`. Zustand `features/chat/store.ts` **persisted** = `chats: Record<id, {id, title, createdAt, context, messages[]}>`, `activeChatId`, `reports[{id, filename, markdown, chatTitle, createdAt, sizeKb}]` (cap 20). Streaming turn state (partial text, stages, abort ref) lives in `useChatStream` local state - never persisted mid-flight. `voiceStore` ephemeral (in-memory): `exchanges[]`, `status`, `selectedVoice`, `servicesReady`. Streamlit keys map 1:1: `chat_history/saved/current_chat_name` → chats+activeChatId · `chat_streaming/should_stop/current_request_id/stream_placeholder/input_key` → die with reruns · `chat_pending_message/pending_auto_send/chat_pending_text` → `pendingAsk` in-memory handoff · `exported_reports` → reports · voice keys → `useVoiceSession`/`voiceStore` · `current_page` → router.

**Persistence gotcha (the one hard one):** image data-URIs (~100-250 kB each) blow the ~5 MB localStorage quota fast. Persist the chat slice through an **IndexedDB storage adapter** (`idb-keyval`, ~600 B) on Zustand `persist`; keep reports + prefs in localStorage. Belt-and-braces: store attachment images downscaled (≤768 px JPEG - already required for the model) and cap persisted chats at 50 with LRU eviction + Toast.

**Other gotchas:** nginx already allows the payloads (`client_max_body_size 25m`, `webapp/nginx.conf:15`) · backend clamps `max_tokens` server-side (send 1000, parity) · empty-stream fallback message (#21) is a real edge, keep it · `compare_drivers` payload ships `pilot.color` - prefer it over `getDriverColor` fallback (same rule as Comparison) · assistant prose is bilingual (system prompt mirrors user language) - `Markdown` must not assume English · MediaRecorder mimeType negotiate `audio/webm;codecs=opus` with `audio/mp4` Safari fallback; name the file by actual type so `_get_audio_content_type` maps right.

## 7. New features (ranked)

1. **Tool-aware voice** ⚡ (M, the flagship) - compose the loop client-side: `/transcribe` → transcript card → **`/tool-message-stream`** (tools! inline charts! stage narration while the orb "thinks") → `/synthesize` the final prose (markdown-stripped) → orb speaks. Kills Discovery 4: spoken questions hit the same models as typed ones, and voice mode inherits every chat renderer free. Backend-additive **B1**: optional `voice` field on `TTSRequest` (~3 LOC) so the picker keeps working; until B1, composed-loop replies use the default voice and `/voice-chat` stays as the fallback path behind a flag.
2. **Ask-AI deep links everywhere (E8)** ⚡ (S) - the `ContextCapsule` handoff (§5.4) + a ghost "Ask AI about this view" button on Dashboard/Comparison/Strategy/Lab cards. ECharts `getDataURL()` makes the screenshot free. This is what ties the six surfaces into one product.
3. **Chat search + pin (E5)** (S) - filter-as-you-type over titles + message text (it's all client-side now); pin up to 3 chats above the list.
4. **Slash commands** (S) - `/` in the empty composer opens a menu of the 4 example templates + `report`; picks fill the composer with editable placeholders (`/tyre VER 30 Bahrain`). Demo-friendly, zero backend.
5. **Wire-history slimming** (S, verify) - tool_result → summary substitution (§6). Cuts token burn on long analytical chats.
6. **Chart → page cross-links** (S) - inline lap-times/telemetry/compare charts get a "Open in Dashboard/Comparison" action carrying the context URL - the reverse of E8.
7. **Voice previews** (XS, needs B1) - play a 2 s sample per voice in the picker.
8. **Export-all / import** (XS) - download all chats as JSON from the sidebar footer (E5 tail); pairs with persistence.

## 8. Better than Streamlit

Real streaming (tokens render at DOM speed; the plan's measured ~95% per-token render cost cut) instead of rerun-per-token · a Stop that actually stops the backend stream, not a flag checked between frames · stage narration inline from SSE - the 1 s polling daemon thread and its endpoint dependency deleted · chats/reports survive refresh, id-keyed, renameable, deep-linkable (`?c=`) - no more same-title silent overwrites · inline charts are live ECharts (hover, zoom, save-image) in the one app-wide chart theme, not static Plotly re-rendered per rerun through 8 near-duplicate builders · tool evidence renders with the SAME `ActionBadge`/`CompoundPill`/`NlpMessageCard` vocabulary as Strategy/Lab - a tyre cliff looks identical on all three surfaces · the orb is a first-class component instead of a sandboxed iframe fought with page-level CSS nukes (`voice_chat.py:396-432` deleted) · mic consent explicit with a visible listening state instead of hot-mic-on-mount · voice can call the real models (§7.1) instead of improvising · screenshots for Ask-AI generated client-side by ECharts, no kaleido round-trip · accessible by construction: `role=log` live region, real buttons, keyboard map, reduced-motion orb.

## Acceptance criteria (#39 + #40, condensed)

§6.6 rows pass (with the rename amendment: rename EXISTS now, note in PR) + §6.7 rows pass (voice picker actually reads `GET /voice/voices`) · example chips byte-identical copy + click-sends (test asserts the 4 strings) · `useChatStream` reducer unit-tested against a captured SSE fixture (stage→tool_result→token→done, plus error-envelope and empty-stream cases) · Stop aborts the fetch (network-level assert: reader cancelled, no further tokens) and keeps the partial with the verbatim marker · dispatcher fixture tests per chart family incl. pit-vline detection + outlier masking parity with the Python fns · tool error renders card AND the following LLM explanation (dossier #36 regression test) · persistence round-trip: refresh restores chats incl. an image attachment (IndexedDB path) and reports · report is one-click and lands in the sidebar + download + toast · voice: record disabled until health-ready; each pipeline stage failure surfaces distinctly and keeps the recording; orb states track the session machine; reduced-motion honored · keyboard-only: send, stop, new chat, mode switch, chip activation · rate-limit 429s surface as Toasts with the budget, on both chat (20/min) and voice (12/min).

**Key files:** `frontend/pages/chat.py` + `frontend/components/chatbot/{chat_sidebar,chat_history,chat_input,chat_message,tool_result_renderer,chart_builders}.py` + `frontend/services/{chat_service,voice_api}.py` + `frontend/utils/{chat_state,chat_navigation,report_storage}.py` · voice `frontend/components/voice/{voice_chat,voice_input}.py` + orb `frontend/components/streamlit_audio_viz/frontend/src/{AudioOrb,Iridescence,useAudioLevel}.tsx|ts` (lift these three + styles.css) · backend `backend/api/v1/endpoints/{chat.py,voice.py}`, `backend/services/chatbot/chat_engine.py:158-332` (event flow), `backend/models/tool_schemas.py:22-70` (tools + display map) · grammar `webapp/src/lib/api/sse.ts` (postStream - the cornerstone), `webapp/src/components/{Markdown,Pill,Toast,FileDrop,Tabs,Modal(Sheet)}.tsx`, `webapp/src/features/dashboard/components/{channels.ts,ChannelChart.tsx}` (chart styling to reuse), `webapp/src/styles/tokens.css` · sibling specs `docs/migration/design-specs/{strategy,comparison,model-lab}.md` (shared vocab) · route stub `webapp/src/app/router.tsx:70-74`.
