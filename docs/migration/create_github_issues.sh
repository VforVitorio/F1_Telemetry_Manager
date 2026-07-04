#!/usr/bin/env bash
# Create the frontend-migration epic scaffolding (labels + milestones + issues) in the
# F1_Telemetry_Manager submodule. Idempotent-ish: labels use --force; milestones skip if they exist.
# Run AFTER committing docs/migration/ so the issues can reference the plan. Requires: gh auth login.
set -euo pipefail
REPO="VforVitorio/F1_Telemetry_Manager"
DOC="docs/migration/SPRINTS_AND_ISSUES.md"

echo ">> Labels"
while IFS='|' read -r name color desc; do
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" --force
done <<'LABELS'
migration|1d76db|Streamlit→React SPA migration
area: frontend|0e8a16|Frontend / SPA
area: backend|b60205|FastAPI backend / packaging
area: infra|5319e7|Build, Docker, CI
enhancement|a2eeef|Additive, post-parity
LABELS

echo ">> Milestones (skip if present)"
for m in \
  "S0 Backend hardening" "S1 Foundations" "S2 Pilot+Core" \
  "S3 Flagship+Analysis" "S4 Conversational" "S5 Onboarding+Cutover"; do
  gh api "repos/$REPO/milestones" -f title="$m" >/dev/null 2>&1 && echo "  created: $m" || echo "  exists : $m"
done

echo ">> Issues"
# milestone | title | labels | body (all link the epic #25 + the committed plan)
while IFS='|' read -r ms title labels body; do
  [ -z "$title" ] && continue
  gh issue create --repo "$REPO" --milestone "$ms" --title "$title" --label "$labels" \
    --body "$body"$'\n\n'"Part of the Streamlit→React migration epic #25. Detail + parity gate: \`$DOC\`."
done <<'ISSUES'
S0 Backend hardening|fix(data): repo-root .git walker breaks bare-metal data paths|migration,area: backend|Add an /app fallback or honor F1_STRAT_DATA_ROOT (dossier Finding 1 / A5-6).
S0 Backend hardening|fix(deps): openai-whisper build fails on a fresh venv|migration,area: backend|Pin/patch the whisper build so a clean install works (dossier Finding 2).
S0 Backend hardening|fix(deps): reconcile fastmcp pyproject.toml vs requirements.txt drift|migration,area: backend|Unify the two manifests; fastmcp missing from one (dossier Finding 3 / A5-6).
S1 Foundations|infra(webapp): Vite+TS scaffold, Docker (node build → nginx), compose :3000, CI|migration,area: infra|W0. Scaffold webapp/, multi-stage Dockerfile, compose service on :3000, CI lint/typecheck/build/vitest.
S1 Foundations|feat(webapp): typed API layer, openapi-typescript, SSE client, Query/Router/Zustand|migration,area: frontend|W0. Typed 40-endpoint API layer generated from OpenAPI; generic fetch-stream SSE client; wire TanStack Query/Router + Zustand.
S1 Foundations|feat(webapp): Tailwind theme from tokens.css, self-hosted fonts, ECharts token theme|migration,area: frontend|W0/W1. Map tokens.css 1:1 to Tailwind v4; bundle Space Grotesk/Inter/JetBrains Mono; one ECharts theme from tokens.
S1 Foundations|feat(webapp): design-system primitives + app shell (acrylic rail, header, transitions)|migration,area: frontend|W1. Build the §2.3 primitives + shell. Acrylic on chrome only.
S2 Pilot+Core|feat(dashboard): pilot Dashboard, full §6.1 parity|migration,area: frontend|W2. URL-bound selectors, ECharts click-to-load, 7-channel grid + grid⇄stack, circuit domination, client IQR toggles. Proves data/URL/chart layers.
S2 Pilot+Core|feat(strategy): Strategy page, §6.2 parity|migration,area: frontend|W3. StatusStepper (scripted stages), recommendation glow card, 4 agent sub-tabs, scenario bars, JSON download.
S3 Flagship+Analysis|feat(comparison): 60fps canvas replay engine, §6.5 parity|migration,area: frontend|W4 (flagship). Fetch channels once → distance-domain interpolation → rAF canvas → accessible transport. Port interpolation math first with unit tests vs a fixture.
S3 Flagship+Analysis|feat(race-analysis): 5 tabs, DataTable, radio gate, RAG card, §6.3 parity|migration,area: frontend|W5. Loader+file-drop, tyre chart-switcher, NLP badges, RAG citation card, virtualized TanStack table.
S3 Flagship+Analysis|feat(model-lab): unified context bar, 6 tabs, gauges, cancelable Pace, §6.4 parity|migration,area: frontend|W6. Shared GP/driver/lap context; ECharts gauges; Pace cancel + skeleton.
S4 Conversational|feat(chat): SSE streaming, toolResult→chart dispatcher, reports, §6.6 parity|migration,area: frontend|W7. Virtualized list, stage chips, Stop, tool badges, inline-chart dispatcher (F1-1), image attach, graceful tool-error, reports store.
S4 Conversational|feat(voice): lift AudioOrb, useVoiceSession recorder/playback, §6.7 parity|migration,area: frontend|W8. Lift AudioOrb/Iridescence/useAudioLevel verbatim; MediaRecorder+AnalyserNode; voice picker.
S5 Onboarding+Cutover|feat(onboarding): welcome + guided setup + tour + warmup ping|migration,area: frontend|W9 (new work). Gate f1sl.onboarded.v1; 3-step setup; 4-mark tour; warmup piggyback.
S5 Onboarding+Cutover|feat(home): hero + quick-start cards + recents|migration,area: frontend|W9. Three.js track-ribbon hero (WebGL-optional), 3 quick-starts, recent activity.
S5 Onboarding+Cutover|chore(cutover): SPA takes :8501, remove Streamlit, docs, regression|migration,area: infra|W10. Swap ports, drop Streamlit service (legacy profile then delete), update docs, full §6 + dossier-PNG regression, unify manifests (E11), bump parent submodule pointer.
ISSUES
echo ">> Done. Review the created issues, then link them under epic #25."
