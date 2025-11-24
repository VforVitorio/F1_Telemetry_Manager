"""
Chat Models

Pydantic models for chat API request/response validation.
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ChatMessage(BaseModel):
    """Single chat message."""
    role: str
    content: str


class ChatRequest(BaseModel):
    """Request model for chat messages."""
    text: str
    image: Optional[str] = None  # Base64 encoded image (for future multimodal support)
    chat_history: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 1000


class ChatResponse(BaseModel):
    """Response model for chat messages."""
    response: str
    llm_model: Optional[str] = None
    tokens_used: Optional[int] = None


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    lm_studio_reachable: bool
    message: str
    models_available: Optional[int] = None
