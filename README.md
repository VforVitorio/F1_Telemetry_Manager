<div align="center">

# F1 Telemetry Manager

### *FastAPI backend and Streamlit post-race UI for F1 StratLab.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE) [![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-0.109-teal)](https://fastapi.tiangolo.com/) [![Streamlit](https://img.shields.io/badge/Streamlit-1.37%2B-red)](https://streamlit.io/) [![FastMCP](https://img.shields.io/badge/FastMCP-3.x-purple)](https://github.com/jlowin/fastmcp) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/VforVitorio/F1_Telemetry_Manager)

[Parent project: F1 StratLab](https://github.com/VforVitorio/F1-StratLab) · [Architecture](docs/telemetry-architecture.md) · [Backend API reference](../../docs/backend-api.md) · [Changelog](docs/CHANGELOG.md)

</div>

---

## What it is

F1 Telemetry Manager is the post-race surface of [F1 StratLab](https://github.com/VforVitorio/F1-StratLab): a FastAPI backend that wraps the strategy agents (N25–N31) and the telemetry / comparison / circuit-domination services, and a Streamlit frontend that consumes them. It is vendored into F1 StratLab as a git submodule at [`src/telemetry/`](.) and shares the parent's data root, ML weights, and `.env`.

The repo can also be cloned standalone if you only want the analytics dashboard, but the chat and strategy endpoints assume the F1 StratLab models live alongside.

## Two surfaces

| Surface | Entry point | What it does |
| --- | --- | --- |
| **FastAPI backend** | `uvicorn backend.main:app --port 8000` | REST endpoints for telemetry, comparison, circuit domination, strategy, chat and voice. Mounts a FastMCP server at `/mcp` exposing the strategy agents as tools. |
| **Streamlit frontend** | `streamlit run frontend/app/main.py` | Post-race dashboard: telemetry charts, driver comparison, microsector analysis, chat with tool-calling, voice mode, downloads and reports. |

The chat pipeline runs in-process against the strategy agents through a tool-calling loop (OpenAI tool contract); the same tools are exposed externally over MCP, so Claude Desktop, Cursor or any MCP client can drive the agents directly.

## How to run

From the F1 StratLab repo root (recommended):

```bash
docker compose up
# or
f1-streamlit
```

`f1-streamlit` is the convenience entry point installed by F1 StratLab; both routes bring the backend up on `:8000` and the frontend on `:8501`.

Standalone (from this directory):

```bash
docker compose up
```

The compose file mounts `../../src` and `../../data` from the parent repo (read-only), and reads `../../.env` for the LLM provider. To run without F1 StratLab, point those volumes at your own data and set `OPENAI_API_KEY` (or `F1_LLM_PROVIDER=lmstudio` with LM Studio on `host.docker.internal:1234`).

Manual install for development:

```bash
uv sync
uvicorn backend.main:app --reload --port 8000          # terminal 1
streamlit run frontend/app/main.py --server.port 8501  # terminal 2
```

Requires Python 3.11+. The voice pipeline pulls Whisper (`openai-whisper`) and `edge-tts`; first run downloads the Whisper medium weights.

## What the backend exposes

All endpoints sit under `/api/v1`. The full reference lives at [`docs/backend-api.md`](../../docs/backend-api.md) in the parent repo; the short version:

- **`/telemetry`** — GPs, sessions, drivers, lap times, per-lap telemetry, aggregated data (FastF1).
- **`/comparison/compare`** — two-driver fastest-lap comparison with synchronised delta.
- **`/circuit-domination`** — microsector-level dominant-driver map.
- **`/strategy`** — pace, tire degradation, situation, pit timing, radio NLP, FIA RAG and the orchestrated `recommend` endpoint that ties them together. Also drives the simulator (`/strategy/simulate`).
- **`/chat`** — message, stream, tool-message and tool-message-stream. The tool-message endpoints implement the OpenAI tool-calling loop against the strategy MCP tools; `/stream` is the plain chat passthrough.
- **`/voice`** — STT (Whisper), TTS (edge-tts) and the full STT → LLM → TTS pipeline.
- **`/mcp`** — FastMCP Streamable-HTTP transport. External MCP clients connect here to call the strategy tools directly.

## Project layout

- [`backend/`](backend/) — FastAPI app
  - [`api/v1/endpoints/`](backend/api/v1/endpoints/) — `telemetry`, `comparison`, `circuit_domination`, `strategy`, `chat`, `voice`
  - [`services/`](backend/services/) — chatbot (chat engine, MCP bridge, stage tracker, LLM service), telemetry, simulation, voice
  - [`mcp_tools.py`](backend/mcp_tools.py) — FastMCP server wrapping the N25–N31 agents
- [`frontend/`](frontend/) — Streamlit app
  - [`app/main.py`](frontend/app/main.py) — landing + dashboard
  - [`pages/`](frontend/pages/) — Advanced, Compare, Downloads, Reports, Admin
  - [`components/`](frontend/components/) — chatbot, telemetry and shared widgets
- [`docs/`](docs/) — architecture, changelog, multimodal and MCP notes, import guide
- [`tests/`](tests/) — pytest coverage for chat engine, MCP bridge, comparison and telemetry services

## Tech stack

Backend: FastAPI 0.109, Pydantic 2.5, FastF1 3.4, FastMCP 3.x.
Frontend: Streamlit 1.37+, Plotly 5.18, streamlit-shadcn-ui, hydralit-components, kaleido.
AI / voice: OpenAI-compatible LLM (LM Studio local server or OpenAI API), openai-whisper (medium), edge-tts, pydub, soundfile.

## Related

This repo is one piece of F1 StratLab:

- [F1 StratLab](https://github.com/VforVitorio/F1-StratLab) — strategy engine, agents, CLI and Arcade live UI
- F1 Telemetry Manager *(this repo)* — backend and post-race Streamlit, vendored as a submodule
- [F1 AI Team Detection](https://github.com/VforVitorio/F1_AI_team_detection) — YOLOv12 team identification from race footage
- [F1 Strategy Dataset](https://huggingface.co/datasets/VforVitorio/f1-strategy-dataset) — trained weights and processed race data

## About

Originally built as a coursework project (Santiago Souto Ortega and Víctor Vega Sobral, fourth year, *Grado en Ingeniería de Sistemas Inteligentes*) and later refactored into the post-race surface of F1 StratLab. Pull requests and issues are welcome at [VforVitorio/F1_Telemetry_Manager](https://github.com/VforVitorio/F1_Telemetry_Manager).

Licensed under the Apache License 2.0 — see [`LICENSE`](LICENSE).

---

> **Disclaimer — no copyright infringement intended.** Formula 1, F1 and related marks are trademarks of Formula One Licensing B.V. and are used here for reference only. Race data is sourced from public APIs (FastF1) and used strictly for educational and non-commercial purposes. This project is not affiliated with, endorsed by, or in any way officially connected to Formula 1, the FIA, or any F1 team.
