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
    """
    try:
        response = httpx.get(f"{CHAT_API_BASE}/health", timeout=None)
        if response.status_code == 200:
            data = response.json()
            return data.get("lm_studio_reachable", False)
        return False
    except Exception as e:
        # Silently fail, don't show error
        return False


def get_available_models() -> List[str]:
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names available in LM Studio
    """
    try:
        response = httpx.get(f"{CHAT_API_BASE}/models", timeout=None)
        if response.status_code == 200:
            return response.json().get("models", [])
        return []
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
        image: Optional image bytes
        chat_history: Previous chat messages for context
        context: F1 session context (year, GP, session, drivers, etc.)
        model: Model name to use
        temperature: Temperature parameter for generation

    Yields:
        Chunks of the assistant's response as they arrive
    """
    try:
        # Convert image bytes to base64 for JSON serialization
        import base64
        image_b64 = None
        if image:
            if isinstance(image, bytes):
                image_b64 = base64.b64encode(image).decode('utf-8')
            elif isinstance(image, str):
                # Already base64 encoded
                image_b64 = image

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{CHAT_API_BASE}/stream",
                json={
                    "text": text,
                    "image": image_b64,
                    "chat_history": chat_history or [],
                    "context": context or {},
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 1000
                }
            ) as response:
                async for chunk in response.aiter_text():
                    if chunk:
                        yield chunk

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
        image: Optional image bytes
        chat_history: Previous chat messages for context
        context: F1 session context
        model: Model name to use
        temperature: Temperature parameter for generation

    Returns:
        Complete assistant response
    """
    try:
        # Convert image bytes to base64 for JSON serialization
        import base64
        image_b64 = None
        if image:
            if isinstance(image, bytes):
                image_b64 = base64.b64encode(image).decode('utf-8')
            elif isinstance(image, str):
                # Already base64 encoded
                image_b64 = image

        response = httpx.post(
            f"{CHAT_API_BASE}/message",
            json={
                "text": text,
                "image": image_b64,
                "chat_history": chat_history or [],
                "context": context or {},
                "model": model,
                "temperature": temperature,
                "max_tokens": 1000
            },
            timeout=None
        )

        if response.status_code == 200:
            return response.json().get("response", "")
        else:
            error_msg = f"Backend returned status {response.status_code}"
            st.error(error_msg)
            return f"Error: {error_msg}"

    except Exception as e:
        st.error(f"Error sending message: {e}")
        return f"Error: {str(e)}"
