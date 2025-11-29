"""
Voice Chat Configuration

Contains all configuration constants for STT, TTS, and audio processing.
"""

# Whisper Configuration
WHISPER_MODEL = "medium"  # Options: tiny, base, small, medium, large
WHISPER_LANGUAGE = "en"
WHISPER_DEVICE = "cpu"  # or "cuda" if GPU available

# TTS Configuration (Edge TTS)
TTS_ENGINE = "edge"  # Using Microsoft Edge TTS
# Default voice (Andrew - Male, Multilingual)
TTS_VOICE = "en-US-AndrewMultilingualNeural"
TTS_RATE = 175  # Speech rate (words per minute), baseline ~175
TTS_VOLUME = 0.9  # Volume (0.0 to 1.0)

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
