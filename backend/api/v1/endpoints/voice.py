"""
Voice Chat API Endpoints

Provides endpoints for speech-to-text, text-to-speech, and full voice chat flow.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import Response
import base64
import time
import logging
from typing import Optional

from backend.models.voice_models import (
    TranscriptionResponse,
    TTSRequest,
    VoiceChatRequest,
    VoiceChatResponse,
    VoiceHealthResponse,
    AvailableVoicesResponse
)
from backend.services.voice.stt_service import get_stt_service
from backend.services.voice.tts_service import get_tts_service
from backend.services.voice.audio_processor import AudioProcessor
from backend.services.chatbot.lmstudio_service import (
    send_message as lm_send_message,
    build_messages,
    LMStudioError
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Service instances (lazy-loaded singletons)
_stt_service = None
_tts_service = None


def _get_stt_service():
    """Get or initialize STT service."""
    global _stt_service
    if _stt_service is None:
        try:
            _stt_service = get_stt_service()
        except Exception as e:
            logger.error(f"Failed to initialize STT service: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"STT service unavailable: {str(e)}"
            )
    return _stt_service


def _get_tts_service():
    """Get or initialize TTS service."""
    global _tts_service
    if _tts_service is None:
        try:
            _tts_service = get_tts_service()
        except Exception as e:
            logger.error(f"Failed to initialize TTS service: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"TTS service unavailable: {str(e)}"
            )
    return _tts_service


def _validate_audio_file(audio: UploadFile) -> None:
    """
    Validate uploaded audio file.

    Args:
        audio: Uploaded audio file

    Raises:
        HTTPException: If validation fails
    """
    if not audio.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )

    # Check file extension (basic validation)
    allowed_extensions = {'.wav', '.mp3', '.webm', '.ogg', '.m4a'}
    file_ext = audio.filename.lower().split('.')[-1]
    if f'.{file_ext}' not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: {file_ext}. "
                   f"Allowed: {', '.join(allowed_extensions)}"
        )


def _read_audio_file(audio: UploadFile) -> bytes:
    """
    Read audio file bytes.

    Args:
        audio: Uploaded audio file

    Returns:
        Audio bytes

    Raises:
        HTTPException: If reading fails
    """
    try:
        return audio.file.read()
    except Exception as e:
        logger.error(f"Failed to read audio file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read audio file"
        )


@router.post(
    "/transcribe",
    response_model=TranscriptionResponse,
    summary="Transcribe audio to text",
    description="Convert audio file to text using Whisper STT"
)
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Transcribe audio to text using Whisper.

    Args:
        audio: Audio file (wav, mp3, webm, ogg, m4a)

    Returns:
        Transcription with text, language, and duration
    """
    _validate_audio_file(audio)

    try:
        # Read audio bytes
        audio_bytes = _read_audio_file(audio)
        logger.info(f"Received audio file: {audio.filename} ({len(audio_bytes)} bytes)")

        # Transcribe
        stt = _get_stt_service()
        result = stt.transcribe_audio(audio_bytes)

        return TranscriptionResponse(**result)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(e)}"
        )


@router.post(
    "/synthesize",
    summary="Convert text to speech",
    description="Generate audio from text using pyttsx3 TTS",
    response_class=Response
)
async def synthesize_speech(request: TTSRequest):
    """
    Convert text to speech using pyttsx3.

    Args:
        request: TTS request with text, rate, and volume

    Returns:
        WAV audio file
    """
    try:
        tts = _get_tts_service()
        audio_bytes = tts.synthesize_speech(
            text=request.text,
            rate=request.rate,
            volume=request.volume
        )

        logger.info(f"Generated {len(audio_bytes)} bytes of speech audio")

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=speech.wav"
            }
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Speech synthesis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {str(e)}"
        )


@router.post(
    "/voice-chat",
    response_model=VoiceChatResponse,
    summary="Full voice chat flow",
    description="Complete flow: STT → LM Studio LLM → TTS"
)
async def voice_chat(
    audio: UploadFile = File(...),
    # context is sent as form data, will be parsed manually if needed
):
    """
    Full voice chat flow: STT → LM Studio LLM → TTS

    Args:
        audio: Audio file with user's question

    Returns:
        Transcript, LM Studio response text, and synthesized audio

    Note:
        Voice chat is currently single-turn (no conversation history).
        Future enhancement could add multi-turn conversation support.
    """
    _validate_audio_file(audio)
    start_time = time.time()

    try:
        # Step 1: Transcribe audio (STT)
        audio_bytes = _read_audio_file(audio)
        logger.info(f"Voice chat: processing {len(audio_bytes)} bytes")

        stt = _get_stt_service()
        transcription = stt.transcribe_audio(audio_bytes)
        user_text = transcription["text"]

        logger.info(f"Transcribed: '{user_text}'")

        # Step 2: Get LLM response from LM Studio
        try:
            # Build messages array (no chat history for voice chat - single turn)
            messages = build_messages(
                user_message=user_text,
                chat_history=[],  # Voice chat is single-turn for now
                context={}  # Could add F1 context in future
            )

            # Send to LM Studio
            lm_response = lm_send_message(
                messages=messages,
                model=None,  # Use default model
                temperature=0.7,  # Balanced creativity
                max_tokens=500,  # Reasonable length for TTS
                stream=False
            )

            # Extract response content
            if "choices" in lm_response and len(lm_response["choices"]) > 0:
                response_text = lm_response["choices"][0]["message"]["content"]
            else:
                logger.warning("No response from LM Studio, using fallback")
                response_text = "I'm sorry, I couldn't generate a response. Please try again."

        except LMStudioError as e:
            logger.error(f"LM Studio error: {e}")
            response_text = "I'm having trouble connecting to the language model. Please ensure LM Studio is running."
        except Exception as e:
            logger.error(f"Unexpected error with LM Studio: {e}")
            response_text = "An unexpected error occurred. Please try again."

        logger.info(f"Generated response: '{response_text[:50]}...'")

        # Step 3: Synthesize response (TTS)
        tts = _get_tts_service()
        response_audio = tts.synthesize_speech(response_text)

        # Encode audio as base64
        audio_base64 = base64.b64encode(response_audio).decode('utf-8')

        processing_time = time.time() - start_time
        logger.info(f"Voice chat completed in {processing_time:.2f}s")

        return VoiceChatResponse(
            transcript=user_text,
            response_text=response_text,
            audio_base64=audio_base64,
            processing_time=processing_time
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Voice chat failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice chat failed: {str(e)}"
        )


@router.get(
    "/health",
    response_model=VoiceHealthResponse,
    summary="Health check",
    description="Check if voice services are ready"
)
async def health_check():
    """
    Check if voice services (STT and TTS) are ready.

    Returns:
        Health status with service availability
    """
    try:
        stt = _get_stt_service()
        tts = _get_tts_service()

        stt_ready = stt.is_model_loaded()
        tts_ready = True  # TTS is always ready if initialized

        model_info = stt.get_model_info()

        return VoiceHealthResponse(
            status="healthy" if (stt_ready and tts_ready) else "degraded",
            stt_ready=stt_ready,
            tts_ready=tts_ready,
            stt_model=model_info.get("model_name")
        )

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return VoiceHealthResponse(
            status="unhealthy",
            stt_ready=False,
            tts_ready=False,
            error=str(e)
        )


@router.get(
    "/voices",
    response_model=AvailableVoicesResponse,
    summary="Get available voices",
    description="List all available TTS voices on the system"
)
async def get_available_voices():
    """
    Get list of available TTS voices.

    Returns:
        List of available voices with IDs and names
    """
    try:
        tts = _get_tts_service()
        voices = tts.get_available_voices()

        return AvailableVoicesResponse(
            voices=voices,
            count=len(voices)
        )

    except Exception as e:
        logger.error(f"Failed to get voices: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get voices: {str(e)}"
        )
