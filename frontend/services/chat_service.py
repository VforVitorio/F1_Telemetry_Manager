"""
Chat Service

Handles communication with the backend chat API and LM Studio.
Provides functions for streaming messages, checking health, and managing models.
"""

import json as _json
from typing import Optional, Dict, List, Any, AsyncIterator, Iterator, Tuple

import httpx
import streamlit as st
import base64
import imghdr


# Backend API configuration — reads BACKEND_URL from env (set by docker-compose)
import os
BACKEND_BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
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


def send_tool_message(
    text: str,
    image: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1,
) -> Dict[str, Any]:
    """Send a message to the tool-aware chat endpoint.

    Calls POST /api/v1/chat/tool-message which automatically detects
    strategy queries, extracts parameters, and invokes the appropriate
    ML agent.  Returns both a text response and an optional structured
    tool_result for rich rendering in the chat.

    Returns:
        dict with keys: response (str), tool_result (dict | None),
        llm_model (str | None), tokens_used (int | None).
    """
    try:
        image_data_uri = None
        if image:
            if isinstance(image, bytes):
                image_data_uri = format_image_for_vision_model(image)
            elif isinstance(image, str) and not image.startswith("data:image"):
                image_data_uri = f"data:image/jpeg;base64,{image}"
            else:
                image_data_uri = image

        response = httpx.post(
            f"{CHAT_API_BASE}/tool-message",
            json={
                "text": text,
                "image": image_data_uri,
                "chat_history": chat_history or [],
                "context": context or {},
                "model": model,
                "temperature": temperature,
                "max_tokens": 1000,
            },
            timeout=300,
        )

        if response.status_code == 200:
            return response.json()
        return {"response": f"Backend error: {response.status_code}", "tool_result": None}
    except Exception as e:
        return {"response": f"Error: {e}", "tool_result": None}


def get_chat_status(request_id: str) -> str:
    """Poll the backend for the current backend stage of a streaming request.

    Used by the chat-page spinner thread so the loader label can mirror
    real backend progress (extracting → calling tool → summarising) instead
    of rotating through fake placeholders.  Returns an empty string when
    the backend has no record of the id (no update yet, request finished).
    """
    try:
        response = httpx.get(
            f"{CHAT_API_BASE}/status",
            params={"request_id": request_id},
            timeout=2.0,
        )
        if response.status_code == 200:
            return response.json().get("stage", "") or ""
    except Exception:
        return ""
    return ""


def _build_tool_payload(
    text: str,
    image: Optional[Any],
    chat_history: Optional[List[Dict[str, Any]]],
    context: Optional[Dict[str, Any]],
    model: str,
    temperature: float,
) -> Dict[str, Any]:
    """Shared body builder for the tool-message endpoints (sync + streaming).

    Encapsulates the image-normalisation branching so callers don't repeat
    the data-uri logic, and so we can keep send_tool_message and the new
    streaming variant in lock-step on the request shape.
    """
    image_data_uri = None
    if image:
        if isinstance(image, bytes):
            image_data_uri = format_image_for_vision_model(image)
        elif isinstance(image, str) and not image.startswith("data:image"):
            image_data_uri = f"data:image/jpeg;base64,{image}"
        else:
            image_data_uri = image
    return {
        "text": text,
        "image": image_data_uri,
        "chat_history": chat_history or [],
        "context": context or {},
        "model": model,
        "temperature": temperature,
        "max_tokens": 1000,
    }


def stream_tool_message(
    text: str,
    request_id: str,
    image: Optional[Any] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    model: str = "llama3.2-vision",
    temperature: float = 0.1,
) -> Iterator[Tuple[str, Dict[str, Any]]]:
    """Stream the tool-aware chat response as (event_type, payload) tuples.

    Yields events in this order: ``stage`` (one or more), optionally
    ``tool_result`` (when a tool ran), ``token`` (one chunk per slice of
    the LLM summary so the bubble fills in live), and finally ``done``
    with any post-summary metadata.  The frontend appends ``token``
    payloads into the assistant bubble for a Claude/ChatGPT typing feel
    while ``stage`` events let the spinner narrate the slower phases.
    """
    payload = _build_tool_payload(text, image, chat_history, context, model, temperature)
    headers = {"X-Request-Id": request_id, "Accept": "text/event-stream"}
    try:
        with httpx.stream(
            "POST",
            f"{CHAT_API_BASE}/tool-message-stream",
            json=payload,
            headers=headers,
            timeout=300,
        ) as response:
            if response.status_code != 200:
                yield ("token", {"token": f"Backend error: {response.status_code}"})
                yield ("done", {})
                return
            yield from _iter_sse_events(response)
    except Exception as exc:  # pragma: no cover — surface network errors to chat
        yield ("token", {"token": f"Error: {exc}"})
        yield ("done", {})


def _iter_sse_events(response: httpx.Response) -> Iterator[Tuple[str, Dict[str, Any]]]:
    """Parse a Server-Sent Events response into (event, payload) tuples.

    SSE frames are separated by blank lines and use ``event: <name>`` plus
    ``data: <json>`` lines.  We only need event + json data here so we
    keep the parser intentionally small instead of pulling in an SSE lib.
    """
    event_name = "message"
    data_lines: List[str] = []
    for raw_line in response.iter_lines():
        line = raw_line.rstrip("\r")
        if not line:
            if data_lines:
                payload = _safe_json("\n".join(data_lines))
                yield (event_name, payload)
            event_name = "message"
            data_lines = []
            continue
        if line.startswith("event:"):
            event_name = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())


def _safe_json(text: str) -> Dict[str, Any]:
    """Parse JSON without raising — empty dict on failure keeps the loop alive."""
    try:
        return _json.loads(text) if text else {}
    except _json.JSONDecodeError:
        return {}


def generate_report(
    chat_history: List[Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Optional[str]:
    """
    Generate a Markdown report summarising the chat history.

    Hits the same MCP-driven ``/chat/tool-message`` endpoint the rest of
    the chat uses.  The LLM sees the conversation as ``chat_history`` and
    the explicit "summary report" instruction in ``text``; it will
    typically respond in plain text without dispatching a tool.

    Args:
        chat_history: Chat messages to summarize.
        context: Optional F1 session context (year / GP / driver).
        model: Optional model override; ``None`` uses the configured default.

    Returns:
        Report content in Markdown format, or ``None`` if the request fails.
    """
    if not chat_history:
        st.warning("No chat history to generate report from.")
        return None

    try:
        response = httpx.post(
            f"{CHAT_API_BASE}/tool-message",
            json={
                "text": "Generate a comprehensive Markdown summary report of our conversation, with sections for the questions asked, the data analysed, and the strategic conclusions reached.",
                "chat_history": chat_history,
                "context": context or {},
                "model": model,
                "temperature": 0.4,
                "max_tokens": 4000,
            },
            timeout=300,
        )

        if response.status_code == 200:
            return response.json().get("response", "")
        st.error(f"Backend returned status {response.status_code}")
        return None
    except Exception as e:
        st.error(f"Error generating report: {e}")
        return None
