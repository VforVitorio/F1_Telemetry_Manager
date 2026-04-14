"""
Speech-to-Text Service using OpenAI Whisper

Provides audio transcription via the HuggingFace ``transformers.pipeline``
wrapping ``openai/whisper-small`` by default. Whisper ships with custom
``model_type`` entries registered in transformers, so no NeMo toolkit or
``trust_remote_code`` is required \u2014 a plain ``pip install transformers``
is enough. Swapped in after Nemotron-Speech-Streaming turned out to need the
NVIDIA NeMo framework, which would have pulled ~5 GB of extra dependencies
into the backend image.

Install: pip install transformers accelerate
"""

import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional

from backend.core.voice_config import (
    WHISPER_DEVICE,
    WHISPER_MODEL,
)

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

logger = logging.getLogger(__name__)


class STTService:
    """Speech-to-Text service using OpenAI Whisper (via transformers pipeline)."""

    def __init__(self, model_name: str = WHISPER_MODEL):
        """
        Initialize the Whisper ASR pipeline.

        Args:
            model_name: HuggingFace model ID (default: WHISPER_MODEL from voice_config)
        """
        self.model_name = model_name
        self._pipe = None
        self._build_pipeline()

    def _build_pipeline(self) -> None:
        """Load the HuggingFace ASR pipeline (downloads on first use)."""
        try:
            from transformers import pipeline as hf_pipeline

            logger.info("Loading Whisper ASR pipeline '%s'...", self.model_name)
            self._pipe = hf_pipeline(
                "automatic-speech-recognition",
                model=self.model_name,
                device=WHISPER_DEVICE,
            )
            logger.info("Whisper ASR pipeline loaded successfully")
        except Exception as e:
            logger.error("Failed to load Whisper ASR pipeline: %s", e)
            raise RuntimeError(f"Failed to load Whisper ASR pipeline: {e}")

    # ------------------------------------------------------------------
    # Internal helpers
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

    def _transcribe_file(self, audio_path: str, language: str = "en") -> str:
        """
        Run the Whisper pipeline on a WAV file.

        Whisper is multilingual; passing the language via ``generate_kwargs``
        lets us pin the decoder to English by default and matches the public
        contract the previous Nemotron version advertised. The pipeline returns
        a dict with a ``text`` field that we strip on exit.

        Args:
            audio_path: Absolute path to a WAV file
            language: ISO language hint forwarded to Whisper's generate step

        Returns:
            Transcribed text string
        """
        output = self._pipe(
            audio_path,
            generate_kwargs={"language": language, "task": "transcribe"},
        )
        return output["text"]

    # ------------------------------------------------------------------
    # Public contract
    # ------------------------------------------------------------------

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: str = "en",
    ) -> Dict[str, object]:
        """
        Transcribe audio bytes to text.

        Whisper supports multilingual input, but we default to English because
        every F1 radio corpus and UI copy in this project is English. Callers
        can override by passing a different ISO code \u2014 Whisper will then
        attempt language detection on the input.

        Args:
            audio_bytes: Raw WAV audio data
            language: Language hint forwarded to Whisper (default: 'en')

        Returns:
            Dictionary with keys:
                - text (str): Transcribed text
                - language (str): Language used for decoding
                - duration (float): 0.0 (pipeline does not expose duration)

        Raises:
            ValueError: If audio_bytes are invalid
            RuntimeError: If the pipeline call fails
        """
        self._validate_audio_bytes(audio_bytes)

        temp_path = None
        try:
            temp_path = self._save_audio_to_temp(audio_bytes)
            logger.info("Transcribing audio (%d bytes)", len(audio_bytes))

            text = self._transcribe_file(temp_path, language=language)

            logger.info("Transcription complete: '%s...'", text[:50])
            return {"text": text.strip(), "language": language, "duration": 0.0}

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

    def get_model_info(self) -> Dict[str, object]:
        """Return model metadata dict."""
        return {
            "model_name": self.model_name,
            "device": str(WHISPER_DEVICE),
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

    print("STT Service Test \u2014 OpenAI Whisper")
    print("=" * 50)

    stt = STTService()

    print("\nModel Info:")
    for key, value in stt.get_model_info().items():
        print(f"  {key}: {value}")

    print("\nSTT Service ready \u2014 call transcribe_audio(wav_bytes) to test.")
