# Voice Chat Backend Setup

Backend implementation for voice chat with STT (Whisper) and TTS (pyttsx3).

## 📦 Installation

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**Note**: First run of Whisper will download the model (~140MB for `base`).

### 2. Verify Installation

```bash
python verify_dependencies.py
```

Expected output:
```
🔍 F1 Telemetry Manager - Dependency Check
==================================================

📦 Core Dependencies:
  ✅ fastapi              v0.109.0
  ✅ numpy                v1.26.4
  ✅ pandas               v2.2.0
  ✅ fastf1               v3.4.0

🎤 Voice Dependencies:
  ✅ openai-whisper       v20231117
  ✅ pyttsx3              v2.90
  ✅ pydub                v0.25.1
  ✅ soundfile            v0.12.1
  ✅ aiofiles             v23.2.1

🎉 All dependencies installed successfully!
```

**If you see errors**: Check [DEPENDENCIES_COMPATIBILITY.md](DEPENDENCIES_COMPATIBILITY.md)

### 2. Test Individual Services

#### Test TTS (Text-to-Speech)

```bash
python services/voice/tts_service.py
```

Expected output:
```
🔊 TTS Service Test
==================================================

📋 Available voices:
  1. Microsoft David Desktop
     ID: HKEY_LOCAL_MACHINE\...

🎤 Generating test audio...
✅ Generated XXXXX bytes of audio
💾 Saved to test_tts.wav
```

Play the generated `test_tts.wav` to verify it works.

#### Test STT (Speech-to-Text)

```bash
python services/voice/stt_service.py
```

Expected output:
```
🎤 STT Service Test
==================================================
Loading Whisper model 'base'...
✅ Whisper model 'base' loaded successfully

📊 Model Info:
  model_name: base
  device: cpu
  loaded: True

✅ STT Service ready!
```

## 🎤 Installing Male Voices (Optional)

If you want to use a male voice (David or Mark) instead of the default female voice:

### 1. Install Windows Language Pack

1. Go to **Settings > Time & Language > Language**
2. Add **English (United States)** if not already added
3. Click on it and select **Options**
4. Under **Speech**, download **Text-to-speech voices**
5. Wait for the download to complete

### 2. Restart Windows

**IMPORTANT**: You must restart Windows for the new voices to be available to pyttsx3.

### 3. Verify New Voices

After restarting, test the TTS service:

```bash
python services/voice/tts_service.py
```

You should now see David or Mark in the list:
```
📋 Available voices:
  1. Microsoft David Desktop - English (United States)  ← NEW
  2. Microsoft Mark Desktop - English (United States)   ← NEW
  3. Microsoft Zira Desktop
```

### 4. Test the New Voice

The service will automatically use the first available voice. To test:

```bash
curl -X POST http://localhost:8000/api/v1/voice/synthesize \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"Hello, I am Caronte, your F1 assistant\"}" \
  --output test_voice.wav

start test_voice.wav
```

## 🚀 Start Backend Server

```bash
# From project root
cd backend
uvicorn main:app --reload --port 8000
```

Server will start at: `http://localhost:8000`

## 🧪 Test API Endpoints

### 1. Health Check

```bash
curl http://localhost:8000/api/v1/voice/health
```

Expected response:
```json
{
  "status": "healthy",
  "stt_ready": true,
  "tts_ready": true,
  "stt_model": "base"
}
```

### 2. Get Available Voices

```bash
curl http://localhost:8000/api/v1/voice/voices
```

### 3. Text-to-Speech (TTS)

```bash
curl -X POST http://localhost:8000/api/v1/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Caronte, your F1 assistant"}' \
  --output test_speech.wav
```

Play the audio:
- **Windows**: `start test_speech.wav`
- **Mac**: `open test_speech.wav`
- **Linux**: `xdg-open test_speech.wav`

### 4. Speech-to-Text (STT)

Record a test audio file (e.g., `test_question.wav`) and:

```bash
curl -X POST http://localhost:8000/api/v1/voice/transcribe \
  -F "audio=@test_question.wav"
```

Expected response:
```json
{
  "text": "Why did Verstappen pit on lap 15?",
  "language": "en",
  "duration": 3.5
}
```

### 5. Full Voice Chat Flow

```bash
curl -X POST http://localhost:8000/api/v1/voice/voice-chat \
  -F "audio=@test_question.wav"
```

Expected response:
```json
{
  "transcript": "Why did Verstappen pit on lap 15?",
  "response_text": "You asked: Why did Verstappen pit...",
  "audio_base64": "UklGRiQAAABXQVZFZm10...",
  "processing_time": 3.2
}
```

## 📊 API Documentation

Interactive API docs available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🐛 Troubleshooting

### Issue: pyttsx3 not working

**Windows**: Make sure SAPI is installed (comes with Windows)

**Mac**: Install `pyobjc`:
```bash
pip install pyobjc
```

**Linux**: Install espeak:
```bash
sudo apt-get install espeak
```

### Issue: Whisper model download fails

Download manually:
```python
import whisper
model = whisper.load_model("base")
```

### Issue: Audio file format not supported

Convert to WAV first:
```bash
ffmpeg -i input.mp3 output.wav
```

Or use pydub in Python:
```python
from pydub import AudioSegment
audio = AudioSegment.from_file("input.mp3")
audio.export("output.wav", format="wav")
```

## 📁 File Structure

```
backend/
├── services/voice/
│   ├── __init__.py
│   ├── stt_service.py          # Whisper STT
│   ├── tts_service.py          # pyttsx3 TTS
│   └── audio_processor.py      # Audio utilities
├── api/v1/endpoints/
│   └── voice.py                # API endpoints
├── models/
│   └── voice_models.py         # Pydantic models
├── core/
│   └── voice_config.py         # Configuration
└── temp/audio/                 # Temporary audio files
```

## 🎯 Next Steps

1. ✅ Backend is ready
2. ⏭️ **Next**: Implement frontend (Streamlit)
3. ⏭️ **After**: Integrate with LM Studio for LLM responses
4. ⏭️ **Future**: Add ChatGPT-style orb visualization

## 🔗 Related Documentation

- [Voice Chat Implementation Plan](../docs/VOICE_CHAT_IMPLEMENTATION_PLAN.md)
- [Main README](../README.md)
