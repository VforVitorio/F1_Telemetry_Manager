"""
Voice Chat Configuration

Contains all configuration constants for STT, TTS, and audio processing.
"""

# STT — OpenAI Whisper (via HuggingFace transformers pipeline)
# whisper-small: 244M params, ~300ms latency, multilingual (defaulted to English).
# Swapped in after Nemotron-Speech-Streaming was found to require the NVIDIA NeMo
# framework (~5 GB of extra deps), which is out of scope for this backend image.
WHISPER_MODEL  = "openai/whisper-small"
WHISPER_DEVICE = 0  # CUDA GPU index; set to "cpu" if no NVIDIA GPU available

# TTS — Microsoft Edge-TTS (Azure Neural voices over the Edge read-aloud endpoint)
# Swapped in after Qwen3-TTS required the qwen_tts package + ~600MB of weights
# that were out of scope for the backend image. Edge-TTS is already declared in
# the submodule pyproject and streams MP3 chunks in ~300-500 ms for short replies.
EDGE_TTS_DEFAULT_VOICE = "en-US-AriaNeural"

# Audio Processing
AUDIO_SAMPLE_RATE = 16000
AUDIO_FORMAT = "wav"
MAX_AUDIO_DURATION = 120  # seconds
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25MB

# Temporary Storage
AUDIO_TEMP_DIR = "backend/temp/audio"
AUDIO_CLEANUP_INTERVAL = 3600  # cleanup old files every hour (seconds)

# API Settings
VOICE_API_TIMEOUT = 120  # seconds
