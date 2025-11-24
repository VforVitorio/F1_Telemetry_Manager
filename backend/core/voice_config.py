"""
Voice Chat Configuration

Contains all configuration constants for STT, TTS, and audio processing.
"""

# Whisper Configuration
WHISPER_MODEL = "base"  # Options: tiny, base, small, medium, large
WHISPER_LANGUAGE = "en"
WHISPER_DEVICE = "cpu"  # or "cuda" if GPU available

# TTS Configuration (pyttsx3)
TTS_ENGINE = "pyttsx3"
TTS_RATE = 175  # Speech rate (words per minute), default ~150-200
TTS_VOLUME = 0.9  # Volume (0.0 to 1.0)
# David = male English voice
TTS_VOICE_ID = r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-US_DAVID_11.0"

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
