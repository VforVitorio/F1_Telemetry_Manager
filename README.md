# 🏎️ F1 Telemetry Manager

<div align="center">

**AI-powered Formula 1 telemetry analysis platform with multimodal interaction**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-green.svg)](https://www.python.org/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.31+-red.svg)](https://streamlit.io/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-teal.svg)](https://fastapi.tiangolo.com/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/VforVitorio/F1_Telemetry_Manager)

[Features](#-features) •
[Architecture](#%EF%B8%8F-architecture) •
[Documentation](#-documentation) •
[Getting Started](#-getting-started) •
[Roadmap](#%EF%B8%8F-roadmap)

</div>

---

## 📋 Overview

F1 Telemetry Manager analyzes Formula 1 telemetry data through an interface combining Streamlit for visualization and FastAPI for data processing. The platform provides real-time charts, AI-powered analysis via LM Studio, and data export capabilities for motorsport analysis.

### Core Capabilities

- **Telemetry Visualization**: Speed, throttle, brake, RPM, gear, DRS, and G-force charts with lap-by-lap analysis
- **AI Assistant**: Chat interface powered by LM Studio for contextual F1 telemetry questions
- **Intelligent Query Routing**: Automatic classification of queries into 5 specialized handlers (basic, technical, comparison, report, download)
- **Voice Interaction**: Speech-to-text (Whisper) and text-to-speech (pyttsx3) for hands-free queries
- **Performance Comparison**: Side-by-side driver analysis with delta time calculations
- **Circuit Analysis**: Microsector-level performance visualization showing dominant driver per track segment
- **Data Export**: CSV/JSON download with filtering and preview
- **Report Generation**: Markdown format conversation summaries with context metadata

---

## ✨ Features

### Telemetry Analysis

- **8 Visualization Types**: Speed, lap times, throttle, brake pressure, RPM, gear shifts, DRS usage, and delta time
- **DRS Visualization**: Dedicated graphs showing DRS activation zones with speed overlay
- **Circuit Domination**: Color-coded track segments indicating which driver led each microsector
- **Interactive Charts**: Plotly-based visualizations with zoom, pan, and data point inspection
- **Session Support**: Practice (FP1/FP2/FP3), Qualifying, Sprint, and Race sessions from 2018-present
- **Lap Selection Interface**: Improved UI for selecting specific laps or fastest laps
- **Tyre Compound Legends**: Visual indicators showing tire types used in each stint

### AI Assistant (Caronte)

- **Smart History Compression**: Automatic conversation summarization after 5 interactions (LLM-powered)
- **Multimodal Vision**: Send telemetry charts directly to vision models (Qwen3-VL-4B-Instruct)
- **Auto-send from Dashboard**: Click 🤖 on any chart to analyze it in chat automatically
- **Infinite Timeout**: Vision models process without time limits for complex image analysis
- **Automatic Retry**: Falls back to text-only if vision model fails
- **Context Awareness**: Automatically includes session metadata (year, GP, drivers) in prompts
- **Query Routing**: Specialized handlers for basic questions, technical analysis, comparisons, reports, and downloads
- **Streaming Responses**: Real-time response generation for better UX
- **Chat Management**: Multiple conversation threads with persistent storage
- **Optimized Image Format**: Charts converted to 768×480 JPEG at 85% quality for best performance

### Voice Chat

- **Whisper Medium Model**: Enhanced speech recognition (upgraded from small model)
- **Speech-to-Text**: OpenAI Whisper for accurate audio transcription
- **Text-to-Speech**: pyttsx3 for offline audio synthesis
- **Full Voice Flow**: Single-endpoint STT → LLM → TTS pipeline
- **Voice Orb Visualization**: Audio-reactive orb with Iridescence shader for real-time feedback
- **Voice Chat Reports**: Export voice conversation transcripts with timestamps
- **Voice Models**: Configurable system voices (Windows SAPI, macOS NSSpeechSynthesizer, Linux eSpeak)
- **Audio Formats**: Supports WAV, MP3, WebM, OGG, M4A input

### Driver Comparison

- **2-Driver Analysis**: Fastest lap comparison with synchronized telemetry data
- **Delta Visualization**: Time gap between drivers at each track point
- **Microsector Analysis**: Sector-by-sector performance breakdown
- **Synchronized Data**: Interpolated telemetry aligned to common distance points
- **Time Format Improvements**: Better readability for lap times and delta calculations

### Data Export & Reports

- **CSV Format**: Raw telemetry data with column headers
- **JSON Format**: Structured data for API integration
- **Report Storage**: Session-based report management with timestamps
- **Exported Reports Section**: View and manage previously saved conversation reports
- **Context Metadata**: Exports include GP, year, session, and driver information

---

## 🏗️ Architecture

The system uses a layered architecture with feature-based organization:

```
┌─────────────────────────────────────────┐
│         USER BROWSER                    │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   STREAMLIT FRONTEND                    │
│   (Presentation Layer)                  │
└──────────────┬──────────────────────────┘
               │ HTTP Requests
               ↓
┌─────────────────────────────────────────┐
│   FASTAPI BACKEND                       │
│   (API + Service + Repository Layers)  │
└────────┬──────────────────┬─────────────┘
         │                  │
         ↓                  ↓
┌──────────────┐    ┌────────────────────┐
│  SUPABASE    │    │  EXTERNAL APIs     │
│  (PostgreSQL)│    │  • FastF1          │
│              │    │  • LM Studio       │
└──────────────┘    └────────────────────┘
```

### Tech Stack

**Frontend:**
- Streamlit 1.31+ (UI framework)
- Plotly 5.18+ (interactive charts)
- Pandas, NumPy (data processing)
- httpx (HTTP client)
- audio-recorder-streamlit (voice input)

**Backend:**
- FastAPI 0.109+ (REST API)
- Pydantic 2.5+ (data validation)
- python-jose (JWT tokens)
- passlib + bcrypt (password hashing)
- FastF1 3.4.0 (F1 telemetry source)
- Supabase 2.10.0 (PostgreSQL database)

**AI/ML:**
- LM Studio (local LLM via OpenAI-compatible API)
- OpenAI Whisper 20231117 (speech-to-text, medium model)
- pyttsx3 (text-to-speech, offline)

---

## 📚 Documentation

### Core Documents

| Document            | Description                                       | Link                                             |
| ------------------- | ------------------------------------------------- | ------------------------------------------------ |
| **Architecture**    | System design, patterns, and technical decisions  | [📐 ARCHITECTURE.md](docs/ARCHITECTURE.md)       |
| **Roadmap**         | Product roadmap, timeline, and feature plan       | [🗺️ ROADMAP.md](docs/ROADMAP.md)                 |
| **Changelog**       | Version history and notable changes               | [📝 CHANGELOG.md](docs/CHANGELOG.md)             |
| **Issue Templates** | Bug reports, feature requests, and task templates | [🐛 ISSUE_TEMPLATES.md](docs/ISSUE_TEMPLATES.md) |
| **Query Router**    | Intelligent query routing system guide            | [🎯 QUERY_ROUTER_GUIDE.md](docs/QUERY_ROUTER_GUIDE.md) |
| **Voice Chat**      | Voice interaction implementation details          | [🎤 VOICE_CHAT_IMPLEMENTATION_PLAN.md](docs/archived/VOICE_CHAT_IMPLEMENTATION_PLAN.md) |

### Implementation Plans

- **Circuit Analysis**: [CIRCUIT_ANALYSIS_IMPLEMENTATION_PLAN.md](docs/archived/CIRCUIT_ANALYSIS_IMPLEMENTATION_PLAN.md)
- **Circuit Comparison**: [CIRCUIT_COMPARISON_IMPLEMENTATION_PLAN.md](docs/archived/CIRCUIT_COMPARISON_IMPLEMENTATION_PLAN.md)
- **Chat System**: [CHAT_IMPLEMENTATION_PLAN.md](docs/archived/CHAT_IMPLEMENTATION_PLAN.md)
- **Multimodal Support**: [MULTIMODAL_IMPLEMENTATION.md](docs/MULTIMODAL_IMPLEMENTATION.md)
- **Query Routing**: [QUERY_ROUTING_IMPLEMENTATION.md](docs/QUERY_ROUTING_IMPLEMENTATION.md)

### Diagrams

<div align="center">

**System Flow Diagram**

<img src="docs/img/app_diagram.png" alt="F1 Telemetry Manager Flow Diagram" width="800"/>

_Complete user flow showing authentication, dashboard navigation, telemetry analysis, AI interaction, and admin capabilities_

</div>

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- LM Studio (running on `http://localhost:1234` with a loaded model)
- Supabase account
- Python 3.10+ (for manual installation)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/VforVitorio/F1_Telemetry_Manager.git
cd F1_Telemetry_Manager

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials:
# SUPABASE_URL, SUPABASE_KEY, SECRET_KEY, BACKEND_URL

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Access points:**

- Frontend: http://localhost:8501
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Manual Installation

```bash
# Install frontend dependencies
cd frontend
pip install -r requirements.txt

# Install backend dependencies
cd ../backend
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

**Running manually:**

Terminal 1 - Backend:
```bash
uvicorn backend.main:app --reload --port 8000
```

Terminal 2 - Frontend:
```bash
streamlit run frontend/app/main.py
```

Terminal 3 - LM Studio:
```bash
# Start LM Studio on http://localhost:1234
# Load a model (e.g., llama3.2-vision or qwen2-vl)
# Enable local server in LM Studio settings
```

---

### Configuration

#### Generate Secret Key

```bash
python backend/utils/generate_secret.py
```

Copy the output to your `.env` file under `SECRET_KEY`.

#### Environment Variables

Required variables in `.env`:

```bash
# Backend API
BACKEND_URL=http://localhost:8000

# Supabase
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_KEY=<your-supabase-anon-key>

# JWT Security
SECRET_KEY=<generated-secret-key>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

#### Voice Configuration

Edit `backend/core/voice_config.py` to configure voice services:

```python
WHISPER_MODEL = "medium"  # Options: tiny, base, small, medium, large
WHISPER_LANGUAGE = "en"   # or None for auto-detect
TTS_RATE = 175            # Speech rate (words per minute)
TTS_VOLUME = 0.9          # Volume (0.0 to 1.0)
```

---

## 🧠 Intelligent Query Routing

The system automatically classifies user queries and routes them to specialized handlers:

### Query Types

1. **BASIC_QUERY**: Simple F1 concepts (e.g., "What is DRS?")
2. **TECHNICAL_QUERY**: Advanced telemetry analysis (e.g., "Show throttle data for lap 15")
3. **COMPARISON_QUERY**: Multi-driver comparisons (e.g., "Compare Hamilton vs Verstappen")
4. **REPORT_REQUEST**: Conversation summarization (e.g., "Generate a report")
5. **DOWNLOAD_REQUEST**: Data export (e.g., "Download as CSV")

### How It Works

- **LLM-Based Classification**: Uses LM Studio with low temperature (0.1) for consistent routing
- **Rule-Based Fallback**: Keyword matching when LM Studio is unavailable
- **Context Injection**: Automatically includes session metadata in technical/comparison queries
- **Handler Specialization**: Each handler has a tailored system prompt for optimal responses

See [QUERY_ROUTER_GUIDE.md](docs/QUERY_ROUTER_GUIDE.md) for detailed examples.

---

## 📊 API Endpoints

### Authentication (`/api/v1/auth`)
- `POST /signup` - Register new user
- `POST /signin` - Login user
- `GET /me` - Get current user
- `POST /signout` - Logout

### Telemetry (`/api/v1/telemetry`)
- `GET /gps` - Available GPs for year
- `GET /sessions` - Sessions for GP
- `GET /drivers` - Drivers in session
- `GET /lap-times` - Lap times for drivers
- `GET /lap-telemetry` - Telemetry for lap
- `GET /data` - Aggregated telemetry

### Circuit (`/api/v1/circuit-domination`)
- `GET /` - Microsector performance data

### Comparison (`/api/v1/comparison`)
- `GET /compare` - Compare two drivers' fastest laps

### Chat (`/api/v1/chat`)
- `POST /message` - Send message (non-streaming)
- `POST /stream` - Stream message response
- `POST /query` - Process query with intelligent routing
- `GET /health` - Check LM Studio health
- `GET /models` - Get available models

### Voice (`/api/v1/voice`)
- `POST /transcribe` - Speech-to-text
- `POST /synthesize` - Text-to-speech
- `POST /voice-chat` - Full voice interaction (STT → LLM → TTS)
- `GET /health` - Voice services health
- `GET /voices` - Available TTS voices

---

## 🤝 Contributing

Contributions are welcome. Please read our contribution guidelines and submit pull requests for improvements.

### Reporting Issues

Use our [Issue Templates](docs/ISSUE_TEMPLATES.md) for:
- 🐛 Bug reports
- ✨ Feature requests
- 📊 Data issues
- 🚀 Tasks/TODOs

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

```
Copyright 2025 F1 Telemetry Manager Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 🙏 Acknowledgments

- [FastF1](https://github.com/theOehrly/Fast-F1) for F1 telemetry data access
- [Streamlit](https://streamlit.io/) for the frontend framework
- [FastAPI](https://fastapi.tiangolo.com/) for the backend API framework
- [Supabase](https://supabase.com/) for database infrastructure
- [LM Studio](https://lmstudio.ai/) for local LLM inference

---

<div align="center">

[Report Bug](https://github.com/VforVitorio/F1_Telemetry_Manager/issues) •
[Request Feature](https://github.com/VforVitorio/F1_Telemetry_Manager/issues) •
[Documentation](docs/)

</div>
