# Voice Chat Implementation Plan - F1 Telemetry Manager

## Overview

Implementación de un sistema de chat por voz (STT + LLM + TTS) con visualización de audio tipo orbe animado. El usuario podrá alternar entre el chat de texto tradicional y un modo completamente por voz donde habla y recibe respuestas habladas.

## Características Principales

### Funcionalidades Core
- ✅ **Speech-to-Text (STT)**: Conversión de voz a texto usando Whisper
- ✅ **Text-to-Speech (TTS)**: Síntesis de voz para respuestas del asistente
- ✅ **Visualización de Audio**: Orbe animado que reacciona al audio (input y output)
- ✅ **Modo Dual**: Botón para alternar entre chat de texto y chat de voz
- ✅ **Grabación de Audio**: Captura del micrófono del usuario
- ✅ **Reproducción de Respuestas**: Audio sintetizado del asistente

### Experiencia de Usuario

```
┌─────────────────────────────────────────────────────┐
│ 🏎️ F1 STRATEGY ASSISTANT CHAT                       │
├─────────────────────────────────────────────────────┤
│ [💬 Text Mode] [🎤 Voice Mode] ← Toggle             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │                                               │ │
│  │              🌐 Animated Orb                  │ │
│  │         (pulsating with audio)                │ │
│  │                                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [Status: Listening... / Processing... / Speaking]  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🎤 Hold to speak                            │   │
│  │ 🔴 [Recording Button]                       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Transcript (optional):                             │
│  You: "Why did Verstappen pit on lap 15?"          │
│  Assistant: "Verstappen pitted on lap 15..."       │
└─────────────────────────────────────────────────────┘
```

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
[TTS] → Convert LLM response to audio
    ↓
[Send to Frontend] → Return audio file/stream
    ↓
[Audio Playback] → Play audio with orb animation
```

### Technology Stack (MVP First Approach)

#### Backend
- **STT**: OpenAI Whisper (local inference)
  - `openai-whisper` library
  - Model: `base` or `small` for speed (or `medium`/`large` for accuracy)
  - Runs locally (no API calls)
  - **Note**: First run downloads model (~140MB for `base`, ~460MB for `small`)

- **TTS**: **pyttsx3** (Primary choice)
  - **Why pyttsx3**:
    - ✅ **Instant synthesis** (no delay)
    - ✅ **Offline** (no API calls)
    - ✅ **Lightweight** (no heavy models)
    - ✅ **Decent voice quality** for conversational use
    - ✅ **Cross-platform** (Windows SAPI, macOS NSSpeechSynthesizer, Linux eSpeak)
  - `pip install pyttsx3`
  - Configuration: Adjustable rate, volume, voice selection

  - **Alternative Options** (for future enhancement):
    - **Coqui TTS**: Higher quality, but 2-5s synthesis time
    - **Google Cloud TTS / Azure TTS**: Best quality, requires API keys

- **Audio Processing**:
  - `pydub` for audio format conversion
  - `soundfile` for audio I/O
  - `numpy` for audio processing

#### Frontend
- **Audio Recording**:
  - `streamlit-webrtc` for WebRTC audio capture
  - Or custom JavaScript component with `AudioRecorder` API

- **Audio Visualization** (Phase 2 - After MVP):
  - **MVP**: Simple status text ("Listening...", "Processing...", "Speaking...")
  - **Final**: ChatGPT-style animated orb or React Audio Visualizers integration
  - **Implementation options**:
    - **Option 1**: Streamlit custom component with React (embed React Audio Visualizers)
    - **Option 2**: Custom HTML/Canvas/Three.js component (replicate ChatGPT style)
    - **Option 3**: Separate React/Next.js page for voice chat (if needed)

- **Audio Playback**:
  - HTML5 `<audio>` element
  - Streamlit `st.audio()` component

---

## Detailed File Structure

### Backend Files

#### **NEW FILES TO CREATE**

1. **`backend/services/voice/stt_service.py`**
   - Whisper integration for speech-to-text
   ```python
   import whisper
   from typing import Optional

   class STTService:
       def __init__(self, model_name: str = "base"):
           """Initialize Whisper model."""
           self.model = whisper.load_model(model_name)

       def transcribe_audio(
           self,
           audio_file: bytes,
           language: str = "en"
       ) -> dict:
           """
           Transcribe audio to text.

           Returns:
               {
                   "text": "transcribed text",
                   "language": "en",
                   "duration": 5.2
               }
           """
   ```

2. **`backend/services/voice/tts_service.py`**
   - Text-to-speech synthesis using pyttsx3
   ```python
   import pyttsx3
   import io
   from typing import Optional
   import tempfile
   import os

   class TTSService:
       def __init__(self):
           """Initialize pyttsx3 TTS engine."""
           self.engine = pyttsx3.init()
           self._configure_engine()

       def _configure_engine(self):
           """Configure voice properties."""
           # Set properties
           self.engine.setProperty('rate', 175)    # Speed (words per minute)
           self.engine.setProperty('volume', 0.9)  # Volume (0.0 to 1.0)

           # Optional: Set voice (list available voices)
           voices = self.engine.getProperty('voices')
           # self.engine.setProperty('voice', voices[0].id)  # Select voice

       def synthesize_speech(
           self,
           text: str,
           rate: Optional[int] = None,
           volume: Optional[float] = None
       ) -> bytes:
           """
           Convert text to speech audio.

           Args:
               text: Text to synthesize
               rate: Speech rate (words per minute), default 175
               volume: Volume level (0.0 to 1.0), default 0.9

           Returns:
               Audio bytes in WAV format
           """
           # Adjust properties if specified
           if rate:
               self.engine.setProperty('rate', rate)
           if volume:
               self.engine.setProperty('volume', volume)

           # Save to temporary file
           with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
               tmp_path = tmp_file.name

           try:
               self.engine.save_to_file(text, tmp_path)
               self.engine.runAndWait()

               # Read file as bytes
               with open(tmp_path, 'rb') as f:
                   audio_bytes = f.read()

               return audio_bytes
           finally:
               # Clean up temp file
               if os.path.exists(tmp_path):
                   os.remove(tmp_path)

       def get_available_voices(self) -> list:
           """Get list of available voices."""
           voices = self.engine.getProperty('voices')
           return [{'id': v.id, 'name': v.name, 'languages': v.languages} for v in voices]

       def set_voice(self, voice_id: str):
           """Set voice by ID."""
           self.engine.setProperty('voice', voice_id)
   ```

3. **`backend/services/voice/audio_processor.py`**
   - Audio format conversion and processing
   ```python
   from pydub import AudioSegment
   import io

   class AudioProcessor:
       @staticmethod
       def convert_audio_format(
           audio_bytes: bytes,
           from_format: str,
           to_format: str = "wav"
       ) -> bytes:
           """Convert audio between formats."""

       @staticmethod
       def extract_audio_metadata(audio_bytes: bytes) -> dict:
           """Extract duration, sample rate, channels, etc."""

       @staticmethod
       def normalize_audio(audio_bytes: bytes) -> bytes:
           """Normalize audio volume."""
   ```

4. **`backend/api/v1/endpoints/voice.py`**
   - Voice chat API endpoints
   ```python
   from fastapi import APIRouter, UploadFile, File
   from fastapi.responses import StreamingResponse

   router = APIRouter()

   @router.post("/transcribe")
   async def transcribe_audio(audio: UploadFile = File(...)):
       """
       Transcribe audio to text.

       Request: Multipart form with audio file (webm, wav, mp3)
       Response: {"text": "...", "duration": 5.2}
       """

   @router.post("/voice-chat")
   async def voice_chat(audio: UploadFile = File(...)):
       """
       Full voice chat flow: STT → LLM → TTS

       Request: Audio file
       Response: {
           "transcript": "user question",
           "response_text": "assistant response",
           "audio_url": "/api/v1/voice/audio/{session_id}.wav"
       }
       """

   @router.post("/synthesize")
   async def synthesize_speech(request: TTSRequest):
       """
       Text-to-speech synthesis.

       Request: {"text": "...", "speed": 1.0}
       Response: Audio file (streaming)
       """

   @router.get("/audio/{audio_id}")
   async def get_audio_file(audio_id: str):
       """Retrieve generated audio file."""
   ```

5. **`backend/models/voice_models.py`**
   - Pydantic models for voice endpoints
   ```python
   from pydantic import BaseModel
   from typing import Optional

   class TranscriptionResponse(BaseModel):
       text: str
       language: str
       duration: float
       confidence: Optional[float] = None

   class TTSRequest(BaseModel):
       text: str
       speed: float = 1.0
       voice: Optional[str] = None

   class VoiceChatResponse(BaseModel):
       transcript: str
       response_text: str
       audio_url: str
       processing_time: float
   ```

6. **`backend/core/voice_config.py`**
   - Configuration for voice services
   ```python
   # Whisper Configuration
   WHISPER_MODEL = "base"  # base, small, medium, large
   WHISPER_LANGUAGE = "en"
   WHISPER_DEVICE = "cpu"  # or "cuda" if GPU available

   # TTS Configuration (pyttsx3)
   TTS_ENGINE = "pyttsx3"
   TTS_RATE = 175          # Speech rate (words per minute), default ~150-200
   TTS_VOLUME = 0.9        # Volume (0.0 to 1.0)
   TTS_VOICE_ID = None     # None = system default, or specific voice ID

   # Audio Processing
   AUDIO_SAMPLE_RATE = 16000
   AUDIO_FORMAT = "wav"
   MAX_AUDIO_DURATION = 120  # seconds
   MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25MB

   # Temporary Storage
   AUDIO_TEMP_DIR = "backend/temp/audio"
   AUDIO_CLEANUP_INTERVAL = 3600  # cleanup old files every hour
   ```

#### **FILES TO MODIFY**

1. **`backend/main.py`**
   - Include voice router
   ```python
   from api.v1.endpoints import voice

   app.include_router(
       voice.router,
       prefix="/api/v1/voice",
       tags=["voice"]
   )
   ```

2. **`backend/requirements.txt`**
   - Add voice dependencies
   ```txt
   openai-whisper>=20231117
   pyttsx3>=2.90
   pydub>=0.25.1
   soundfile>=0.12.1
   numpy>=1.24.0
   aiofiles>=23.0.0
   ```

---

### Frontend Files

#### **NEW FILES TO CREATE**

1. **`frontend/components/voice/voice_chat_interface.py`**
   - Main voice chat interface component (MVP - Simple version without orb)
   ```python
   import streamlit as st
   from typing import Optional

   def render_voice_chat_interface():
       """
       Render the voice chat interface.

       MVP Components:
       - Mode toggle (text/voice)
       - Status indicator (text-based)
       - Recording button
       - Transcript display

       Phase 2 (Future):
       - Animated orb visualization (ChatGPT-style)
       """

       # Mode toggle
       col1, col2 = st.columns(2)
       with col1:
           if st.button("💬 Text Mode", use_container_width=True):
               st.session_state.chat_mode = "text"
               st.rerun()
       with col2:
           if st.button("🎤 Voice Mode", use_container_width=True, type="primary"):
               st.session_state.chat_mode = "voice"
               st.rerun()

       st.markdown("---")

       # MVP: Simple status indicator (no orb yet)
       render_voice_status_simple()

       # Recording controls
       render_recording_controls()

       # Transcript display
       render_voice_transcript()
   ```

2. **`frontend/components/voice/voice_status.py`** (NEW - MVP Simple Version)
   - Simple text-based status indicator (MVP)
   ```python
   import streamlit as st

   def render_voice_status_simple():
       """
       Render simple text-based status indicator for MVP.

       Phase 2 will replace this with animated orb visualization.
       """
       status = st.session_state.get('voice_status', 'idle')

       status_config = {
           'idle': {
               'emoji': '⚪',
               'text': 'Ready to listen',
               'color': '#9ca3af'
           },
           'listening': {
               'emoji': '🔴',
               'text': 'Listening...',
               'color': '#ef4444'
           },
           'processing': {
               'emoji': '⚙️',
               'text': 'Processing your question...',
               'color': '#fbbf24'
           },
           'speaking': {
               'emoji': '🔊',
               'text': 'Speaking...',
               'color': '#34d399'
           }
       }

       config = status_config.get(status, status_config['idle'])

       st.markdown(
           f"""
           <div style='
               text-align: center;
               padding: 60px 20px;
               background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
               border-radius: 20px;
               margin: 20px 0;
           '>
               <div style='font-size: 80px; margin-bottom: 20px;'>
                   {config['emoji']}
               </div>
               <div style='
                   font-size: 24px;
                   color: {config['color']};
                   font-weight: 600;
               '>
                   {config['text']}
               </div>
           </div>
           """,
           unsafe_allow_html=True
       )

   # NOTE: audio_visualizer.py will be created in Phase 2 for ChatGPT-style orb
   ```

3. **`frontend/components/voice/audio_visualizer.py`** (PHASE 2 - After MVP)
   - ChatGPT-style animated orb visualization
   - Will be implemented after MVP is working
   - Options:
     - Custom Streamlit component with React (can embed React Audio Visualizers)
     - HTML/Canvas/Three.js custom component
     - Or separate React page for voice chat
   ```python
   # This file will be created in Phase 2
   # See "Phase 2: Orb Visualization" section below for implementation details
   ```

4. **`frontend/components/voice/audio_recorder.py`**
   - Audio recording component using streamlit-webrtc
   ```python
   import streamlit as st
   from streamlit_webrtc import webrtc_streamer, WebRtcMode
   import av
   import io

   def render_audio_recorder():
       """
       Audio recorder component using WebRTC.

       Returns:
           bytes: Recorded audio data
       """

       # Alternative: JavaScript-based recorder
       # This is simpler for button-based recording
       recorder_html = """
       <script>
       let mediaRecorder;
       let audioChunks = [];

       async function startRecording() {
           const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
           mediaRecorder = new MediaRecorder(stream);

           mediaRecorder.ondataavailable = (event) => {
               audioChunks.push(event.data);
           };

           mediaRecorder.onstop = async () => {
               const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
               const base64 = await blobToBase64(audioBlob);
               // Send to Streamlit
               window.parent.postMessage({ type: 'audio', data: base64 }, '*');
               audioChunks = [];
           };

           mediaRecorder.start();
       }

       function stopRecording() {
           if (mediaRecorder && mediaRecorder.state === 'recording') {
               mediaRecorder.stop();
           }
       }

       function blobToBase64(blob) {
           return new Promise((resolve, reject) => {
               const reader = new FileReader();
               reader.onloadend = () => resolve(reader.result.split(',')[1]);
               reader.onerror = reject;
               reader.readAsDataURL(blob);
           });
       }
       </script>
       """
   ```

5. **`frontend/components/voice/recording_controls.py`**
   - Recording button and controls
   ```python
   import streamlit as st

   def render_recording_controls():
       """
       Render recording controls.

       Modes:
       - Push-to-talk: Hold button to record
       - Toggle: Click to start, click to stop
       """

       col1, col2, col3 = st.columns([1, 2, 1])

       with col2:
           if st.session_state.get('is_recording', False):
               if st.button("🔴 Stop Recording", use_container_width=True, type="primary"):
                   stop_recording()
           else:
               if st.button("🎤 Start Recording", use_container_width=True):
                   start_recording()

       # Instructions
       st.markdown(
           "<p style='text-align: center; color: #9ca3af;'>"
           "Click the button and speak your question"
           "</p>",
           unsafe_allow_html=True
       )

   def start_recording():
       """Start audio recording."""
       st.session_state.is_recording = True
       st.session_state.voice_status = "listening"
       st.rerun()

   def stop_recording():
       """Stop recording and process audio."""
       st.session_state.is_recording = False
       st.session_state.voice_status = "processing"
       # Trigger audio processing
       st.rerun()
   ```

6. **`frontend/components/voice/voice_transcript.py`**
   - Display conversation transcript
   ```python
   import streamlit as st

   def render_voice_transcript():
       """
       Display voice conversation transcript.
       Similar to chat history but optimized for voice.
       """

       st.markdown("### Transcript")

       if not st.session_state.get('voice_history', []):
           st.info("Start speaking to see the transcript here.")
           return

       # Scrollable container
       transcript_container = st.container()
       with transcript_container:
           for entry in st.session_state.voice_history:
               role = entry['role']
               text = entry['text']
               timestamp = entry.get('timestamp', '')

               if role == "user":
                   st.markdown(f"**🗣️ You:** {text}")
               else:
                   st.markdown(f"**🤖 Assistant:** {text}")

               st.markdown(f"<small>{timestamp}</small>", unsafe_allow_html=True)
               st.markdown("---")
   ```

7. **`frontend/services/voice_service.py`**
   - API communication for voice operations
   ```python
   import httpx
   from typing import Optional, Dict
   import base64

   BACKEND_URL = "http://localhost:8000"

   async def transcribe_audio(audio_bytes: bytes) -> Dict:
       """
       Transcribe audio to text.

       Args:
           audio_bytes: Audio file bytes

       Returns:
           {"text": "...", "duration": 5.2}
       """
       async with httpx.AsyncClient() as client:
           files = {'audio': ('recording.webm', audio_bytes, 'audio/webm')}
           response = await client.post(
               f"{BACKEND_URL}/api/v1/voice/transcribe",
               files=files,
               timeout=30.0
           )
           response.raise_for_status()
           return response.json()

   async def voice_chat(audio_bytes: bytes, context: Optional[Dict] = None) -> Dict:
       """
       Full voice chat: STT → LLM → TTS

       Args:
           audio_bytes: Recorded audio
           context: F1 telemetry context

       Returns:
           {
               "transcript": "user question",
               "response_text": "assistant response",
               "audio_url": "/api/v1/voice/audio/abc123.wav"
           }
       """
       async with httpx.AsyncClient() as client:
           files = {'audio': ('recording.webm', audio_bytes, 'audio/webm')}
           data = {'context': context} if context else {}

           response = await client.post(
               f"{BACKEND_URL}/api/v1/voice/voice-chat",
               files=files,
               data=data,
               timeout=120.0  # Longer timeout for full processing
           )
           response.raise_for_status()
           return response.json()

   async def synthesize_speech(text: str, speed: float = 1.0) -> bytes:
       """
       Text-to-speech synthesis.

       Args:
           text: Text to synthesize
           speed: Speech speed multiplier

       Returns:
           Audio bytes
       """
       async with httpx.AsyncClient() as client:
           response = await client.post(
               f"{BACKEND_URL}/api/v1/voice/synthesize",
               json={"text": text, "speed": speed},
               timeout=60.0
           )
           response.raise_for_status()
           return response.content

   def get_audio_url(audio_id: str) -> str:
       """Get URL for audio file."""
       return f"{BACKEND_URL}/api/v1/voice/audio/{audio_id}"
   ```

8. **`frontend/utils/voice_state.py`**
   - Voice chat state management
   ```python
   import streamlit as st
   from datetime import datetime
   from typing import Optional, Dict, List

   def initialize_voice_state():
       """Initialize voice chat session state."""

       if 'chat_mode' not in st.session_state:
           st.session_state.chat_mode = "text"  # text or voice

       if 'voice_history' not in st.session_state:
           st.session_state.voice_history = []

       if 'is_recording' not in st.session_state:
           st.session_state.is_recording = False

       if 'voice_status' not in st.session_state:
           st.session_state.voice_status = "idle"  # idle, listening, processing, speaking

       if 'show_voice_transcript' not in st.session_state:
           st.session_state.show_voice_transcript = True

       if 'current_audio_playback' not in st.session_state:
           st.session_state.current_audio_playback = None

   def add_voice_message(role: str, text: str):
       """Add a message to voice history."""
       message = {
           'role': role,
           'text': text,
           'timestamp': datetime.now().strftime("%H:%M:%S")
       }
       st.session_state.voice_history.append(message)

   def clear_voice_history():
       """Clear voice conversation history."""
       st.session_state.voice_history = []

   def set_voice_status(status: str):
       """
       Set current voice chat status.

       Args:
           status: idle, listening, processing, speaking
       """
       st.session_state.voice_status = status
   ```

#### **FILES TO MODIFY**

1. **`frontend/pages/chat.py`**
   - Add voice mode toggle and integration
   ```python
   # Add imports
   from components.voice.voice_chat_interface import render_voice_chat_interface
   from utils.voice_state import initialize_voice_state

   def render_chat_page():
       # Initialize both text and voice state
       initialize_chat_state()
       initialize_voice_state()

       # Check mode and render appropriate interface
       if st.session_state.get('chat_mode', 'text') == 'voice':
           render_voice_chat_interface()
       else:
           # Existing text chat rendering
           render_header()
           # ... rest of text chat code
   ```

2. **`frontend/requirements.txt`**
   - Add dependencies
   ```
   streamlit-webrtc>=0.45.0
   httpx>=0.24.0
   ```

---

---

## Phase 2: ChatGPT-Style Orb Visualization

**Implementar DESPUÉS del MVP funcional**

Esta sección describe cómo implementar la animación del orbe al estilo ChatGPT o usando React Audio Visualizers.

### Opciones de Implementación

#### Opción 1: Custom Streamlit Component con React (Recomendado)

Permite usar React Audio Visualizers directamente dentro de Streamlit:

**Ventajas:**
- Puedes usar la librería React Audio Visualizers que mencionaste
- Alta calidad de visualización
- Reactivo al audio en tiempo real

**Desventajas:**
- Requiere crear un custom component de Streamlit
- Más complejo de configurar inicialmente

**Pasos:**
1. Crear directorio para componente: `frontend/components/voice/streamlit_audio_viz/`
2. Configurar proyecto React dentro del componente
3. Instalar React Audio Visualizers: `npm install react-audio-visualizers`
4. Crear componente que embeba el visualizador
5. Build y usar en Streamlit

Estructura:
```
frontend/components/voice/streamlit_audio_viz/
├── frontend/           # React app
│   ├── package.json
│   ├── src/
│   │   ├── AudioOrbVisualizer.tsx
│   │   └── index.tsx
│   └── public/
├── __init__.py        # Streamlit component wrapper
└── setup.py
```

**AudioOrbVisualizer.tsx** (usando React Audio Visualizers):
```tsx
import React, { useEffect, useState } from 'react';
import { AudioVisualizer } from 'react-audio-visualizers';

interface Props {
  status: 'idle' | 'listening' | 'processing' | 'speaking';
  audioStream?: MediaStream;
}

const AudioOrbVisualizer: React.FC<Props> = ({ status, audioStream }) => {
  return (
    <div style={{ width: '100%', height: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {audioStream && status === 'listening' && (
        <AudioVisualizer
          audio={audioStream}
          theme="orb"  // Or whichever theme you prefer
          colors={['#a78bfa', '#6d28d9']}
          width={300}
          height={300}
        />
      )}

      {status === 'idle' && (
        <div className="orb-idle">
          {/* Static or gently pulsing orb */}
        </div>
      )}

      {status === 'processing' && (
        <div className="orb-processing">
          {/* Spinning/morphing animation */}
        </div>
      )}

      {status === 'speaking' && audioStream && (
        <AudioVisualizer
          audio={audioStream}
          theme="orb"
          colors={['#34d399', '#10b981']}
          width={300}
          height={300}
        />
      )}
    </div>
  );
};

export default AudioOrbVisualizer;
```

**Uso en Streamlit:**
```python
# frontend/components/voice/audio_visualizer.py
import streamlit.components.v1 as components
from pathlib import Path

def render_audio_visualizer():
    component_path = Path(__file__).parent / "streamlit_audio_viz"
    audio_viz = components.declare_component(
        "audio_visualizer",
        path=str(component_path / "frontend" / "build")
    )

    status = st.session_state.get('voice_status', 'idle')

    return audio_viz(
        status=status,
        key="audio_orb"
    )
```

#### Opción 2: HTML/Canvas/Three.js Embedded (Más Simple)

Si no quieres crear un custom component completo, puedes embeber HTML/JS directamente:

### `frontend/components/voice/threejs_orb_visualizer.py`

```python
import streamlit.components.v1 as components
import streamlit as st

def render_threejs_orb_chatgpt_style():
    """
    Advanced 3D orb visualization using Three.js.
    Reacts to audio frequencies and creates smooth animations.
    """

    orb_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <style>
            body { margin: 0; background: transparent; }
            #canvas-container { width: 100%; height: 400px; }
        </style>
    </head>
    <body>
        <div id="canvas-container"></div>
        <script>
            // Three.js scene setup
            const container = document.getElementById('canvas-container');
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

            renderer.setSize(container.clientWidth, container.clientHeight);
            container.appendChild(renderer.domElement);

            // Create orb geometry
            const geometry = new THREE.IcosahedronGeometry(2, 4);
            const material = new THREE.MeshPhongMaterial({
                color: 0xa78bfa,
                emissive: 0x6d28d9,
                shininess: 100,
                wireframe: false
            });

            const orb = new THREE.Mesh(geometry, material);
            scene.add(orb);

            // Lighting
            const light1 = new THREE.PointLight(0xa78bfa, 1, 100);
            light1.position.set(10, 10, 10);
            scene.add(light1);

            const light2 = new THREE.AmbientLight(0x404040);
            scene.add(light2);

            camera.position.z = 5;

            // Animation
            let audioLevel = 0;
            let targetScale = 1;

            function animate() {
                requestAnimationFrame(animate);

                // Smooth scaling based on audio
                const scale = 1 + (audioLevel * 0.5);
                orb.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);

                // Rotation
                orb.rotation.x += 0.001;
                orb.rotation.y += 0.002;

                // Vertex displacement (audio reactive)
                const positions = geometry.attributes.position.array;
                const time = Date.now() * 0.001;

                for (let i = 0; i < positions.length; i += 3) {
                    const vertex = new THREE.Vector3(
                        positions[i],
                        positions[i + 1],
                        positions[i + 2]
                    );

                    vertex.normalize();
                    const displacement = Math.sin(time + vertex.x * 2) * 0.1 * audioLevel;

                    positions[i] += vertex.x * displacement;
                    positions[i + 1] += vertex.y * displacement;
                    positions[i + 2] += vertex.z * displacement;
                }

                geometry.attributes.position.needsUpdate = true;

                renderer.render(scene, camera);
            }

            animate();

            // Listen for audio level updates from parent
            window.addEventListener('message', (event) => {
                if (event.data.type === 'audioLevel') {
                    audioLevel = event.data.level; // 0 to 1
                }

                if (event.data.type === 'status') {
                    // Change color based on status
                    const status = event.data.status;
                    if (status === 'listening') {
                        material.color.setHex(0xa78bfa);
                    } else if (status === 'processing') {
                        material.color.setHex(0xfbbf24);
                    } else if (status === 'speaking') {
                        material.color.setHex(0x34d399);
                    } else {
                        material.color.setHex(0xa78bfa);
                    }
                }
            });

            // Handle resize
            window.addEventListener('resize', () => {
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            });
        </script>
    </body>
    </html>
    """

    components.html(orb_html, height=450)
```

#### Opción 3: Separate React App (Most Complex, Best Result)

Si quieres la mejor experiencia posible, puedes crear una página React/Next.js separada solo para el voice chat:

**Arquitectura:**
```
Frontend:
- Streamlit (main app) → Chat de texto, dashboard, etc.
- React/Next.js app (voice chat) → Página dedicada solo para chat de voz

Backend:
- FastAPI (shared) → Ambos frontends usan mismos endpoints
```

**Pros:**
- Mejor rendimiento para visualización
- Puedes usar React Audio Visualizers sin limitaciones
- Experiencia más fluida

**Cons:**
- Requiere mantener dos frontends
- Más complejo de configurar
- Necesitas routing entre apps

---

## Recomendación: Roadmap Revisado (MVP First)

### ✅ FASE 1: MVP Funcional (Sin Orb) - 2 Semanas

**Objetivo**: Chat de voz funcional con UX simple pero efectiva

#### Semana 1: Backend
- [ ] Implementar STT con Whisper
- [ ] Implementar TTS con pyttsx3
- [ ] Crear endpoints: `/transcribe`, `/synthesize`, `/voice-chat`
- [ ] Probar STT → LLM → TTS flow completo
- [ ] Testing básico

#### Semana 2: Frontend MVP
- [ ] Crear interfaz simple con toggle text/voice
- [ ] Implementar grabación de audio (MediaRecorder API o streamlit-webrtc)
- [ ] Status indicator simple (texto + emoji)
- [ ] Transcript display
- [ ] Reproducción de audio
- [ ] Integrar con backend
- [ ] Testing end-to-end

**Resultado**: Chat de voz completamente funcional, sin animación elaborada

---

### 🎨 FASE 2: Orb Visualization (ChatGPT-style) - 2-3 Semanas

**Objetivo**: Añadir visualización impresionante tipo ChatGPT

#### Semana 3-4: Decidir e Implementar Visualización
- [ ] Elegir opción de implementación (React component vs Three.js embedded)
- [ ] Si React component:
  - [ ] Crear custom Streamlit component
  - [ ] Configurar proyecto React
  - [ ] Instalar React Audio Visualizers
  - [ ] Implementar componente
  - [ ] Build y probar
- [ ] Si Three.js embedded:
  - [ ] Crear HTML/JS component con Three.js
  - [ ] Implementar orb geometry y animaciones
  - [ ] Conectar Web Audio API
  - [ ] Probar reactivity al audio

#### Semana 5: Integración y Polish
- [ ] Integrar orb en voice chat interface
- [ ] Reemplazar status simple por orb animado
- [ ] Ajustar colores según status (idle, listening, processing, speaking)
- [ ] Audio reactivity (input y output)
- [ ] Smooth transitions entre estados
- [ ] Testing cross-browser
- [ ] Optimización de rendimiento

---

### 🚀 FASE 3: Polish y Optimización - 1 Semana

#### Semana 6: Finalizar
- [ ] Testing completo (manual + automated)
- [ ] Fix bugs
- [ ] Optimización de rendimiento
- [ ] User settings (speech rate, volume, auto-play)
- [ ] Documentación
- [ ] Deploy

---

## MVP Implementation Details (Phase 1)

### Simplified Frontend Structure (MVP Only)

**Files needed for MVP:**
```
frontend/
  components/voice/
    ├── voice_chat_interface.py    # Main interface (simple)
    ├── voice_status.py             # Text-based status (emoji + text)
    ├── recording_controls.py       # Record button
    ├── voice_transcript.py         # Transcript display
    └── audio_recorder.py           # Audio capture (MediaRecorder or webrtc)

  services/
    └── voice_service.py            # API calls

  utils/
    └── voice_state.py              # State management
```

**NO crear en MVP:**
- ❌ `audio_visualizer.py` (Phase 2)
- ❌ `threejs_orb_visualizer.py` (Phase 2)
- ❌ Custom React component (Phase 2)

### MVP User Experience

```
┌─────────────────────────────────────────────┐
│ [💬 Text Mode] [🎤 Voice Mode]              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │          ⚪ Ready to listen         │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│         [🎤 Start Recording]                │
│                                             │
│  ─────────────────────────────────────────  │
│  Transcript:                                │
│  🗣️ You: "Why did Verstappen pit lap 15?"  │
│  🤖 Assistant: "Verstappen pitted..."       │
└─────────────────────────────────────────────┘
```

---

## User Flow

### Voice Chat Interaction Flow

```
1. User opens chat page
   ↓
2. User sees [Text Mode] [Voice Mode] buttons
   ↓
3. User clicks "Voice Mode"
   ↓
4. Interface switches to voice mode:
   - Animated orb appears (idle pulsing)
   - Recording button appears
   - Transcript area (optional)
   ↓
5. User clicks "Start Recording" or holds button
   ↓
6. Recording begins:
   - Button changes to "Stop Recording"
   - Orb animation becomes active (reacting to mic input)
   - Status: "Listening..."
   ↓
7. User speaks their question
   ↓
8. User clicks "Stop Recording"
   ↓
9. Audio sent to backend:
   - Status: "Processing..."
   - Orb spins/morphs
   ↓
10. Backend processes (STT → LLM → TTS)
    ↓
11. Response received:
    - Transcript updated: "You: [question]"
    - Status: "Speaking..."
    - Audio plays automatically
    - Orb pulses with speech output
    ↓
12. Playback completes:
    - Transcript updated: "Assistant: [response]"
    - Status: "Idle"
    - Ready for next question
    ↓
13. User can:
    - Record another question (repeats from step 5)
    - Switch back to text mode
    - Clear conversation
```

---

## Configuration Options

### User Settings (Add to sidebar or settings page)

```python
# Voice Settings
st.sidebar.markdown("### Voice Settings")

# Show/hide transcript
show_transcript = st.sidebar.checkbox(
    "Show transcript",
    value=st.session_state.get('show_voice_transcript', True)
)
st.session_state.show_voice_transcript = show_transcript

# TTS Speed
tts_speed = st.sidebar.slider(
    "Speech speed",
    min_value=0.5,
    max_value=2.0,
    value=1.0,
    step=0.1
)
st.session_state.tts_speed = tts_speed

# Auto-play responses
auto_play = st.sidebar.checkbox(
    "Auto-play responses",
    value=True
)
st.session_state.voice_auto_play = auto_play

# Recording mode
recording_mode = st.sidebar.radio(
    "Recording mode",
    options=["Push-to-talk", "Toggle"],
    index=1
)
st.session_state.recording_mode = recording_mode
```

---

## Performance Considerations

### Backend Optimization

1. **Whisper Model Selection**
   - `tiny`: Ultra-fast, lower accuracy (~32ms per second of audio)
   - `base`: Fast, good accuracy (~70ms per second) **← MVP Start Here**
   - `small`: Balanced (~200ms per second) **← Recommended for production**
   - `medium`: High accuracy, slower (~500ms per second)
   - `large`: Best accuracy, slowest (~1000ms per second)

2. **TTS Engine: pyttsx3** ✅
   - **Instant synthesis** (~0ms delay, generates as speaks)
   - **Offline** (no API calls)
   - **Decent quality** for conversational use
   - **Platform voices**:
     - Windows: Microsoft SAPI voices (David, Zira, etc.)
     - macOS: NSSpeechSynthesizer (Alex, Samantha, etc.)
     - Linux: eSpeak

3. **pyttsx3 Optimization**
   - Keep engine instance alive (don't reinitialize per request)
   - Use `runAndWait()` or async alternatives
   - Adjust rate/volume for better perceived quality
   - Select best available system voice

4. **Caching**
   - Cache Whisper model in memory (don't reload per request)
   - Cache common responses if needed (optional for MVP)

5. **Parallel Processing**
   - Run Whisper and TTS models on separate threads/processes
   - Use async/await for I/O operations
   - Consider GPU acceleration for Whisper if available

5. **Audio Optimization**
   - Compress audio before transmission (Opus codec)
   - Use streaming for long responses
   - Limit audio duration (e.g., max 2 minutes)

### Frontend Optimization

1. **WebRTC vs. MediaRecorder**
   - Use MediaRecorder API for simpler implementation
   - WebRTC for more control and lower latency

2. **Visualization Performance**
   - Use requestAnimationFrame for smooth animations
   - Throttle audio analysis updates (60 FPS max)
   - Use WebGL for complex visualizations (Three.js)

3. **State Management**
   - Minimize Streamlit reruns during voice interaction
   - Use session state efficiently
   - Clear old audio files from memory

---

## Error Handling

### Common Errors and Solutions

1. **Microphone Access Denied**
   ```python
   if not has_microphone_permission():
       st.error("⚠️ Microphone access denied. Please allow microphone access in your browser settings.")
       st.stop()
   ```

2. **Whisper Model Not Loaded**
   ```python
   try:
       stt_service = STTService(model_name="base")
   except Exception as e:
       st.error(f"Failed to load Whisper model: {e}")
       st.info("Downloading model... This may take a few minutes on first run.")
   ```

3. **Audio Format Not Supported**
   ```python
   try:
       audio = AudioProcessor.convert_audio_format(audio_bytes, "webm", "wav")
   except Exception as e:
       st.error("Unsupported audio format. Please try again.")
   ```

4. **TTS Synthesis Failed**
   ```python
   try:
       audio = tts_service.synthesize_speech(text)
   except Exception as e:
       st.error(f"Failed to generate speech: {e}")
       # Fallback: display text only
       st.markdown(f"**Assistant:** {text}")
   ```

5. **Long Processing Time**
   ```python
   with st.spinner("Processing your question... This may take a moment."):
       response = await voice_chat(audio_bytes)
   ```

---

## Testing Strategy

### Backend Tests

1. **STT Service Tests** (`tests/test_stt_service.py`)
   - Test audio transcription with sample files
   - Test different audio formats (wav, mp3, webm)
   - Test language detection
   - Test error handling (corrupted audio, too long)

2. **TTS Service Tests** (`tests/test_tts_service.py`)
   - Test speech synthesis with various texts
   - Test speed adjustment
   - Test output format
   - Test long text handling (truncation/chunking)

3. **Voice API Tests** (`tests/test_voice_endpoints.py`)
   - Test `/transcribe` endpoint
   - Test `/voice-chat` endpoint (full flow)
   - Test `/synthesize` endpoint
   - Test audio file retrieval
   - Test error responses

### Frontend Tests

1. **Component Tests**
   - Voice interface rendering
   - Audio recorder functionality
   - Orb visualization rendering
   - Recording controls

2. **Integration Tests**
   - Full voice chat flow
   - Mode switching (text ↔ voice)
   - Transcript display
   - Audio playback

### Manual Testing Checklist

#### Voice Chat Functionality
- [ ] Microphone access request works
- [ ] Audio recording starts/stops correctly
- [ ] Orb animation reacts to audio input
- [ ] Transcription accuracy is acceptable
- [ ] LLM responses are contextually relevant
- [ ] TTS audio plays automatically
- [ ] Orb animation reacts to audio output
- [ ] Transcript displays correctly
- [ ] Can switch between text and voice modes
- [ ] Voice history persists during session
- [ ] Error messages display appropriately
- [ ] Works on different browsers (Chrome, Firefox, Safari)
- [ ] Works on mobile devices (optional)

#### Audio Quality
- [ ] Recording quality is clear
- [ ] TTS voice is understandable
- [ ] No audio clipping or distortion
- [ ] Volume levels are appropriate
- [ ] Background noise doesn't interfere too much

#### Performance
- [ ] Transcription completes in acceptable time (< 5s)
- [ ] TTS synthesis completes in acceptable time (< 5s)
- [ ] Total response time is reasonable (< 15s)
- [ ] No memory leaks during extended use
- [ ] Audio files are cleaned up properly

---

## Implementation Roadmap (REVISED - MVP First)

### ✅ PHASE 1: MVP - Functional Voice Chat (2 weeks)

#### Week 1: Backend Implementation
- [ ] Install and test Whisper locally (`pip install openai-whisper`)
- [ ] Download Whisper model (`base` or `small`)
- [ ] Create `backend/services/voice/stt_service.py` (Whisper integration)
- [ ] Create `backend/services/voice/tts_service.py` (pyttsx3 integration)
- [ ] Test pyttsx3 voices on your system
- [ ] Create `backend/services/voice/audio_processor.py` (format conversion)
- [ ] Create `backend/models/voice_models.py` (Pydantic models)
- [ ] Create `backend/api/v1/endpoints/voice.py`:
  - [ ] `POST /transcribe` endpoint
  - [ ] `POST /synthesize` endpoint
  - [ ] `POST /voice-chat` endpoint (full flow: STT → LLM → TTS)
- [ ] Update `backend/main.py` (include voice router)
- [ ] Update `backend/requirements.txt`
- [ ] Create `backend/core/voice_config.py`
- [ ] Test endpoints with Postman/curl
- [ ] Verify full flow: audio → text → LLM response → audio

#### Week 2: Frontend MVP (No Orb)
- [ ] Create `frontend/utils/voice_state.py` (state management)
- [ ] Create `frontend/services/voice_service.py` (API client)
- [ ] Create `frontend/components/voice/voice_status.py` (simple emoji status)
- [ ] Create `frontend/components/voice/recording_controls.py` (record button)
- [ ] Create `frontend/components/voice/voice_transcript.py` (transcript display)
- [ ] Create `frontend/components/voice/audio_recorder.py` (MediaRecorder API)
- [ ] Create `frontend/components/voice/voice_chat_interface.py` (main interface)
- [ ] Update `frontend/pages/chat.py` (add voice mode toggle)
- [ ] Update `frontend/requirements.txt`
- [ ] Test recording → transcription → response → playback
- [ ] Test mode switching (text ↔ voice)
- [ ] Cross-browser testing (Chrome, Firefox)
- [ ] Fix bugs and polish UX

**END OF PHASE 1: You have a fully functional voice chat! 🎉**

---

### 🎨 PHASE 2: Orb Visualization (2-3 weeks)

**Start ONLY after Phase 1 is complete and tested**

#### Week 3: Choose Implementation Approach
- [ ] Review visualization options (React component vs Three.js)
- [ ] Decide on approach based on:
  - Team React experience
  - Desired visual quality
  - Time constraints
- [ ] Set up development environment for chosen approach

#### Week 4: Implement Orb Visualization
**If React Component (Option 1):**
- [ ] Create `frontend/components/voice/streamlit_audio_viz/` directory
- [ ] Set up React project inside
- [ ] `npm install react-audio-visualizers`
- [ ] Create `AudioOrbVisualizer.tsx`
- [ ] Configure Streamlit component wrapper
- [ ] Build and test in isolation
- [ ] Connect to voice status (idle, listening, processing, speaking)
- [ ] Test audio reactivity

**If Three.js Embedded (Option 2):**
- [ ] Create `frontend/components/voice/threejs_orb_visualizer.py`
- [ ] Implement Three.js scene with orb geometry
- [ ] Add animations for each state
- [ ] Connect Web Audio API for reactivity
- [ ] Test in different browsers

#### Week 5: Integration and Polish
- [ ] Replace simple status with orb in `voice_chat_interface.py`
- [ ] Ensure smooth transitions between states
- [ ] Color coding by status (idle, listening, processing, speaking)
- [ ] Audio reactivity for input (listening) and output (speaking)
- [ ] Performance optimization (60 FPS target)
- [ ] Cross-browser testing
- [ ] Mobile testing (if applicable)
- [ ] Final bug fixes

**END OF PHASE 2: You have ChatGPT-style voice chat! 🎨**

---

### 🚀 PHASE 3: Polish & Launch (1 week)

#### Week 6: Final Touches
- [ ] Add user settings:
  - [ ] Speech rate slider
  - [ ] Volume control
  - [ ] Voice selection (if multiple available)
  - [ ] Auto-play toggle
  - [ ] Show/hide transcript toggle
- [ ] Comprehensive testing (all scenarios)
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Write documentation:
  - [ ] User guide
  - [ ] API documentation
  - [ ] Setup instructions (Whisper, pyttsx3)
- [ ] Create demo video/screenshots
- [ ] Final review
- [ ] Launch! 🚀

---

## Quick Start: MVP in 2 Days (Fastest Path)

If you want to see it working ASAP:

### Day 1: Backend (4-6 hours)
1. `pip install openai-whisper pyttsx3 pydub soundfile`
2. Copy STT service code from plan
3. Copy TTS service code from plan
4. Create 3 endpoints (transcribe, synthesize, voice-chat)
5. Test with curl

### Day 2: Frontend (4-6 hours)
1. `pip install streamlit-webrtc` (or use MediaRecorder JS)
2. Create simple voice interface (no orb)
3. Add record button
4. Wire up to backend
5. Test end-to-end

**Result**: Working voice chat in ~1-2 days (without visualization)

---


---

## Dependencies Summary

### Backend New Dependencies

```txt
# Speech-to-Text
openai-whisper>=20231117
faster-whisper>=0.10.0  # Optional: faster inference (GPU-optimized)

# Text-to-Speech
pyttsx3>=2.90  # Primary TTS engine (instant, offline)

# Audio Processing
pydub>=0.25.1
soundfile>=0.12.1
librosa>=0.10.0  # Optional: advanced audio analysis
numpy>=1.24.0

# Utilities
aiofiles>=23.0.0  # Async file I/O
```

### Frontend New Dependencies

```txt
streamlit-webrtc>=0.45.0  # WebRTC audio capture
httpx>=0.24.0  # Async HTTP client
av>=10.0.0  # Audio/video processing (for webrtc)
```

---

## Folder Structure Summary

```
F1_Telemetry_Manager/
│
├── backend/
│   ├── services/
│   │   ├── voice/
│   │   │   ├── __init__.py
│   │   │   ├── stt_service.py          # NEW: Whisper STT
│   │   │   ├── tts_service.py          # NEW: Coqui TTS
│   │   │   └── audio_processor.py      # NEW: Audio utilities
│   │   └── chatbot/
│   │       └── ... (existing chat services)
│   │
│   ├── api/v1/endpoints/
│   │   ├── voice.py                     # NEW: Voice endpoints
│   │   └── chat.py                      # EXISTING
│   │
│   ├── models/
│   │   ├── voice_models.py              # NEW: Voice Pydantic models
│   │   └── chat_models.py               # EXISTING
│   │
│   ├── core/
│   │   ├── voice_config.py              # NEW: Voice configuration
│   │   └── ... (existing core files)
│   │
│   ├── temp/
│   │   └── audio/                       # NEW: Temporary audio storage
│   │       └── .gitkeep
│   │
│   ├── main.py                          # MODIFY: Add voice router
│   └── requirements.txt                 # MODIFY: Add dependencies
│
├── frontend/
│   ├── components/
│   │   ├── voice/
│   │   │   ├── __init__.py
│   │   │   ├── voice_chat_interface.py  # NEW (MVP): Main voice interface
│   │   │   ├── voice_status.py          # NEW (MVP): Simple status indicator
│   │   │   ├── audio_recorder.py        # NEW (MVP): Recording component
│   │   │   ├── recording_controls.py    # NEW (MVP): Recording UI controls
│   │   │   ├── voice_transcript.py      # NEW (MVP): Transcript display
│   │   │   │
│   │   │   # PHASE 2 (After MVP):
│   │   │   ├── audio_visualizer.py      # PHASE 2: Orb visualization
│   │   │   └── streamlit_audio_viz/     # PHASE 2: Custom React component (optional)
│   │   │       ├── frontend/            # React app with React Audio Visualizers
│   │   │       └── __init__.py          # Streamlit wrapper
│   │   │
│   │   └── chatbot/
│   │       └── ... (existing chat components)
│   │
│   ├── services/
│   │   ├── voice_service.py             # NEW: Voice API client
│   │   └── chat_service.py              # EXISTING
│   │
│   ├── utils/
│   │   ├── voice_state.py               # NEW: Voice state management
│   │   └── chat_state.py                # EXISTING
│   │
│   ├── pages/
│   │   ├── chat.py                      # MODIFY: Add voice mode
│   │   └── ... (other pages)
│   │
│   └── requirements.txt                 # MODIFY: Add dependencies
│
└── docs/
    ├── VOICE_CHAT_IMPLEMENTATION_PLAN.md  # THIS FILE
    ├── CHAT_IMPLEMENTATION_PLAN.md        # EXISTING
    └── ...
```

---

## Leveraging Existing Structure

### What We Can Reuse

1. **LLM Integration**: Use existing LM Studio integration from chat
   - Same model
   - Same context injection
   - Same query routing

2. **State Management**: Extend existing chat state
   - Add voice-specific state variables
   - Reuse conversation context
   - Share F1 telemetry context

3. **UI Components**: Match existing design
   - Use same color scheme
   - Similar button styles
   - Consistent fonts and spacing

4. **API Structure**: Follow existing patterns
   - Same FastAPI setup
   - Similar endpoint structure
   - Consistent error handling

### Integration Points

1. **Shared Context**: Voice and text chat share the same F1 context
   - User can ask about telemetry in voice mode
   - Context from dashboard/comparison pages works for both

2. **Unified History**: Consider merging voice and text history
   - Or keep separate but allow mode switching
   - Export should include both

3. **"Ask About This" Integration**:
   - Dashboard buttons can open voice mode too
   - User preference: text or voice response

---

## Next Steps to Start Implementation

### Immediate Actions (Before coding):

1. **Review this plan** ✅
2. **Install dependencies locally** to test:
   ```bash
   # Backend
   pip install openai-whisper pyttsx3 pydub soundfile numpy

   # Test Whisper
   python -c "import whisper; model = whisper.load_model('base'); print('Whisper ready!')"

   # Test pyttsx3
   python -c "import pyttsx3; engine = pyttsx3.init(); engine.say('Test'); engine.runAndWait(); print('TTS ready!')"
   ```

3. **Confirm system voices** (pyttsx3):
   ```python
   import pyttsx3
   engine = pyttsx3.init()
   voices = engine.getProperty('voices')
   for voice in voices:
       print(f"Voice: {voice.name} - {voice.id}")
   ```

4. **Choose best voice** for your assistant (optional)

5. **Start Phase 1 implementation** (MVP backend first)

---

## Conclusion

Este plan proporciona una **hoja de ruta clara en dos fases** para implementar chat de voz:

### ✅ FASE 1 (2 semanas): MVP Funcional
- Chat de voz completamente funcional
- STT (Whisper) + LLM (LM Studio) + TTS (pyttsx3)
- UI simple pero efectiva (status text, transcript)
- **Objetivo**: Validar la experiencia del usuario y el flujo completo

### 🎨 FASE 2 (2-3 semanas): Visualización ChatGPT-Style
- Orbe animado reactivo al audio
- Opciones: React Audio Visualizers o Three.js custom
- Polish y optimización
- **Objetivo**: UX impresionante y profesional

**Ventajas de este enfoque MVP-first:**
- ✅ **Rápido**: MVP funcional en 2 semanas
- ✅ **Validación temprana**: Probar UX antes de invertir en visualización
- ✅ **Flexible**: Decide después qué opción de visualización (React vs Three.js)
- ✅ **Offline-first**: Whisper + pyttsx3 (sin costos de API)
- ✅ **Instant TTS**: pyttsx3 es inmediato (0ms synthesis delay)
- ✅ **Escalable**: Fácil añadir cloud TTS después si se desea mejor calidad

**Próximo paso:**
1. Instalar y probar dependencias (Whisper + pyttsx3)
2. Empezar con Week 1 del roadmap (Backend)
3. Contactarme si necesitas ayuda con la implementación 😊

¿Listo para empezar con la Fase 1? 🚀
