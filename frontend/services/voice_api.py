"""
Voice API Service

Handles communication with the backend voice API.
Provides functions for speech-to-text, text-to-speech, and voice chat.
"""

import httpx
import base64
from typing import Optional, Dict, List, Any
from pathlib import Path
import streamlit as st


# Backend API configuration
BACKEND_BASE_URL = "http://localhost:8000"
VOICE_API_BASE = f"{BACKEND_BASE_URL}/api/v1/voice"

# Request timeouts
TRANSCRIBE_TIMEOUT = None
SYNTHESIZE_TIMEOUT = None
VOICE_CHAT_TIMEOUT = None
HEALTH_CHECK_TIMEOUT = 10.0


def check_voice_health() -> Dict[str, Any]:
    """
    Check if voice services (STT and TTS) are ready.

    Returns:
        Dict with health status:
        - status: "healthy", "degraded", or "unhealthy"
        - stt_ready: bool
        - tts_ready: bool
        - stt_model: str (model name)
        - error: str (if any)
    """
    try:
        response = httpx.get(
            f"{VOICE_API_BASE}/health",
            timeout=HEALTH_CHECK_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()

        return {
            "status": "unhealthy",
            "stt_ready": False,
            "tts_ready": False,
            "error": f"Backend returned status {response.status_code}"
        }

    except httpx.TimeoutException:
        return {
            "status": "unhealthy",
            "stt_ready": False,
            "tts_ready": False,
            "error": "Health check timed out"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "stt_ready": False,
            "tts_ready": False,
            "error": str(e)
        }


def get_available_voices() -> List[Dict[str, str]]:
    """
    Get list of available TTS voices.

    Returns:
        List of voice dicts with:
        - id: voice ID
        - name: voice name
        - language: language code (e.g., "en-US")
    """
    try:
        response = httpx.get(
            f"{VOICE_API_BASE}/voices",
            timeout=HEALTH_CHECK_TIMEOUT
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("voices", [])

        st.error(f"Failed to fetch voices: status {response.status_code}")
        return []

    except Exception as e:
        st.error(f"Error fetching voices: {e}")
        return []


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> Optional[Dict[str, Any]]:
    """
    Transcribe audio to text using Whisper STT.

    Args:
        audio_bytes: Raw audio file bytes
        filename: Original filename (for content type detection)

    Returns:
        Dict with transcription result:
        - text: transcribed text
        - language: detected language
        - duration: audio duration in seconds
        Returns None if transcription fails.
    """
    if not audio_bytes:
        st.error("No audio data provided")
        return None

    try:
        # Prepare multipart file upload
        files = {
            "audio": (filename, audio_bytes, _get_audio_content_type(filename))
        }

        response = httpx.post(
            f"{VOICE_API_BASE}/transcribe",
            files=files,
            timeout=TRANSCRIBE_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()

        error_detail = _extract_error_detail(response)
        st.error(f"Transcription failed: {error_detail}")
        return None

    except httpx.TimeoutException:
        st.error("Transcription timed out. Please try with a shorter audio clip.")
        return None
    except Exception as e:
        st.error(f"Error during transcription: {e}")
        return None


def synthesize_speech(
    text: str,
    rate: int = 175,
    volume: float = 0.9
) -> Optional[bytes]:
    """
    Convert text to speech using TTS.

    Args:
        text: Text to convert to speech
        rate: Speech rate (words per minute, default 175)
        volume: Volume level (0.0 to 1.0, default 0.9)

    Returns:
        Audio bytes (WAV format) or None if synthesis fails
    """
    if not text or not text.strip():
        st.error("No text provided for synthesis")
        return None

    try:
        response = httpx.post(
            f"{VOICE_API_BASE}/synthesize",
            json={
                "text": text,
                "rate": rate,
                "volume": volume
            },
            timeout=SYNTHESIZE_TIMEOUT
        )

        if response.status_code == 200:
            return response.content

        error_detail = _extract_error_detail(response)
        st.error(f"Speech synthesis failed: {error_detail}")
        return None

    except httpx.TimeoutException:
        st.error("Speech synthesis timed out")
        return None
    except Exception as e:
        st.error(f"Error during speech synthesis: {e}")
        return None


def voice_chat(audio_bytes: bytes, filename: str = "audio.wav") -> Optional[Dict[str, Any]]:
    """
    Full voice chat flow: STT → LLM → TTS.

    Args:
        audio_bytes: Raw audio file bytes with user's question
        filename: Original filename (for content type detection)

    Returns:
        Dict with voice chat result:
        - transcript: user's transcribed text
        - response_text: LLM's text response
        - audio_base64: base64-encoded audio response
        - processing_time: total processing time in seconds
        Returns None if voice chat fails.
    """
    if not audio_bytes:
        st.error("No audio data provided")
        return None

    try:
        # Prepare multipart file upload
        files = {
            "audio": (filename, audio_bytes, _get_audio_content_type(filename))
        }

        response = httpx.post(
            f"{VOICE_API_BASE}/voice-chat",
            files=files,
            timeout=VOICE_CHAT_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()

        error_detail = _extract_error_detail(response)
        st.error(f"Voice chat failed: {error_detail}")
        return None

    except httpx.TimeoutException:
        st.error("Voice chat timed out. Please try again.")
        return None
    except Exception as e:
        st.error(f"Error during voice chat: {e}")
        return None


def decode_audio_base64(audio_base64: str) -> bytes:
    """
    Decode base64-encoded audio to bytes.

    Args:
        audio_base64: Base64-encoded audio string

    Returns:
        Decoded audio bytes
    """
    return base64.b64decode(audio_base64)


def _get_audio_content_type(filename: str) -> str:
    """
    Get MIME content type based on audio file extension.

    Args:
        filename: Audio filename

    Returns:
        MIME type string
    """
    extension = Path(filename).suffix.lower()

    content_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4"
    }

    return content_types.get(extension, "audio/wav")


def _extract_error_detail(response: httpx.Response) -> str:
    """
    Extract error detail from API response.

    Args:
        response: HTTP response object

    Returns:
        Error detail string
    """
    try:
        error_data = response.json()
        return error_data.get("detail", f"Status {response.status_code}")
    except Exception:
        return f"Status {response.status_code}"
