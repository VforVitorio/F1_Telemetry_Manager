"""
Audio Processing Utilities

Provides audio format conversion, validation, and manipulation.
"""

import io
import logging
import sys
from pathlib import Path
from typing import Optional, Tuple
from pydub import AudioSegment

# Add backend to path for imports (when running as script)
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.voice_config import (
    AUDIO_SAMPLE_RATE,
    AUDIO_FORMAT,
    MAX_AUDIO_DURATION,
    MAX_AUDIO_SIZE
)

logger = logging.getLogger(__name__)


class AudioProcessor:
    """Utility class for audio processing operations."""

    @staticmethod
    def validate_audio_size(audio_bytes: bytes) -> None:
        """
        Validate audio file size.

        Args:
            audio_bytes: Audio data to validate

        Raises:
            ValueError: If audio size exceeds maximum
        """
        size_mb = len(audio_bytes) / (1024 * 1024)
        max_size_mb = MAX_AUDIO_SIZE / (1024 * 1024)

        if len(audio_bytes) > MAX_AUDIO_SIZE:
            raise ValueError(
                f"Audio file too large: {size_mb:.2f}MB "
                f"(max: {max_size_mb:.2f}MB)"
            )

    @staticmethod
    def validate_audio_duration(audio_segment: AudioSegment) -> None:
        """
        Validate audio duration.

        Args:
            audio_segment: Audio segment to validate

        Raises:
            ValueError: If audio duration exceeds maximum
        """
        duration_seconds = len(audio_segment) / 1000.0

        if duration_seconds > MAX_AUDIO_DURATION:
            raise ValueError(
                f"Audio too long: {duration_seconds:.2f}s "
                f"(max: {MAX_AUDIO_DURATION}s)"
            )

    @staticmethod
    def _load_audio_segment(
        audio_bytes: bytes,
        from_format: str
    ) -> AudioSegment:
        """
        Load audio bytes as AudioSegment.

        Args:
            audio_bytes: Audio data
            from_format: Source format (wav, mp3, webm, etc.)

        Returns:
            AudioSegment object
        """
        audio_io = io.BytesIO(audio_bytes)
        return AudioSegment.from_file(audio_io, format=from_format)

    @staticmethod
    def _export_audio_segment(
        audio_segment: AudioSegment,
        to_format: str
    ) -> bytes:
        """
        Export AudioSegment to bytes.

        Args:
            audio_segment: Audio to export
            to_format: Target format (wav, mp3, etc.)

        Returns:
            Audio bytes
        """
        output_io = io.BytesIO()
        audio_segment.export(output_io, format=to_format)
        return output_io.getvalue()

    @staticmethod
    def convert_audio_format(
        audio_bytes: bytes,
        from_format: str,
        to_format: str = AUDIO_FORMAT
    ) -> bytes:
        """
        Convert audio between formats.

        Args:
            audio_bytes: Source audio data
            from_format: Source format (wav, mp3, webm, ogg, etc.)
            to_format: Target format (default: wav)

        Returns:
            Converted audio bytes

        Raises:
            ValueError: If audio is invalid
            RuntimeError: If conversion fails
        """
        try:
            # Validate size
            AudioProcessor.validate_audio_size(audio_bytes)

            # Load audio
            audio_segment = AudioProcessor._load_audio_segment(
                audio_bytes,
                from_format
            )

            # Validate duration
            AudioProcessor.validate_audio_duration(audio_segment)

            # Convert format if needed
            if from_format.lower() != to_format.lower():
                audio_bytes = AudioProcessor._export_audio_segment(
                    audio_segment,
                    to_format
                )
                logger.info(
                    f"Converted audio from {from_format} to {to_format} "
                    f"({len(audio_bytes)} bytes)"
                )

            return audio_bytes

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Audio conversion failed: {e}")
            raise RuntimeError(f"Failed to convert audio: {e}")

    @staticmethod
    def normalize_audio(
        audio_bytes: bytes,
        format: str = AUDIO_FORMAT,
        target_dBFS: float = -20.0
    ) -> bytes:
        """
        Normalize audio volume.

        Args:
            audio_bytes: Audio data
            format: Audio format
            target_dBFS: Target loudness in dBFS (default: -20.0)

        Returns:
            Normalized audio bytes
        """
        try:
            # Load audio
            audio_segment = AudioProcessor._load_audio_segment(audio_bytes, format)

            # Normalize
            change_in_dBFS = target_dBFS - audio_segment.dBFS
            normalized_audio = audio_segment.apply_gain(change_in_dBFS)

            # Export
            normalized_bytes = AudioProcessor._export_audio_segment(
                normalized_audio,
                format
            )

            logger.info(f"Normalized audio ({change_in_dBFS:+.2f} dB)")
            return normalized_bytes

        except Exception as e:
            logger.error(f"Audio normalization failed: {e}")
            # Return original if normalization fails
            return audio_bytes

    @staticmethod
    def extract_audio_metadata(
        audio_bytes: bytes,
        format: str = AUDIO_FORMAT
    ) -> dict:
        """
        Extract audio metadata.

        Args:
            audio_bytes: Audio data
            format: Audio format

        Returns:
            Dictionary with duration, sample_rate, channels, etc.
        """
        try:
            audio_segment = AudioProcessor._load_audio_segment(audio_bytes, format)

            return {
                "duration_seconds": len(audio_segment) / 1000.0,
                "duration_ms": len(audio_segment),
                "sample_rate": audio_segment.frame_rate,
                "channels": audio_segment.channels,
                "sample_width": audio_segment.sample_width,
                "frame_count": audio_segment.frame_count(),
                "dBFS": audio_segment.dBFS,
                "max_dBFS": audio_segment.max_dBFS,
                "size_bytes": len(audio_bytes)
            }

        except Exception as e:
            logger.error(f"Failed to extract metadata: {e}")
            return {
                "error": str(e),
                "size_bytes": len(audio_bytes)
            }

    @staticmethod
    def resample_audio(
        audio_bytes: bytes,
        format: str = AUDIO_FORMAT,
        target_sample_rate: int = AUDIO_SAMPLE_RATE
    ) -> bytes:
        """
        Resample audio to target sample rate.

        Args:
            audio_bytes: Audio data
            format: Audio format
            target_sample_rate: Target sample rate in Hz

        Returns:
            Resampled audio bytes
        """
        try:
            audio_segment = AudioProcessor._load_audio_segment(audio_bytes, format)

            if audio_segment.frame_rate != target_sample_rate:
                resampled = audio_segment.set_frame_rate(target_sample_rate)
                audio_bytes = AudioProcessor._export_audio_segment(resampled, format)
                logger.info(
                    f"Resampled audio from {audio_segment.frame_rate}Hz "
                    f"to {target_sample_rate}Hz"
                )

            return audio_bytes

        except Exception as e:
            logger.error(f"Audio resampling failed: {e}")
            return audio_bytes


# Test/Demo code
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("🎵 Audio Processor Test")
    print("=" * 50)

    print("\n✅ Audio Processor ready!")
    print("Use convert_audio_format(), normalize_audio(), etc. to process audio.")
