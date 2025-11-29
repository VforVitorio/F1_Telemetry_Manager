# Voice Chat Implementation Plan - F1 Telemetry Manager

## Overview

Implementation of a voice chat system (STT + LLM + TTS) for hands-free interaction with the F1 analysis assistant. Users can toggle between traditional text chat and voice mode where they speak and receive spoken responses.

## Implementation Status

**Status**: ✅ Complete (v1.0 - November 2024)

Voice chat is functional with text-based status indicators. Animated orb visualization is planned for v2.0.

---

## Core Features (v1.0 - Implemented)

- ✅ **Speech-to-Text (STT)**: Voice to text conversion using Whisper
- ✅ **Text-to-Speech (TTS)**: Voice synthesis for assistant responses
- ✅ **Simple Status Indicator**: Text + emoji status display
- ✅ **Dual Mode**: Toggle button to switch between text and voice chat
- ✅ **Audio Recording**: Microphone capture from user
- ✅ **Response Playback**: Synthesized audio from assistant

## v2.0 Planned Features

- ❌ **Animated Orb Visualization**: ChatGPT-style animated orb reacting to audio
- ❌ **Real-time Audio Reactivity**: Visual feedback synchronized with audio levels
- ❌ **Enhanced Voice Selection**: Multiple voice options with customization

---

## Architecture

### High-Level Flow

```
User speaks
    ↓
[Audio Capture] → Browser captures microphone
    ↓
[Send to Backend] → POST /api/v1/voice/transcribe
    ↓
[STT - Whisper] → Convert audio to text
    ↓
[LLM Processing] → Process with LM Studio (same as text chat)
    ↓
[TTS - pyttsx3] → Convert LLM response to audio
    ↓
[Send to Frontend] → Return audio file
    ↓
[Audio Playback] → Play audio with status indicator
```

### Technology Stack

#### Backend
- **STT**: OpenAI Whisper (local inference)
  - `openai-whisper` library
  - Model: `medium` (balance of speed and accuracy)
  - Runs locally (no API calls)
  - First run downloads model (~1.5GB for medium)

- **TTS**: pyttsx3
  - Instant synthesis (no delay)
  - Offline (no API calls)
  - Lightweight (no heavy models)
  - Cross-platform (Windows SAPI, macOS NSSpeechSynthesizer, Linux eSpeak)
  - Configuration: Adjustable rate, volume, voice selection

- **Audio Processing**:
  - `pydub` for audio format conversion
  - `soundfile` for audio I/O
  - `numpy` for audio processing

#### Frontend
- **Audio Recording**:
  - `streamlit-webrtc` for WebRTC audio capture
  - JavaScript AudioRecorder API fallback

- **Audio Playback**:
  - HTML5 `<audio>` element
  - Streamlit `st.audio()` component

- **Status Visualization** (v1.0):
  - Simple text-based status with emojis
  - States: Idle, Listening, Processing, Speaking

---

## File Structure

### Backend Files (Complete - v1.0)

```
backend/
├── services/voice/
│   ├── stt_service.py          ✅ Whisper STT implementation
│   ├── tts_service.py          ✅ pyttsx3 TTS implementation
│   └── audio_processor.py      ✅ Audio utilities
├── api/v1/endpoints/
│   └── voice.py                ✅ Voice endpoints
├── models/
│   └── voice_models.py         ✅ Pydantic models
└── core/
    └── voice_config.py         ✅ Voice configuration
```

### Frontend Files (Complete - v1.0)

```
frontend/
├── components/voice/
│   ├── voice_chat_interface.py  ✅ Main voice interface
│   ├── voice_status.py          ✅ Simple status indicator
│   ├── recording_controls.py    ✅ Record button controls
│   ├── voice_transcript.py      ✅ Transcript display
│   └── audio_recorder.py        ✅ Audio capture
├── services/
│   └── voice_service.py         ✅ Voice API client
├── utils/
│   └── voice_state.py           ✅ State management
└── pages/
    └── chat.py                  ✅ Modified for voice mode
```

---

## API Endpoints

### 1. POST `/api/v1/voice/transcribe`
Transcribe audio to text.

**Request**: Multipart form with audio file (webm, wav, mp3)

**Response**:
```json
{
  "text": "transcribed text",
  "duration": 5.2,
  "language": "en"
}
```

### 2. POST `/api/v1/voice/voice-chat`
Full voice chat flow: STT → LLM → TTS

**Request**: Audio file

**Response**:
```json
{
  "transcript": "user question",
  "response_text": "assistant response",
  "audio_url": "/api/v1/voice/audio/{session_id}.wav",
  "processing_time": 3.5
}
```

### 3. POST `/api/v1/voice/synthesize`
Text-to-speech synthesis.

**Request**:
```json
{
  "text": "text to synthesize",
  "rate": 175,
  "volume": 0.9
}
```

**Response**: Audio file (streaming)

---

## User Experience Flow

```
1. User opens chat page
   ↓
2. Sees [Text Mode] [Voice Mode] toggle
   ↓
3. Clicks "Voice Mode"
   ↓
4. Interface shows:
   - Status indicator (emoji + text)
   - Recording button
   - Transcript area
   ↓
5. User clicks "Start Recording"
   ↓
6. Status: "Listening..."
   - Recording indicator active
   ↓
7. User speaks question
   ↓
8. User clicks "Stop Recording"
   ↓
9. Status: "Processing..."
   - Audio sent to backend
   ↓
10. Backend processes (STT → LLM → TTS)
    ↓
11. Response received:
    - Transcript updated
    - Status: "Speaking..."
    - Audio plays automatically
    ↓
12. Playback completes:
    - Status: "Idle"
    - Ready for next question
```

---

## Configuration

### Whisper Configuration
```python
WHISPER_MODEL = "medium"  # base, small, medium, large
WHISPER_LANGUAGE = "en"
WHISPER_DEVICE = "cpu"  # or "cuda" if GPU available
```

### TTS Configuration (pyttsx3)
```python
TTS_ENGINE = "pyttsx3"
TTS_RATE = 175          # Speech rate (words per minute)
TTS_VOLUME = 0.9        # Volume (0.0 to 1.0)
TTS_VOICE_ID = None     # None = system default
```

### Audio Processing
```python
AUDIO_SAMPLE_RATE = 16000
AUDIO_FORMAT = "wav"
MAX_AUDIO_DURATION = 120  # seconds
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25MB
```

---

## Performance Considerations

### Whisper Model Selection
- `tiny`: Ultra-fast, lower accuracy (~32ms per second of audio)
- `base`: Fast, good accuracy (~70ms per second)
- `small`: Balanced (~200ms per second)
- `medium`: High accuracy, moderate speed (~500ms per second) **← v1.0 Implementation**
- `large`: Best accuracy, slowest (~1000ms per second)

### TTS with pyttsx3
- Instant synthesis (~0ms delay)
- Offline (no API calls)
- Platform-specific voices:
  - Windows: Microsoft SAPI voices
  - macOS: NSSpeechSynthesizer
  - Linux: eSpeak

### Optimization Strategies
- Cache Whisper model in memory
- Use async/await for I/O operations
- Keep TTS engine instance alive
- Compress audio before transmission
- Limit audio duration

---

## Implementation Summary

| Component | Status | Technology |
|-----------|--------|-----------|
| Speech-to-Text | ✅ Complete | Whisper medium |
| Text-to-Speech | ✅ Complete | pyttsx3 |
| Voice API endpoints | ✅ Complete | FastAPI |
| Audio recording | ✅ Complete | streamlit-webrtc |
| Status indicator | ✅ Complete | Text + emoji |
| Mode toggle | ✅ Complete | Streamlit buttons |
| Transcript display | ✅ Complete | Streamlit UI |
| Audio playback | ✅ Complete | st.audio() |
| State management | ✅ Complete | Session state |

---

## v2.0 Planned Features

### Animated Orb Visualization

**Implementation Options**:

1. **Custom Streamlit Component with React**
   - Use React Audio Visualizers library
   - Full interactivity within Streamlit
   - Requires building custom component

2. **Three.js Embedded HTML**
   - 3D orb with audio reactivity
   - Embed via `st.components.html()`
   - Simpler than custom component

3. **Separate React/Next.js App**
   - Best performance and flexibility
   - Requires maintaining two frontends
   - Shared backend APIs

**Orb States**:
- **Idle**: Gentle pulsing animation
- **Listening**: Reactive to microphone input
- **Processing**: Spinning/morphing animation
- **Speaking**: Reactive to audio output

### Additional v2.0 Features
- Voice selection (multiple voices)
- Speech rate customization
- Volume control
- Auto-play toggle
- Voice command shortcuts
- Conversation export with audio

---

## Dependencies

### Backend
```txt
openai-whisper>=20231117
pyttsx3>=2.90
pydub>=0.25.1
soundfile>=0.12.1
numpy>=1.24.0
aiofiles>=23.0.0
```

### Frontend
```txt
streamlit-webrtc>=0.45.0
httpx>=0.24.0
av>=10.0.0
```

---

## Testing Strategy

### Backend Tests
- Audio transcription with sample files
- Different audio formats (wav, mp3, webm)
- TTS synthesis with various texts
- Full STT → LLM → TTS flow
- Error handling (corrupted audio, too long)

### Frontend Tests
- Voice interface rendering
- Audio recorder functionality
- Mode switching (text ↔ voice)
- Transcript display
- Audio playback

### Manual Testing Checklist
- [ ] Microphone access works
- [ ] Audio recording starts/stops correctly
- [ ] Transcription accuracy is acceptable
- [ ] LLM responses are contextually relevant
- [ ] TTS audio plays automatically
- [ ] Transcript displays correctly
- [ ] Can switch between modes
- [ ] Works on different browsers
- [ ] Error messages display appropriately

---

## Error Handling

### Common Errors and Solutions

1. **Microphone Access Denied**
   - Show clear error message
   - Provide browser settings instructions

2. **Whisper Model Not Loaded**
   - Show download progress on first run
   - Fallback to smaller model if needed

3. **Audio Format Not Supported**
   - Auto-convert to supported format
   - Show error if conversion fails

4. **TTS Synthesis Failed**
   - Fallback to text-only response
   - Log error for debugging

5. **Long Processing Time**
   - Show processing spinner
   - Timeout after 60 seconds

---

**Developed for**: F1 Telemetry Manager
**Version**: 1.0
**Status**: Complete (November 2024)
**v2.0 Planned**: Animated orb visualization with audio reactivity
