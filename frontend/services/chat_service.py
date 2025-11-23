"""
Chat Service

Handles communication with the backend chat API and LM Studio.
Provides functions for streaming messages, checking health, and managing models.
"""

import httpx
from typing import Optional, Dict, List, Any, AsyncIterator
import streamlit as st


# Backend API configuration
BACKEND_BASE_URL = "http://localhost:8000"  # Adjust as needed
CHAT_API_BASE = f"{BACKEND_BASE_URL}/api/v1/chat"


def check_lm_studio_health() -> bool:
    """
    Check if LM Studio is accessible and healthy.

    Returns:
        bool: True if LM Studio is reachable and healthy, False otherwise

    TODO: Implement actual health check when backend is ready
    """
    try:
        # TODO: Replace with actual API call
        # response = httpx.get(f"{CHAT_API_BASE}/health", timeout=5.0)
        # return response.status_code == 200 and response.json().get("lm_studio_reachable", False)

        # Placeholder - assume healthy for now
        return True
    except Exception as e:
        st.error(f"Error checking LM Studio health: {e}")
        return False


def get_available_models() -> List[str]:
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names available in LM Studio

    TODO: Implement actual model listing when backend is ready
    """
    try:
        # TODO: Replace with actual API call
        # response = httpx.get(f"{CHAT_API_BASE}/models", timeout=5.0)
        # return response.json().get("models", [])

        # Placeholder - return default models
        return ["llama3.2-vision", "bakllava", "llava-v1.6"]
    except Exception as e:
        st.error(f"Error fetching models: {e}")
        return []


async def stream_message(
    text: str,
    image: Optional[bytes] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1
) -> AsyncIterator[str]:
    """
    Send a message to LM Studio and stream the response.

    Args:
        text: User message text
        image: Optional image bytes (base64 encoded)
        chat_history: Previous chat messages for context
        context: F1 session context (year, GP, session, drivers, etc.)
        model: Model name to use
        temperature: Temperature parameter for generation

    Yields:
        Chunks of the assistant's response as they arrive

    TODO: Implement actual streaming when backend is ready
    """
    try:
        # TODO: Replace with actual streaming API call
        # async with httpx.AsyncClient() as client:
        #     async with client.stream(
        #         "POST",
        #         f"{CHAT_API_BASE}/stream",
        #         json={
        #             "text": text,
        #             "image": image,
        #             "chat_history": chat_history or [],
        #             "context": context or {},
        #             "model": model,
        #             "temperature": temperature
        #         },
        #         timeout=120.0
        #     ) as response:
        #         async for chunk in response.aiter_text():
        #             yield chunk

        # Placeholder - yield a mock response
        placeholder_response = (
            f"This is a placeholder streaming response. "
            f"The actual LLM integration will be implemented when the backend is ready. "
            f"You asked: '{text}' with model '{model}' at temperature {temperature}."
        )

        # Simulate streaming by yielding word by word
        for word in placeholder_response.split():
            yield word + " "

    except Exception as e:
        st.error(f"Error streaming message: {e}")
        yield f"Error: {str(e)}"


def send_message(
    text: str,
    image: Optional[bytes] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1
) -> str:
    """
    Send a message to LM Studio and get the complete response (non-streaming).

    Args:
        text: User message text
        image: Optional image bytes (base64 encoded)
        chat_history: Previous chat messages for context
        context: F1 session context
        model: Model name to use
        temperature: Temperature parameter for generation

    Returns:
        Complete assistant response

    TODO: Implement actual API call when backend is ready
    """
    try:
        # TODO: Replace with actual API call
        # response = httpx.post(
        #     f"{CHAT_API_BASE}/message",
        #     json={
        #         "text": text,
        #         "image": image,
        #         "chat_history": chat_history or [],
        #         "context": context or {},
        #         "model": model,
        #         "temperature": temperature
        #     },
        #     timeout=120.0
        # )
        # return response.json().get("response", "")

        # Placeholder
        return (
            f"This is a placeholder response. "
            f"The actual LLM integration will be implemented when the backend is ready. "
            f"You asked: '{text}' with model '{model}' at temperature {temperature}."
        )

    except Exception as e:
        st.error(f"Error sending message: {e}")
        return f"Error: {str(e)}"
