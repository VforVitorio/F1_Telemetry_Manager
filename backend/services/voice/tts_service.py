"""
Text-to-Speech Service using Microsoft Edge-TTS.

Edge-TTS speaks the Azure Neural voices over Microsoft's public endpoint,
returning MP3 chunks that browsers and ``st.audio`` can play natively. It is
async under the hood and produces a reply in ~300-500 ms for short strings.
Swapped in after Qwen3-TTS required the ``qwen_tts`` Python package plus a
~600 MB weight download that was out of scope for the backend image.

Install: pip install edge-tts  (already declared in src/telemetry/pyproject.toml)
"""

import asyncio
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional

from backend.core.voice_config import EDGE_TTS_DEFAULT_VOICE

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

logger = logging.getLogger(__name__)


# Neutral pace, in words per minute. TTSRequest.rate is expressed in wpm and
# defaults to this value; keep the two in sync (this is the "+0%" point).
_BASELINE_WPM = 175


def _format_rate(rate: Optional[int]) -> str:
    """Convert the request's words-per-minute ``rate`` into the +/-N% string
    Edge-TTS expects.

    Edge-TTS has no absolute wpm control — it takes a percentage relative to the
    voice's natural pace. ``TTSRequest.rate`` is in wpm, so we map it around a
    neutral baseline of 175 wpm: 175 → +0% (natural), 350 → +100% (twice as
    fast), 88 → -50%. ``None`` also maps to +0%.

    Before this fix the wpm value was emitted verbatim as a percentage, so the
    default 175 synthesized at +175% speed (#52).
    """
    if rate is None:
        return "+0%"
    pct = round((rate - _BASELINE_WPM) / _BASELINE_WPM * 100)
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct}%"


def _format_volume(volume: Optional[float]) -> str:
    """Convert a ``0.0-2.0`` multiplicative volume into the ``+/-N%`` string
    Edge-TTS expects. ``1.0`` is neutral; ``0.5`` halves the volume (\u221250 %),
    ``1.5`` adds 50 %. ``None`` maps to ``+0%``.
    """
    if volume is None:
        return "+0%"
    pct = int(round((volume - 1.0) * 100))
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct}%"


class TTSService:
    """Text-to-Speech service using Microsoft Edge-TTS neural voices."""

    def __init__(self, default_voice: str = EDGE_TTS_DEFAULT_VOICE):
        """
        Initialize the Edge-TTS synthesizer.

        Args:
            default_voice: Azure voice ID to use when callers do not override
                (e.g. ``en-US-AriaNeural``). See Edge-TTS docs for the full
                catalogue of multilingual voices.
        """
        try:
            import edge_tts  # noqa: F401  \u2014 validated at init, used lazily in synth

            self._voice = default_voice
            logger.info("Edge-TTS initialised with default voice '%s'", default_voice)
        except Exception as e:
            logger.error("Failed to initialize Edge-TTS: %s", e)
            raise

    # ------------------------------------------------------------------
    # Public contract (matches the previous Qwen3/EdgeTTS signatures)
    # ------------------------------------------------------------------

    async def synthesize_speech_async(
        self,
        text: str,
        rate: Optional[int] = None,
        volume: Optional[float] = None,
    ) -> bytes:
        """
        Async variant that streams Edge-TTS audio and returns MP3 bytes.

        FastAPI handlers are already async, so awaiting this directly avoids
        the ``asyncio.run() cannot be called from a running event loop``
        error that the sync wrapper hits when invoked from an async route.
        Prefer this method from any coroutine; the sync ``synthesize_speech``
        exists only so non-async callers (CLI smoke tests, scripts) keep
        working.
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        try:
            logger.info("Synthesizing: '%s...'", text[:50])
            audio_bytes = await self._synthesize_chunks(text, rate=rate, volume=volume)
            logger.info("Generated %d bytes of audio", len(audio_bytes))
            return audio_bytes
        except Exception as e:
            logger.error("Speech synthesis failed: %s", e)
            raise RuntimeError(f"Failed to synthesize speech: {e}")

    def synthesize_speech(
        self,
        text: str,
        rate: Optional[int] = None,
        volume: Optional[float] = None,
    ) -> bytes:
        """
        Sync wrapper around ``synthesize_speech_async``.

        Only safe to call from code that is NOT already inside an event loop
        (e.g. a plain script or the ``__main__`` block below). Async callers
        must ``await synthesize_speech_async`` instead.
        """
        return asyncio.run(self.synthesize_speech_async(text, rate=rate, volume=volume))

    async def _synthesize_chunks(
        self,
        text: str,
        rate: Optional[int] = None,
        volume: Optional[float] = None,
    ) -> bytes:
        """Stream Edge-TTS audio chunks and concatenate them into one MP3 blob.

        The library emits ``audio`` and ``WordBoundary`` events; we keep only
        the audio payloads and join them in-memory. For short Caronte replies
        (<220 tokens) this is under 100 KB, so the in-memory path is fine and
        avoids a round-trip through a temp file.
        """
        import edge_tts

        communicate = edge_tts.Communicate(
            text=text,
            voice=self._voice,
            rate=_format_rate(rate),
            volume=_format_volume(volume),
        )

        chunks: List[bytes] = []
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                chunks.append(chunk["data"])
        return b"".join(chunks)

    def get_available_voices(self) -> List[Dict[str, object]]:
        """
        Return a short curated list of Edge-TTS voices suitable for Caronte.

        Edge-TTS exposes hundreds of Azure Neural voices; we surface a handful
        that sound natural for F1 strategy chatter and stay consistent with
        the English-first UX. Callers can pass any valid Azure voice ID via
        ``set_voice`` \u2014 this list is only what the UI currently offers.
        """
        return [
            {
                "id": "en-US-AriaNeural",
                "name": "Aria (US female, conversational)",
                "languages": ["en"],
                "gender": "Female",
            },
            {
                "id": "en-US-GuyNeural",
                "name": "Guy (US male, newscast)",
                "languages": ["en"],
                "gender": "Male",
            },
            {
                "id": "en-GB-RyanNeural",
                "name": "Ryan (UK male, engineer tone)",
                "languages": ["en"],
                "gender": "Male",
            },
            {
                "id": "en-GB-SoniaNeural",
                "name": "Sonia (UK female, calm)",
                "languages": ["en"],
                "gender": "Female",
            },
        ]

    def set_voice(self, voice_id: str) -> bool:
        """Swap the default voice used for subsequent ``synthesize_speech``
        calls. Accepts any valid Azure voice ID; returns ``True`` after the
        swap so callers can report success to the UI.
        """
        self._voice = voice_id
        logger.info("Edge-TTS voice set to '%s'", voice_id)
        return True


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

    print("TTS Service Test \u2014 Edge-TTS")
    print("=" * 50)

    tts = TTSService()

    print("\nAvailable voices:")
    for v in tts.get_available_voices():
        print(f"  {v['id']} \u2014 {v['name']}")

    print("\nGenerating test audio...")
    text = "Box box, pit this lap. Undercut window is open."
    audio = tts.synthesize_speech(text)
    print(f"Generated {len(audio)} bytes of audio")

    with open("test_tts_edge.mp3", "wb") as f:
        f.write(audio)
    print("Saved to test_tts_edge.mp3")
