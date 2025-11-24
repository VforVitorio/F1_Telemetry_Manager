"""
Pydantic Models for Voice Chat API

Defines request/response schemas for voice endpoints.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional


class TranscriptionResponse(BaseModel):
    """Response model for audio transcription."""

    text: str = Field(..., description="Transcribed text from audio")
    language: str = Field(..., description="Detected or specified language code")
    duration: float = Field(..., description="Audio duration in seconds", ge=0)

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Why did Verstappen pit on lap 15?",
                "language": "en",
                "duration": 3.5
            }
        }


class TTSRequest(BaseModel):
    """Request model for text-to-speech synthesis."""

    text: str = Field(..., description="Text to synthesize", min_length=1)
    rate: Optional[int] = Field(
        175,
        description="Speech rate in words per minute",
        ge=50,
        le=400
    )
    volume: Optional[float] = Field(
        0.9,
        description="Volume level",
        ge=0.0,
        le=1.0
    )

    @validator('text')
    def validate_text_not_empty(cls, v):
        """Ensure text is not just whitespace."""
        if not v.strip():
            raise ValueError("Text cannot be empty or only whitespace")
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Hello, I am Caronte, your F1 assistant.",
                "rate": 175,
                "volume": 0.9
            }
        }


class VoiceChatRequest(BaseModel):
    """Request model for full voice chat flow."""

    context: Optional[dict] = Field(
        None,
        description="F1 telemetry context (year, gp, session, drivers, etc.)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "context": {
                    "year": 2024,
                    "gp": "Spanish Grand Prix",
                    "session": "Q",
                    "drivers": ["VER", "HAM"]
                }
            }
        }


class VoiceChatResponse(BaseModel):
    """Response model for full voice chat flow."""

    transcript: str = Field(..., description="User's transcribed question")
    response_text: str = Field(..., description="Assistant's text response")
    audio_base64: str = Field(..., description="Base64 encoded audio response")
    processing_time: float = Field(..., description="Total processing time in seconds", ge=0)

    class Config:
        json_schema_extra = {
            "example": {
                "transcript": "Why did Verstappen pit on lap 15?",
                "response_text": "Verstappen pitted on lap 15 to switch to soft tires...",
                "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEA...",
                "processing_time": 3.2
            }
        }


class VoiceHealthResponse(BaseModel):
    """Response model for voice service health check."""

    status: str = Field(..., description="Overall health status")
    stt_ready: bool = Field(..., description="Speech-to-text service status")
    tts_ready: bool = Field(..., description="Text-to-speech service status")
    stt_model: Optional[str] = Field(None, description="STT model name")
    error: Optional[str] = Field(None, description="Error message if unhealthy")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "stt_ready": True,
                "tts_ready": True,
                "stt_model": "base"
            }
        }


class AvailableVoicesResponse(BaseModel):
    """Response model for available TTS voices."""

    voices: list = Field(..., description="List of available voices")
    count: int = Field(..., description="Number of available voices", ge=0)

    class Config:
        json_schema_extra = {
            "example": {
                "voices": [
                    {
                        "id": "HKEY_LOCAL_MACHINE\\...\\David",
                        "name": "Microsoft David Desktop",
                        "languages": ["en-US"]
                    }
                ],
                "count": 1
            }
        }
