"""
Chat Service

Handles communication with the backend chat API and LM Studio.
Provides functions for streaming messages, checking health, and managing models.
"""

import httpx
from typing import Optional, Dict, List, Any, AsyncIterator
import streamlit as st
import base64
import imghdr


# Backend API configuration
BACKEND_BASE_URL = "http://localhost:8000"  # Adjust as needed
CHAT_API_BASE = f"{BACKEND_BASE_URL}/api/v1/chat"


def format_image_for_vision_model(image_bytes: bytes) -> str:
    """
    Format image bytes as a proper Data URI for vision models.

    LM Studio (and OpenAI-compatible APIs) require images in the format:
    data:image/jpeg;base64,{base64_encoded_data}

    Args:
        image_bytes: Raw image bytes

    Returns:
        Properly formatted Data URI string
    """
    # Detect image type
    image_type = imghdr.what(None, h=image_bytes)
    if image_type is None:
        # Default to jpeg if type detection fails
        image_type = 'jpeg'

    # Convert to base64
    b64_string = base64.b64encode(image_bytes).decode('utf-8')

    # Format as Data URI
    data_uri = f"data:image/{image_type};base64,{b64_string}"

    return data_uri


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
    image: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1
) -> AsyncIterator[str]:
    """
    Send a message to LM Studio and stream the response.

    Args:
        text: User message text
        image: Optional image in base64 string or bytes
        chat_history: Previous chat messages for context
        context: F1 session context (year, GP, session, drivers, etc.)
        model: Model name to use
        temperature: Temperature parameter for generation

    Yields:
        Chunks of the assistant's response as they arrive
    """
    try:
        # Format image for vision model (Data URI format)
        image_data_uri = None
        if image:
            if isinstance(image, bytes):
                image_data_uri = format_image_for_vision_model(image)
            elif isinstance(image, str):
                # If already a string, check if it has the data URI prefix
                if not image.startswith('data:image'):
                    # Add prefix if missing
                    image_data_uri = f"data:image/jpeg;base64,{image}"
                else:
                    image_data_uri = image

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{CHAT_API_BASE}/stream",
                json={
                    "text": text,
                    "image": image_data_uri,
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
    image: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1
) -> str:
    """
    Send a message to LM Studio and get the complete response (non-streaming).

    Args:
        text: User message text
        image: Optional image in base64 string or bytes
        chat_history: Previous chat messages for context
        context: F1 session context
        model: Model name to use
        temperature: Temperature parameter for generation

    Returns:
        Complete assistant response
    """
    try:
        # Format image for vision model (Data URI format)
        image_data_uri = None
        if image:
            if isinstance(image, bytes):
                image_data_uri = format_image_for_vision_model(image)
            elif isinstance(image, str):
                # If already a string, check if it has the data URI prefix
                if not image.startswith('data:image'):
                    # Add prefix if missing
                    image_data_uri = f"data:image/jpeg;base64,{image}"
                else:
                    image_data_uri = image

        response = httpx.post(
            f"{CHAT_API_BASE}/message",
            json={
                "text": text,
                "image": image_data_uri,
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


def generate_report(
    chat_history: List[Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
) -> Optional[str]:
    """
    Generate a report from chat history using the Query Router.

    Args:
        chat_history: Chat messages to summarize
        context: F1 session context
        model: Model name to use

    Returns:
        Report content in Markdown format, or None if error
    """
    if not chat_history or len(chat_history) == 0:
        st.warning("No chat history to generate report from.")
        return None

    try:
        response = httpx.post(
            f"{CHAT_API_BASE}/query",  # Using the query router endpoint
            json={
                "text": "Generate a comprehensive summary report of our conversation",
                "chat_history": chat_history,
                "context": context or {},
                "model": model,
                "temperature": 0.5,  # Lower temperature for consistent reports
                "max_tokens": 4000  # Balanced for speed and completeness
            },
            timeout=None
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("response", "")
        else:
            error_msg = f"Backend returned status {response.status_code}"
            st.error(error_msg)
            return None

    except Exception as e:
        st.error(f"Error generating report: {e}")
        return None
