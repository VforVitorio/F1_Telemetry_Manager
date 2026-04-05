"""
Speech-to-Text Service using NVIDIA Nemotron Speech

Provides low-latency audio transcription via the HuggingFace transformers
pipeline wrapping nvidia/nemotron-speech-streaming-en-0.6b (Cache-Aware
FastConformer-RNNT, ~160ms chunk latency, English-only).

Install: pip install transformers accelerate
"""

import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional

from backend.core.voice_config import (
    NEMOTRON_DEVICE,
    NEMOTRON_MODEL,
)

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

logger = logging.getLogger(__name__)


class STTService:
    """Speech-to-Text service using NVIDIA Nemotron Speech (via transformers)."""

    def __init__(self, model_name: str = NEMOTRON_MODEL):
        """
        Initialize the Nemotron ASR pipeline.

        Args:
            model_name: HuggingFace model ID (default: NEMOTRON_MODEL from voice_config)
        """
        self.model_name = model_name
        self._pipe = None
        self._build_pipeline()

    def _build_pipeline(self) -> None:
        """Load the HuggingFace ASR pipeline (downloads on first use)."""
        try:
            from transformers import pipeline as hf_pipeline

            logger.info("Loading Nemotron ASR pipeline '%s'...", self.model_name)
            self._pipe = hf_pipeline(
                "automatic-speech-recognition",
                model=self.model_name,
                device=NEMOTRON_DEVICE,
            )
            logger.info("Nemotron ASR pipeline loaded successfully")
        except Exception as e:
            logger.error("Failed to load Nemotron ASR pipeline: %s", e)
            raise RuntimeError(f"Failed to load Nemotron ASR pipeline: {e}")

    # ------------------------------------------------------------------
    # Internal helpers (unchanged contract from Whisper version)
    # ------------------------------------------------------------------

    def _save_audio_to_temp(self, audio_bytes: bytes) -> str:
        """Save audio bytes to a temporary WAV file and return its path."""
        temp_file = tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False,
            dir=tempfile.gettempdir(),
        )
        temp_file.write(audio_bytes)
        temp_path = temp_file.name
        temp_file.close()
        return temp_path

    def _cleanup_temp_file(self, file_path: str) -> None:
        """Delete a temporary file, swallowing errors."""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.warning("Failed to cleanup temp file %s: %s", file_path, e)

    def _validate_audio_bytes(self, audio_bytes: bytes) -> None:
        """Raise ValueError if audio_bytes are obviously invalid."""
        if not audio_bytes:
            raise ValueError("Audio data is empty")
        if len(audio_bytes) < 100:
            raise ValueError("Audio data too small to be valid")

    def _transcribe_file(self, audio_path: str) -> str:
        """
        Run the Nemotron pipeline on a WAV file.

        Args:
            audio_path: Absolute path to a WAV file

        Returns:
            Transcribed text string
        """
        output = self._pipe(audio_path)
        return output["text"]

    # ------------------------------------------------------------------
    # Public contract (identical to the Whisper version)
    # ------------------------------------------------------------------

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: str = "en",
    ) -> Dict[str, object]:
        """
        Transcribe audio bytes to text.

        The `language` argument is accepted for API compatibility but Nemotron
        Speech is English-only; passing any other value is a no-op.

        Args:
            audio_bytes: Raw WAV audio data
            language: Language hint (accepted for compat; only 'en' supported)

        Returns:
            Dictionary with keys:
                - text (str): Transcribed text
                - language (str): 'en'
                - duration (float): 0.0 (Nemotron does not return duration)

        Raises:
            ValueError: If audio_bytes are invalid
            RuntimeError: If the pipeline call fails
        """
        self._validate_audio_bytes(audio_bytes)

        temp_path = None
        try:
            temp_path = self._save_audio_to_temp(audio_bytes)
            logger.info("Transcribing audio (%d bytes)", len(audio_bytes))

            text = self._transcribe_file(temp_path)

            logger.info("Transcription complete: '%s...'", text[:50])
            return {"text": text.strip(), "language": "en", "duration": 0.0}

        except ValueError:
            raise
        except Exception as e:
            logger.error("Transcription failed: %s", e)
            raise RuntimeError(f"Failed to transcribe audio: {e}")
        finally:
            if temp_path:
                self._cleanup_temp_file(temp_path)

    def is_model_loaded(self) -> bool:
        """Return True if the ASR pipeline is ready."""
        return self._pipe is not None

    def get_model_info(self) -> Dict[str, str]:
        """Return model metadata dict."""
        return {
            "model_name": self.model_name,
            "device": str(NEMOTRON_DEVICE),
            "loaded": self.is_model_loaded(),
        }


# Singleton instance for reuse
_stt_service_instance: Optional[STTService] = None


def get_stt_service() -> STTService:
    """Get or create the STT service singleton."""
    global _stt_service_instance
    if _stt_service_instance is None:
        _stt_service_instance = STTService()
    return _stt_service_instance


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("STT Service Test — NVIDIA Nemotron")
    print("=" * 50)

    stt = STTService()

    print("\nModel Info:")
    for key, value in stt.get_model_info().items():
        print(f"  {key}: {value}")

    print("\nSTT Service ready — call transcribe_audio(wav_bytes) to test.")
