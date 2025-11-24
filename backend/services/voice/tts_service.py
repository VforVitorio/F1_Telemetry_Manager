"""
Text-to-Speech Service using pyttsx3

Provides instant, offline speech synthesis with configurable voice properties.
"""

import pyttsx3
import tempfile
import os
import logging
import sys
from pathlib import Path
from typing import Optional, List, Dict

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.voice_config import TTS_RATE, TTS_VOLUME, TTS_VOICE_ID

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-Speech service using pyttsx3."""

    def __init__(self):
        """Initialize pyttsx3 TTS engine."""
        try:
            self.engine = pyttsx3.init()
            self._configure_engine()
            logger.info("TTS Service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize TTS engine: {e}")
            raise

    def _configure_engine(self) -> None:
        """Configure voice properties with default values."""
        self._set_rate(TTS_RATE)
        self._set_volume(TTS_VOLUME)

        if TTS_VOICE_ID:
            self._set_voice_by_id(TTS_VOICE_ID)

    def _set_rate(self, rate: int) -> None:
        """Set speech rate (words per minute)."""
        try:
            self.engine.setProperty('rate', rate)
        except Exception as e:
            logger.warning(f"Failed to set rate: {e}")

    def _set_volume(self, volume: float) -> None:
        """Set volume level (0.0 to 1.0)."""
        try:
            volume = max(0.0, min(1.0, volume))  # Clamp between 0 and 1
            self.engine.setProperty('volume', volume)
        except Exception as e:
            logger.warning(f"Failed to set volume: {e}")

    def _set_voice_by_id(self, voice_id: str) -> None:
        """Set voice by ID."""
        try:
            self.engine.setProperty('voice', voice_id)
        except Exception as e:
            logger.warning(f"Failed to set voice: {e}")

    def _save_to_temp_file(self, text: str) -> str:
        """
        Save text to temporary audio file.

        Returns:
            Path to temporary WAV file
        """
        temp_file = tempfile.NamedTemporaryFile(
            suffix='.wav',
            delete=False,
            dir=tempfile.gettempdir()
        )
        temp_path = temp_file.name
        temp_file.close()

        self.engine.save_to_file(text, temp_path)
        self.engine.runAndWait()

        return temp_path

    def _read_audio_file(self, file_path: str) -> bytes:
        """Read audio file as bytes."""
        with open(file_path, 'rb') as f:
            return f.read()

    def _cleanup_temp_file(self, file_path: str) -> None:
        """Delete temporary file."""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {e}")

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
            rate: Speech rate (words per minute), default from config
            volume: Volume level (0.0 to 1.0), default from config

        Returns:
            Audio bytes in WAV format

        Raises:
            ValueError: If text is empty
            RuntimeError: If synthesis fails
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        # Apply custom properties if provided
        if rate is not None:
            self._set_rate(rate)
        if volume is not None:
            self._set_volume(volume)

        temp_path = None
        try:
            # Generate audio to temp file
            temp_path = self._save_to_temp_file(text)

            # Read audio bytes
            audio_bytes = self._read_audio_file(temp_path)

            logger.info(f"Generated {len(audio_bytes)} bytes of audio")
            return audio_bytes

        except Exception as e:
            logger.error(f"Speech synthesis failed: {e}")
            raise RuntimeError(f"Failed to synthesize speech: {e}")

        finally:
            # Always cleanup temp file
            if temp_path:
                self._cleanup_temp_file(temp_path)

            # Reset to defaults if custom values were used
            if rate is not None:
                self._set_rate(TTS_RATE)
            if volume is not None:
                self._set_volume(TTS_VOLUME)

    def get_available_voices(self) -> List[Dict[str, any]]:
        """
        Get list of available system voices.

        Returns:
            List of voice dictionaries with id, name, and languages
        """
        try:
            voices = self.engine.getProperty('voices')
            return [
                {
                    'id': voice.id,
                    'name': voice.name,
                    'languages': voice.languages if hasattr(voice, 'languages') else []
                }
                for voice in voices
            ]
        except Exception as e:
            logger.error(f"Failed to get voices: {e}")
            return []

    def set_voice(self, voice_id: str) -> bool:
        """
        Set voice by ID.

        Args:
            voice_id: Voice ID from get_available_voices()

        Returns:
            True if successful, False otherwise
        """
        try:
            self._set_voice_by_id(voice_id)
            logger.info(f"Voice set to: {voice_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to set voice: {e}")
            return False


# Singleton instance for reuse
_tts_service_instance: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """
    Get or create TTS service singleton.

    Returns:
        TTSService instance
    """
    global _tts_service_instance
    if _tts_service_instance is None:
        _tts_service_instance = TTSService()
    return _tts_service_instance


# Test/Demo code
if __name__ == "__main__":
    import io
    import sys

    # Fix Windows encoding for emojis
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    logging.basicConfig(level=logging.INFO)

    print("🔊 TTS Service Test")
    print("=" * 50)

    tts = TTSService()

    print("\n📋 Available voices:")
    for i, voice in enumerate(tts.get_available_voices(), 1):
        print(f"  {i}. {voice['name']}")
        print(f"     ID: {voice['id']}")

    print("\n🎤 Generating test audio...")
    text = "Hello, I am Caronte, your Formula 1 strategy assistant."
    audio = tts.synthesize_speech(text)
    print(f"✅ Generated {len(audio)} bytes of audio")

    # Save test audio
    with open("test_tts.wav", "wb") as f:
        f.write(audio)
    print("💾 Saved to test_tts.wav")
