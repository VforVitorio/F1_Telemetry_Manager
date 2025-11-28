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
        response = httpx.get(f"{CHAT_API_BASE}/health", timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            return data.get("lm_studio_reachable", False)
        return False
    except Exception as e:
        st.error(f"Error checking LM Studio health: {e}")
        return False


def get_available_models() -> List[str]:
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names available in LM Studio
    """
    try:
        response = httpx.get(f"{CHAT_API_BASE}/models", timeout=5.0)
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
        image: Optional image in base64 data URI format (e.g., data:image/png;base64,...)
        chat_history: Previous chat messages for context
        context: F1 session context (year, GP, session, drivers, etc.)
        model: Model name to use
        temperature: Temperature parameter for generation

    Yields:
        Chunks of the assistant's response as they arrive
    """
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{CHAT_API_BASE}/stream",
                json={
                    "text": text,
                    "image": image,
                    "chat_history": chat_history or [],
                    "context": context or {},
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 1000
                },
                timeout=300.0  # Increased for vision models (matches backend timeout)
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
        image: Optional image in base64 data URI format (e.g., data:image/png;base64,...)
        chat_history: Previous chat messages for context
        context: F1 session context
        model: Model name to use
        temperature: Temperature parameter for generation

    Returns:
        Complete assistant response
    """
    try:
        response = httpx.post(
            f"{CHAT_API_BASE}/message",
            json={
                "text": text,
                "image": image,
                "chat_history": chat_history or [],
                "context": context or {},
                "model": model,
                "temperature": temperature,
                "max_tokens": 1000
            },
            timeout=300.0  # Increased for vision models (matches backend timeout)
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
                "max_tokens": 2000  # Higher for complete reports
            },
            timeout=60.0
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
