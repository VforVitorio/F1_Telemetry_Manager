"""
Voice Chat API Endpoints

Provides endpoints for speech-to-text, text-to-speech, and full voice chat flow.
"""

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status

from backend.core.rate_limit import rate_limit
from fastapi.responses import Response
import asyncio
import base64
import time
import logging
from typing import Optional

from backend.models.voice_models import (
    TranscriptionResponse,
    TTSRequest,
    VoiceChatResponse,
    VoiceHealthResponse,
    AvailableVoicesResponse
)
from backend.services.voice.stt_service import get_stt_service
from backend.services.voice.tts_service import get_tts_service
from backend.services.chatbot.llm_service import (
    send_message as lm_send_message,
    build_messages,
    LLMServiceError
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


def _build_voice_system_prompt() -> str:
    """Return the system prompt that frames Caronte for a voice conversation.

    The prompt is tuned specifically for TTS playback: clipped sentences over
    lists, contractions instead of formal phrasing, spoken-friendly number
    handling, and a humility clause so the model does not fabricate F1 stats
    that will be read aloud as if authoritative. Keeping it in a helper keeps
    the ``voice_chat`` handler focused on orchestration and makes the prompt
    easy to tweak or A/B test without touching the request flow.
    """
    return (
        "You are Caronte, an F1 strategy co-pilot in a live voice conversation.\n"
        "\n"
        "SPOKEN STYLE\n"
        "- Speak like a paddock engineer talking to a friend: warm, concise, confident.\n"
        "- Keep replies to one to three short sentences. No lists, no markdown, no code blocks.\n"
        "- Use contractions (you're, it's, that's). Avoid section headers or bullet phrasing.\n"
        "- Write numbers the way you want them spoken: \"lap forty-eight\" beats \"L48\", "
        "\"two point three seconds\" beats \"2.3s\". Team and driver names stay verbatim.\n"
        "- Skip disclaimers and filler like \"Great question!\" or \"As an AI\".\n"
        "\n"
        "BEHAVIOUR\n"
        "- Only commit to a fact when you are sure. If you are guessing, say so in one clause.\n"
        "- If the user asks for strategy, deliver the call first, then a one-sentence reason.\n"
        "- End with a follow-up question only when it moves the conversation forward \u2014 "
        "silence is fine when the answer is complete.\n"
        "\n"
        "Every reply you produce will be read aloud by a neural TTS. Make it easy on the ear."
    )


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
        data = audio.file.read()
    except Exception as e:
        logger.error(f"Failed to read audio file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read audio file"
        )
    # Security C2: cap the upload so a huge body cannot exhaust memory / pin the STT worker.
    max_bytes = 10 * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file too large ({len(data)} bytes); max {max_bytes}.",
        )
    return data


@router.post(
    "/transcribe",
    dependencies=[Depends(rate_limit("voice-transcribe", capacity=6, per_minute=12))],
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
    dependencies=[Depends(rate_limit("voice-synthesize", capacity=6, per_minute=12))],
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
    dependencies=[Depends(rate_limit("voice-chat", capacity=6, per_minute=12))],
    response_model=VoiceChatResponse,
    summary="Full voice chat flow",
    description="Complete flow: STT (Nemotron, local) \u2192 LLM (provider via F1_LLM_PROVIDER) \u2192 TTS (Qwen3, local)"
)
async def voice_chat(
    audio: UploadFile = File(...),
    voice: Optional[str] = Form(None),
):
    """
    Full voice chat flow: STT \u2192 LLM \u2192 TTS.

    The STT (Nemotron) and TTS (Qwen3) run in-process within this backend.
    The middle LLM step is dispatched through llm_service, which reads
    the ``F1_LLM_PROVIDER`` env var to route to either LM Studio (default)
    or the OpenAI API. This lets voice chat reuse the same provider plumbing
    as the text chat and the strategy orchestrator without duplicating it.

    Args:
        audio: Audio file with user's question

    Returns:
        Transcript, LLM response text, and synthesized audio

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
        # Offload the blocking GPU STT off the event loop (LLM-cost L-3) so a
        # voice turn does not stall concurrent SSE sim / chat streams.
        transcription = await asyncio.to_thread(stt.transcribe_audio, audio_bytes)
        user_text = transcription["text"]

        logger.info(f"Transcribed: '{user_text}'")

        # Step 2: Get LLM response (provider routed by F1_LLM_PROVIDER)
        try:
            voice_system_prompt = _build_voice_system_prompt()

            # Build messages array (no chat history for voice chat - single turn)
            messages = build_messages(
                user_message=user_text,
                system_prompt=voice_system_prompt,
                chat_history=[],  # Voice chat is single-turn for now
                context={}  # Could add F1 context in future
            )

            # Send to the configured LLM provider (LM Studio or OpenAI), off the
            # event loop so the blocking request does not stall other streams.
            lm_response = await asyncio.to_thread(
                lm_send_message,
                messages=messages,
                model=None,  # Use provider default
                temperature=0.6,  # Slightly lower so the spoken output stays on-topic
                max_tokens=220,  # ~3 short sentences; keeps TTS latency in check
                stream=False,
            )

            # Extract response content
            if "choices" in lm_response and len(lm_response["choices"]) > 0:
                response_text = lm_response["choices"][0]["message"]["content"]
            else:
                logger.warning("Empty LLM response, using fallback")
                response_text = "Sorry, I couldn't put that together just now. Mind trying again?"

        except LLMServiceError as e:
            logger.error(f"LLM provider error: {e}")
            response_text = (
                "I'm having trouble reaching the language model right now. "
                "Check that your configured provider is running."
            )
        except Exception as e:
            logger.error(f"Unexpected error calling LLM: {e}")
            response_text = "Something went sideways on my end. Give it another go?"

        logger.info(f"Generated response: '{response_text[:50]}...'")

        # Step 3: Synthesize response (TTS) \u2014 await the async path so the
        # running event loop is reused instead of tripping asyncio.run().
        # If the caller selected a voice in the UI, swap it on the singleton
        # before synthesising so subsequent replies keep that choice.
        tts = _get_tts_service()
        if voice:
            tts.set_voice(voice)
        response_audio = await tts.synthesize_speech_async(response_text)

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
