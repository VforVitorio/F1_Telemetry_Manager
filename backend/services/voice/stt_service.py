"""
Speech-to-Text Service using OpenAI Whisper

Provides accurate audio transcription with local inference.
"""

import whisper
import tempfile
import os
import logging
import sys
from typing import Optional, Dict
from pathlib import Path

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.voice_config import (
    WHISPER_MODEL,
    WHISPER_LANGUAGE,
    WHISPER_DEVICE
)

logger = logging.getLogger(__name__)


class STTService:
    """Speech-to-Text service using Whisper."""

    def __init__(self, model_name: str = WHISPER_MODEL):
        """
        Initialize Whisper model.

        Args:
            model_name: Whisper model size (tiny, base, small, medium, large)
        """
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self) -> None:
        """Load Whisper model (downloads on first use)."""
        try:
            logger.info(f"Loading Whisper model '{self.model_name}'...")
            self.model = whisper.load_model(
                self.model_name,
                device=WHISPER_DEVICE
            )
            logger.info(f"✅ Whisper model '{self.model_name}' loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise RuntimeError(f"Failed to load Whisper model: {e}")

    def _save_audio_to_temp(self, audio_bytes: bytes) -> str:
        """
        Save audio bytes to temporary file.

        Args:
            audio_bytes: Audio data

        Returns:
            Path to temporary file
        """
        temp_file = tempfile.NamedTemporaryFile(
            suffix='.wav',
            delete=False,
            dir=tempfile.gettempdir()
        )
        temp_file.write(audio_bytes)
        temp_path = temp_file.name
        temp_file.close()

        return temp_path

    def _cleanup_temp_file(self, file_path: str) -> None:
        """Delete temporary file."""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {e}")

    def _validate_audio_bytes(self, audio_bytes: bytes) -> None:
        """
        Validate audio data.

        Args:
            audio_bytes: Audio data to validate

        Raises:
            ValueError: If audio data is invalid
        """
        if not audio_bytes:
            raise ValueError("Audio data is empty")

        if len(audio_bytes) < 100:  # Minimum reasonable audio size
            raise ValueError("Audio data too small to be valid")

    def _transcribe_file(
        self,
        audio_path: str,
        language: str
    ) -> Dict[str, any]:
        """
        Transcribe audio file using Whisper.

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es')

        Returns:
            Transcription result dictionary
        """
        result = self.model.transcribe(
            audio_path,
            language=language,
            fp16=False,  # Use fp32 for CPU compatibility
            verbose=False
        )
        return result

    def _extract_transcription_data(
        self,
        result: Dict[str, any],
        language: str
    ) -> Dict[str, any]:
        """
        Extract relevant data from Whisper result.

        Args:
            result: Raw Whisper transcription result
            language: Requested language

        Returns:
            Cleaned transcription data
        """
        return {
            "text": result.get("text", "").strip(),
            "language": result.get("language", language),
            "duration": result.get("duration", 0.0)
        }

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: str = WHISPER_LANGUAGE
    ) -> Dict[str, any]:
        """
        Transcribe audio to text.

        Args:
            audio_bytes: Audio file bytes
            language: Language code (e.g., 'en', 'es')

        Returns:
            Dictionary with:
                - text: Transcribed text
                - language: Detected/specified language
                - duration: Audio duration in seconds

        Raises:
            ValueError: If audio data is invalid
            RuntimeError: If transcription fails
        """
        # Validate input
        self._validate_audio_bytes(audio_bytes)

        temp_path = None
        try:
            # Save to temp file
            temp_path = self._save_audio_to_temp(audio_bytes)
            logger.info(f"Transcribing audio ({len(audio_bytes)} bytes)")

            # Transcribe
            result = self._transcribe_file(temp_path, language)

            # Extract data
            transcription_data = self._extract_transcription_data(result, language)

            logger.info(
                f"✅ Transcription complete: '{transcription_data['text'][:50]}...' "
                f"({transcription_data['duration']:.2f}s)"
            )

            return transcription_data

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise RuntimeError(f"Failed to transcribe audio: {e}")

        finally:
            # Always cleanup temp file
            if temp_path:
                self._cleanup_temp_file(temp_path)

    def is_model_loaded(self) -> bool:
        """Check if model is loaded."""
        return self.model is not None

    def get_model_info(self) -> Dict[str, str]:
        """
        Get model information.

        Returns:
            Dictionary with model name and device
        """
        return {
            "model_name": self.model_name,
            "device": WHISPER_DEVICE,
            "loaded": self.is_model_loaded()
        }


# Singleton instance for reuse
_stt_service_instance: Optional[STTService] = None


def get_stt_service() -> STTService:
    """
    Get or create STT service singleton.

    Returns:
        STTService instance
    """
    global _stt_service_instance
    if _stt_service_instance is None:
        _stt_service_instance = STTService()
    return _stt_service_instance


# Test/Demo code
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("🎤 STT Service Test")
    print("=" * 50)

    stt = STTService(model_name="base")

    print("\n📊 Model Info:")
    info = stt.get_model_info()
    for key, value in info.items():
        print(f"  {key}: {value}")

    print("\n✅ STT Service ready!")
    print("Record a test audio file and use transcribe_audio() to test.")
