# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased][Unreleased]

### Added

- None

---

## [1.1.0][1.1.0] - 2025-11-29

### Added

#### Chat & Multimodal Features
- **Smart Chat History Compression**: Automatic summarization of old messages (keeps last 5 interactions)
- **Multimodal Vision Support**: Image analysis with Qwen3-VL model (768×480 optimization)
- **Auto-send from Dashboard**: Send telemetry charts directly to chat for analysis
- **Report Storage**: Export and save conversation reports with timestamps
- **Retry Logic**: Automatic fallback when vision models fail

#### Voice Capabilities
- **Whisper Model Upgrade**: Enhanced speech recognition (small → medium model)
- **Voice Orb Visualization**: Audio-reactive orb with Iridescence shader for real-time feedback
- **Voice Chat Reports**: Export voice conversation transcripts
- **TTS Integration**: Text-to-speech output for chat responses

#### Telemetry & Visualization
- **DRS Visualization**: Dedicated graphs for DRS activation zones and usage
- **Sprint/Qualifying/Race Support**: Multi-session analysis for complete race weekends
- **Lap Selection Interface**: Improved UI for selecting specific laps
- **Tyre Compound Legends**: Visual indicators for tire types in graphs
- **Time Format Improvements**: Better readability for lap times and deltas

#### Technical Improvements
- **Infinite Timeout Configuration**: Vision models can process without time limits
- **Data URI Image Encoding**: Optimized base64 image format for multimodal queries
- **System Prompt Files**: Modular prompt management for different model types
- **Enhanced Error Handling**: Better exception management across all services

### Changed

- Chat UI redesigned for better image handling and voice mode display
- Telemetry service optimized for faster data retrieval
- Navigation system improved for cross-page chart analysis
- LM Studio service refactored with better message building

### Fixed

- Image conversion issues with plotly charts
- Session state persistence in multi-page navigation
- Timeout errors with vision model processing
- Report export formatting and file naming

---

## [0.1.0][0.1.0] - 2025-09-09

### Added

- Base Streamlit interface with F1 theme.
- Multi-session chat with LM Studio API integration.
- Vision, NLP, and ML sections with implemented models (XGBoost, TCN, YOLOv8).
- Visualization and graphing system.
- F1-specific Q&A chatbot with specialized prompts.
- Session state management for persistence.

[Unreleased]: https://github.com/your-username/your-repo/compare/v1.1.0...HEAD

[1.1.0]: https://github.com/your-username/your-repo/releases/tag/v1.1.0

[0.1.0]: https://github.com/your-username/your-repo/releases/tag/v0.1.0
