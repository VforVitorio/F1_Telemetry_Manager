"""
Text-to-Speech Service using Qwen3-TTS

Provides low-latency neural speech synthesis via the Qwen3-TTS-12Hz-0.6B-Base
model (~97ms end-to-end).  No internet connection required after the initial
model download.

Install: pip install -U qwen-tts soundfile
"""

import io
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional

from backend.core.voice_config import QWEN3_SAMPLE_RATE, QWEN3_TTS_MODEL

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-Speech service using Qwen3-TTS."""

    def __init__(self):
        """Load the Qwen3-TTS model (downloads on first use)."""
        try:
            from qwen_tts import Qwen3TTSModel

            logger.info("Loading Qwen3-TTS model '%s'...", QWEN3_TTS_MODEL)
            self._model = Qwen3TTSModel.from_pretrained(QWEN3_TTS_MODEL)
            logger.info("Qwen3-TTS model loaded successfully")
        except Exception as e:
            logger.error("Failed to initialize Qwen3-TTS: %s", e)
            raise

    # ------------------------------------------------------------------
    # Public contract (identical signatures to the EdgeTTS version)
    # ------------------------------------------------------------------

    def synthesize_speech(
        self,
        text: str,
        rate: Optional[int] = None,
        volume: Optional[float] = None,
    ) -> bytes:
        """
        Convert text to speech and return WAV audio bytes.

        The `rate` and `volume` arguments are accepted for API compatibility
        with the previous EdgeTTS implementation but are ignored — Qwen3-TTS
        Base does not expose rate/volume controls.

        Args:
            text: Text to synthesize (non-empty)
            rate: Ignored (kept for API compat)
            volume: Ignored (kept for API compat)

        Returns:
            Audio bytes in WAV format

        Raises:
            ValueError: If text is empty
            RuntimeError: If synthesis fails
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        try:
            import soundfile as sf

            logger.info("Synthesizing: '%s...'", text[:50])

            audio_array = self._model.generate_voice(text)

            buf = io.BytesIO()
            sf.write(buf, audio_array, samplerate=QWEN3_SAMPLE_RATE, format="WAV")
            audio_bytes = buf.getvalue()

            logger.info("Generated %d bytes of audio", len(audio_bytes))
            return audio_bytes

        except Exception as e:
            logger.error("Speech synthesis failed: %s", e)
            raise RuntimeError(f"Failed to synthesize speech: {e}")

    def get_available_voices(self) -> List[Dict[str, object]]:
        """
        Return the list of available TTS voices.

        Qwen3-TTS-12Hz-0.6B-Base ships with a single built-in voice.
        Voice cloning is available via the CustomVoice variant
        (Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice).
        """
        return [
            {
                "id": "qwen3-base",
                "name": "Qwen3 TTS Base (0.6B)",
                "languages": [
                    "en", "zh", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"
                ],
                "gender": "Neutral",
            }
        ]

    def set_voice(self, voice_id: str) -> bool:
        """
        No-op — Qwen3-TTS Base uses a single built-in voice.

        Returns True when voice_id matches the only available voice,
        False otherwise.
        """
        return voice_id == "qwen3-base"


# Singleton instance for reuse
_tts_service_instance: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """Get or create the TTS service singleton."""
    global _tts_service_instance
    if _tts_service_instance is None:
        _tts_service_instance = TTSService()
    return _tts_service_instance


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("TTS Service Test — Qwen3-TTS")
    print("=" * 50)

    tts = TTSService()

    print("\nAvailable voices:")
    for v in tts.get_available_voices():
        print(f"  {v['id']} — {v['name']}")

    print("\nGenerating test audio...")
    text = "Box box, pit this lap. Undercut window is open."
    audio = tts.synthesize_speech(text)
    print(f"Generated {len(audio)} bytes of audio")

    with open("test_tts_qwen3.wav", "wb") as f:
        f.write(audio)
    print("Saved to test_tts_qwen3.wav")
