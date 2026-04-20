# Voice Chat Frontend Setup

Frontend implementation for voice chat in Streamlit with dual-mode support.

## 📦 Installation

### 1. Install Dependencies

```bash
cd frontend
pip install -r requirements.txt
```

**New dependency installed:**
- `audio-recorder-streamlit==0.0.10` - Audio recording component for Streamlit

### 2. Verify Installation

```bash
python -c "import audio_recorder_streamlit; print('✅ Audio recorder installed')"
```

## 🎨 Architecture

### New Files Created

```
frontend/
├── services/
│   └── voice_api.py              # Voice API client (NEW)
├── utils/
│   └── audio_utils.py             # Audio utilities (NEW)
├── components/
│   └── voice/                     # Voice components (NEW)
│       ├── __init__.py
│       ├── voice_input.py         # Voice input UI
│       └── voice_chat.py          # Voice chat interface
└── pages/
    └── chat.py                    # Modified: added voice mode toggle
```

### Modified Files

- `frontend/pages/chat.py` - Added voice/text mode toggle
- `frontend/requirements.txt` - Added audio-recorder-streamlit

## 🚀 Usage

### Start Frontend

```bash
cd frontend
streamlit run app/main.py
```

Access at: `http://localhost:8501`

### Using Voice Chat

1. Navigate to the **Chat** page
2. Toggle to **🎤 Voice Chat** mode (radio button at top)
3. Click the **microphone** button to start recording
4. Speak your question
5. Click again to **stop recording**
6. Click **🚀 Send Voice Message**
7. Wait for transcription → AI processing → speech synthesis
8. Audio response will auto-play

## 🎯 Features

### Voice Chat Mode
- ✅ Audio recording with visual feedback
- ✅ Real-time transcription display
- ✅ AI response generation
- ✅ Text-to-speech synthesis
- ✅ Audio playback controls
- ✅ Voice chat history
- ✅ Processing time display
- ✅ Clear history option

### Text Chat Mode
- ✅ Traditional text chat (original functionality)
- ✅ Multimodal support (text + images)
- ✅ Chat history management
- ✅ Context-aware responses

## 📋 Component Details

### 1. `voice_api.py` (Services)

API client for backend voice endpoints:

```python
# Functions available:
- check_voice_health() → Dict        # Health check
- get_available_voices() → List      # List TTS voices
- transcribe_audio() → Dict          # STT (audio → text)
- synthesize_speech() → bytes        # TTS (text → audio)
- voice_chat() → Dict                # Full flow
- decode_audio_base64() → bytes      # Base64 decoder
```

### 2. `audio_utils.py` (Utils)

Audio processing utilities:

```python
# Functions available:
- validate_audio_file()              # Validate format/size
- encode_audio_to_base64()           # Encode audio
- decode_audio_from_base64()         # Decode audio
- get_audio_duration_estimate()      # Estimate duration
- format_duration()                  # Format time string
- create_audio_data_url()            # Create data URL
- get_mime_type_from_filename()      # Get MIME type
```

### 3. `voice_input.py` (Component)

Voice input UI component:

```python
# Functions:
- render_voice_input()               # Main input widget
- render_voice_status()              # Status indicator
- render_voice_controls()            # Control buttons
```

### 4. `voice_chat.py` (Component)

Main voice chat interface:

```python
# Functions:
- initialize_voice_state()           # Initialize state
- add_voice_exchange()               # Add to history
- render_voice_exchange()            # Render single exchange
- render_voice_history()             # Render full history
- handle_voice_message()             # Process voice message
- check_voice_services()             # Check services
- render_voice_chat()                # Main render function
```

### 5. Modified `chat.py`

Added dual-mode support:

```python
# New functions:
- initialize_chat_mode()             # Initialize mode state
- render_header()                    # Header with toggle (modified)
- render_chat_page()                 # Main page (modified)
```

## 🔧 Code Quality

All code follows clean code principles:

- ✅ **Single Responsibility**: Each function does one thing
- ✅ **Small Functions**: 15-30 lines max
- ✅ **Type Hints**: All functions have type annotations
- ✅ **Docstrings**: Complete documentation
- ✅ **Error Handling**: Graceful error management
- ✅ **Consistent Style**: Follows existing codebase patterns

## 🧪 Testing the Frontend

### 1. Test Voice Services Connection

Navigate to Voice Chat mode. You should see:
- ✅ Green status if services are ready
- ❌ Error message if backend is not running

### 2. Test Audio Recording

Click the microphone:
- 🔴 Red = Recording
- 🔵 Blue = Ready
- Shows recording size in bytes

### 3. Test Voice Chat Flow

1. Record a question: "What was Verstappen's fastest lap time?"
2. Should see:
   - "🔄 Transcribing audio..."
   - "🤖 AI is thinking..."
   - "🔊 Generating speech..."
   - "✅ Voice message processed!"
3. Audio response auto-plays
4. Exchange appears in history

### 4. Test Mode Toggle

Switch between modes:
- 💬 Text Chat → Original chat interface
- 🎤 Voice Chat → Voice interface
- State is preserved when switching

## 🐛 Troubleshooting

### Issue: "audio-recorder-streamlit not found"

```bash
pip install audio-recorder-streamlit==0.0.10
```

### Issue: Microphone not working

**Browser permissions:**
1. Check browser allows microphone access
2. Allow permissions for localhost:8501

**Windows:**
1. Settings > Privacy > Microphone
2. Enable microphone for browsers

### Issue: "Voice services not available"

Ensure backend is running:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Check health endpoint:
```bash
curl http://localhost:8000/api/v1/voice/health
```

### Issue: No audio playback

Check browser audio settings:
- Volume not muted
- Audio output device selected
- Try different browser

## 📊 Performance

Expected response times:
- **Transcription**: 2-5 seconds (depends on audio length)
- **LLM Response**: 3-8 seconds (depends on question complexity)
- **Speech Synthesis**: 1-3 seconds (depends on text length)
- **Total**: ~6-16 seconds end-to-end

## 🎯 Next Steps

1. ✅ Frontend MVP complete
2. ⏭️ **Next**: Integrate with LM Studio in voice chat flow
3. ⏭️ **After**: Add ChatGPT-style orb visualization (Phase 3)
4. ⏭️ **Future**: Voice activity detection (VAD) for auto-stop
5. ⏭️ **Future**: Wake word detection ("Hey Caronte")

## 🔗 Related Documentation

- [Backend Voice Setup](../backend/VOICE_SETUP.md)
- [Backend Installation](../backend/INSTALL_INSTRUCTIONS.md)
- [Voice Implementation Plan](../docs/VOICE_CHAT_IMPLEMENTATION_PLAN.md)

## ✅ Summary

**Frontend voice chat is now complete!**

- ✅ 5 new files created
- ✅ 2 files modified
- ✅ Clean code principles applied
- ✅ Full dual-mode support (text + voice)
- ✅ Ready for testing

**To use:**
1. Install dependencies: `pip install -r requirements.txt`
2. Start backend: `uvicorn main:app --reload`
3. Start frontend: `streamlit run app/main.py`
4. Navigate to Chat page
5. Toggle to 🎤 Voice Chat mode
6. Start talking!
