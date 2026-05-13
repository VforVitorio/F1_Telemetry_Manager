"""
Chatbot Services Package

Contains services for chatbot functionality including LM Studio integration.
"""

from .llm_service import (
    check_health,
    get_available_models,
    send_message,
    stream_message,
    build_messages,
    LLMServiceError
)

__all__ = [
    "check_health",
    "get_available_models",
    "send_message",
    "stream_message",
    "build_messages",
    "LLMServiceError"
]
