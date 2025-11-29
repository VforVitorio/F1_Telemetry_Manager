"""
Text-to-Speech Service using Edge TTS

Provides high-quality neural speech synthesis using Microsoft Edge's TTS service.
Requires internet connection but has no local dependencies or model downloads.
"""

from backend.core.voice_config import TTS_RATE, TTS_VOLUME
import logging
import sys
from pathlib import Path
from typing import Optional, List, Dict
import io
import asyncio
import nest_asyncio

# Allow nested event loops (for running async code in FastAPI)
nest_asyncio.apply()

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


logger = logging.getLogger(__name__)

# Lazy import edge-tts to avoid loading at import time
edge_tts = None


def _import_edge_tts():
    """Lazy import of edge-tts library."""
    global edge_tts
    if edge_tts is None:
        try:
            import edge_tts as _edge_tts
            edge_tts = _edge_tts
        except ImportError as e:
            logger.error(f"Failed to import edge-tts library: {e}")
            raise ImportError(
                "edge-tts not installed. Install with: pip install edge-tts"
            )


class TTSService:
    """Text-to-Speech service using Microsoft Edge TTS."""

    def __init__(self):
        """Initialize Edge TTS service."""
        try:
            _import_edge_tts()

            # Default to Andrew Multilingual voice
            self.voice = "en-US-AndrewMultilingualNeural"  # Male, multilingual, natural

            logger.info(
                f"Edge TTS Service initialized with voice: {self.voice}")
        except Exception as e:
            logger.error(f"Failed to initialize TTS engine: {e}")
            raise

    async def _synthesize_async(self, text: str, rate: str, volume: str) -> bytes:
        """
        Asynchronous speech synthesis using edge-tts.

        Args:
            text: Text to synthesize
            rate: Rate adjustment (e.g., '+0%', '-20%', '+50%')
            volume: Volume adjustment (e.g., '+0%', '-50%', '+20%')

        Returns:
            Audio bytes in MP3 format
        """
        communicate = edge_tts.Communicate(
            text, self.voice, rate=rate, volume=volume)

        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        return b"".join(audio_chunks)

    def synthesize_speech(
        self,
        text: str,
        rate: Optional[int] = None,
        volume: Optional[float] = None
    ) -> bytes:
        """
        Convert text to speech audio using Edge TTS.

        Args:
            text: Text to synthesize
            rate: Speech rate (words per minute), default from config
            volume: Volume level (0.0 to 1.0), default from config

        Returns:
            Audio bytes in MP3 format

        Raises:
            ValueError: If text is empty
            RuntimeError: If synthesis fails
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        # Use defaults if not provided
        if rate is None:
            rate = TTS_RATE
        if volume is None:
            volume = TTS_VOLUME

        try:
            # Convert rate from WPM to percentage
            # 175 WPM is baseline (0%), faster is +%, slower is -%
            rate_percentage = int((rate / 175.0 - 1.0) * 100)
            rate_str = f"{rate_percentage:+d}%"

            # Convert volume from 0.0-1.0 to percentage
            volume_percentage = int((volume - 1.0) * 100)
            volume_str = f"{volume_percentage:+d}%"

            logger.info(
                f"Synthesizing text: '{text[:50]}...' (rate={rate_str}, volume={volume_str})")

            # Run async synthesis (nest_asyncio allows this in FastAPI)
            audio_bytes = asyncio.run(
                self._synthesize_async(text, rate_str, volume_str)
            )

            logger.info(f"Generated {len(audio_bytes)} bytes of audio")
            return audio_bytes

        except Exception as e:
            logger.error(f"Speech synthesis failed: {e}")
            raise RuntimeError(f"Failed to synthesize speech: {e}")

    def get_available_voices(self) -> List[Dict[str, any]]:
        """
        Get list of available English voices from Edge TTS.

        Returns:
            List of English voice options
        """
        return [
            {
                'id': 'en-US-AndrewMultilingualNeural',
                'name': 'Andrew (English US, Male, Multilingual)',
                'languages': ['en-US', 'multilingual'],
                'gender': 'Male'
            },
            {
                'id': 'en-US-AriaNeural',
                'name': 'Aria (English US, Female)',
                'languages': ['en-US'],
                'gender': 'Female'
            },
            {
                'id': 'en-US-GuyNeural',
                'name': 'Guy (English US, Male)',
                'languages': ['en-US'],
                'gender': 'Male'
            },
            {
                'id': 'en-GB-SoniaNeural',
                'name': 'Sonia (English UK, Female)',
                'languages': ['en-GB'],
                'gender': 'Female'
            },
            {
                'id': 'en-GB-RyanNeural',
                'name': 'Ryan (English UK, Male)',
                'languages': ['en-GB'],
                'gender': 'Male'
            }
        ]

    def set_voice(self, voice_id: str) -> bool:
        """
        Set voice by ID.

        Args:
            voice_id: Voice ID (e.g., 'en-US-AriaNeural')

        Returns:
            True if voice was set successfully
        """
        available_ids = [v['id'] for v in self.get_available_voices()]
        if voice_id in available_ids:
            self.voice = voice_id
            logger.info(f"Voice changed to: {voice_id}")
            return True
        else:
            logger.warning(
                f"Voice ID '{voice_id}' not found in available voices")
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

    print("Edge TTS Service Test")
    print("=" * 50)

    tts = TTSService()

    print("\nAvailable voices:")
    for i, voice in enumerate(tts.get_available_voices(), 1):
        print(f"  {i}. {voice['name']}")
        print(f"     ID: {voice['id']}")
        print(f"     Gender: {voice['gender']}")

    print("\nGenerating test audio...")
    text = "Hello, I am Caronte, your Formula 1 strategy assistant."
    audio = tts.synthesize_speech(text)
    print(f"✅ Generated {len(audio)} bytes of audio")

    # Save test audio
    with open("test_tts_edge.mp3", "wb") as f:
        f.write(audio)
    print("Saved to test_tts_edge.mp3")
    print("\nTest complete! Edge TTS provides high-quality natural voices.")
