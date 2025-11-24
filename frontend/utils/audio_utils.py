"""
Audio Utilities

Helper functions for audio processing in the frontend.
Handles audio format conversion, validation, and encoding.
"""

import io
import base64
from typing import Optional, Tuple
from pathlib import Path


def validate_audio_file(audio_bytes: bytes, filename: str) -> Tuple[bool, Optional[str]]:
    """
    Validate audio file format and size.

    Args:
        audio_bytes: Raw audio file bytes
        filename: Original filename

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if valid, False otherwise
        - error_message: None if valid, error string if invalid
    """
    # Check if empty
    if not audio_bytes or len(audio_bytes) == 0:
        return False, "Audio file is empty"

    # Check file extension
    allowed_extensions = {".wav", ".mp3", ".webm", ".ogg", ".m4a"}
    file_ext = Path(filename).suffix.lower()

    if file_ext not in allowed_extensions:
        return False, f"Unsupported format: {file_ext}. Allowed: {', '.join(allowed_extensions)}"

    # Check file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if len(audio_bytes) > max_size:
        size_mb = len(audio_bytes) / (1024 * 1024)
        return False, f"File too large: {size_mb:.1f}MB (max 10MB)"

    return True, None


def encode_audio_to_base64(audio_bytes: bytes) -> str:
    """
    Encode audio bytes to base64 string.

    Args:
        audio_bytes: Raw audio bytes

    Returns:
        Base64-encoded string
    """
    return base64.b64encode(audio_bytes).decode('utf-8')


def decode_audio_from_base64(audio_base64: str) -> bytes:
    """
    Decode base64 string to audio bytes.

    Args:
        audio_base64: Base64-encoded audio string

    Returns:
        Decoded audio bytes
    """
    return base64.b64decode(audio_base64)


def get_audio_duration_estimate(audio_bytes: bytes, sample_rate: int = 16000) -> float:
    """
    Estimate audio duration from file size.
    Note: This is a rough estimate based on typical WAV encoding.

    Args:
        audio_bytes: Raw audio bytes
        sample_rate: Sample rate in Hz (default 16000)

    Returns:
        Estimated duration in seconds
    """
    # Rough estimate: WAV is typically 2 bytes per sample (16-bit) + header (~44 bytes)
    header_size = 44
    bytes_per_sample = 2
    data_size = len(audio_bytes) - header_size

    if data_size <= 0:
        return 0.0

    num_samples = data_size / bytes_per_sample
    duration = num_samples / sample_rate

    return max(0.0, duration)


def format_duration(seconds: float) -> str:
    """
    Format duration in seconds to human-readable string.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string (e.g., "1:23" or "0:05")
    """
    minutes = int(seconds // 60)
    remaining_seconds = int(seconds % 60)
    return f"{minutes}:{remaining_seconds:02d}"


def create_audio_data_url(audio_bytes: bytes, mime_type: str = "audio/wav") -> str:
    """
    Create a data URL for audio playback in HTML.

    Args:
        audio_bytes: Raw audio bytes
        mime_type: MIME type of the audio

    Returns:
        Data URL string
    """
    base64_audio = encode_audio_to_base64(audio_bytes)
    return f"data:{mime_type};base64,{base64_audio}"


def get_mime_type_from_filename(filename: str) -> str:
    """
    Get MIME type based on file extension.

    Args:
        filename: Audio filename

    Returns:
        MIME type string
    """
    extension = Path(filename).suffix.lower()

    mime_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4"
    }

    return mime_types.get(extension, "audio/wav")
