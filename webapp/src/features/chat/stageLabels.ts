// Re-keyed stage-label map for the chat SSE ticker (design-audit #39, finding
// 4.2). Streamlit's `_STAGE_LABELS` (frontend/pages/chat.py:33-52) has drifted
// from what `chat_engine.stream_response` actually emits: it carries three
// dead keys from the retired regex router (`extracting_intent`,
// `classifying_query`, `loading_models`), two wrong tool names
// (`calling_list_gps` / `calling_list_drivers` instead of the real dispatched
// `calling_list_available_gps` / `calling_list_available_drivers`), and is
// missing three real stages (`preparing_tools`, `model_choosing_tool`,
// `composing_response`). This map is keyed against the ACTUAL emissions
// (`chat_engine.py:173-333`) instead of copied verbatim.

const STAGE_LABELS: Record<string, string> = {
  preparing_tools: 'Preparing tools…',
  model_choosing_tool: 'Choosing the right tool…',
  composing_response: 'Composing the response…',
  summarizing_with_llm: 'Summarizing the result…',
  calling_predict_pace: 'Predicting lap pace…',
  calling_predict_tire: 'Predicting tire degradation…',
  calling_predict_situation: 'Predicting overtake / safety car risk…',
  calling_predict_pit: 'Predicting the pit stop…',
  calling_analyze_radio: 'Analyzing team radio…',
  calling_query_regulations: 'Searching FIA regulations…',
  calling_recommend_strategy: 'Running the full strategy council…',
  calling_list_available_gps: 'Listing available Grand Prix…',
  calling_list_available_drivers: 'Listing available drivers…',
  calling_get_lap_range: 'Checking the lap range…',
  calling_compare_drivers: 'Comparing drivers…',
  calling_get_lap_times: 'Fetching lap times…',
  calling_get_telemetry: 'Fetching telemetry…',
  calling_get_race_data: 'Fetching race data…',
}

const CALLING_PREFIX = 'calling_'

/** The tool name a `calling_<name>` stage names, or undefined for any other
 *  stage. Shared by the label lookup below and the reducer's tool-badge
 *  derivation (`useChatStream.ts`), so both agree on how a stage names its
 *  tool. */
export function toolNameFromStage(stage: string): string | undefined {
  return stage.startsWith(CALLING_PREFIX) ? stage.slice(CALLING_PREFIX.length) : undefined
}

/** Human label for a backend stage name. Falls back to a sentence-cased
 *  rendering of the raw stage (still stripping the `calling_` prefix) for any
 *  stage this map does not know about yet, so a newly added tool never shows a
 *  raw snake_case string in the ticker. */
export function stageLabel(stage: string): string {
  const known = STAGE_LABELS[stage]
  if (known) return known
  const words = (toolNameFromStage(stage) ?? stage).split('_').join(' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}…`
}
