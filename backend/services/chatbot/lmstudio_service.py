"""
LM Studio Service

Handles communication with LM Studio API for chat completions.
Provides functions for sending messages, streaming responses, and health checks.
"""

import requests
from typing import Dict, List, Any, Optional, Generator
import logging

logger = logging.getLogger(__name__)

# LM Studio configuration
LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
LM_STUDIO_MODELS_URL = "http://localhost:1234/v1/models"
DEFAULT_TIMEOUT = 60


class LMStudioError(Exception):
    """Custom exception for LM Studio related errors."""
    pass


def check_health() -> Dict[str, Any]:
    """
    Check if LM Studio is accessible and healthy.

    Returns:
        Dict with status information

    Raises:
        LMStudioError: If LM Studio is not accessible
    """
    try:
        response = requests.get(
            LM_STUDIO_MODELS_URL,
            timeout=5
        )

        if response.status_code == 200:
            models = response.json()
            return {
                "status": "healthy",
                "lm_studio_reachable": True,
                "models_available": len(models.get("data", [])),
                "message": "LM Studio is running"
            }
        else:
            return {
                "status": "unhealthy",
                "lm_studio_reachable": False,
                "message": f"LM Studio returned status {response.status_code}"
            }

    except requests.exceptions.ConnectionError:
        logger.error("Cannot connect to LM Studio")
        return {
            "status": "unhealthy",
            "lm_studio_reachable": False,
            "message": "Cannot connect to LM Studio. Ensure it's running on localhost:1234"
        }
    except Exception as e:
        logger.error(f"Error checking LM Studio health: {e}")
        return {
            "status": "unhealthy",
            "lm_studio_reachable": False,
            "message": str(e)
        }


def get_available_models() -> List[str]:
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names

    Raises:
        LMStudioError: If unable to fetch models
    """
    try:
        response = requests.get(
            LM_STUDIO_MODELS_URL,
            timeout=5
        )

        if response.status_code == 200:
            models_data = response.json()
            models = [model.get("id", "") for model in models_data.get("data", [])]
            return models
        else:
            raise LMStudioError(f"Failed to fetch models: HTTP {response.status_code}")

    except requests.exceptions.ConnectionError:
        raise LMStudioError("Cannot connect to LM Studio")
    except Exception as e:
        raise LMStudioError(f"Error fetching models: {str(e)}")


def send_message(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    stream: bool = False
) -> Dict[str, Any]:
    """
    Send a message to LM Studio and get the complete response.

    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model name (optional, LM Studio will use loaded model)
        temperature: Temperature parameter for generation
        max_tokens: Maximum tokens to generate
        stream: Whether to stream the response

    Returns:
        Response dict from LM Studio

    Raises:
        LMStudioError: If the request fails
    """
    try:
        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream
        }

        # Only include model if specified
        if model:
            payload["model"] = model

        response = requests.post(
            LM_STUDIO_URL,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=DEFAULT_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            raise LMStudioError(
                "LM Studio endpoint not found. "
                "Ensure the server is started in LM Studio (Developer → Start Server)"
            )
        else:
            raise LMStudioError(
                f"LM Studio returned HTTP {response.status_code}: {response.text}"
            )

    except requests.exceptions.ConnectionError:
        raise LMStudioError(
            "Cannot connect to LM Studio. "
            "Ensure LM Studio is running and the server is started on port 1234"
        )
    except requests.exceptions.Timeout:
        raise LMStudioError("Request to LM Studio timed out")
    except Exception as e:
        raise LMStudioError(f"Error sending message to LM Studio: {str(e)}")


def stream_message(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000
) -> Generator[str, None, None]:
    """
    Send a message to LM Studio and stream the response.

    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model name (optional)
        temperature: Temperature parameter for generation
        max_tokens: Maximum tokens to generate

    Yields:
        Chunks of the response text

    Raises:
        LMStudioError: If the request fails
    """
    try:
        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        if model:
            payload["model"] = model

        response = requests.post(
            LM_STUDIO_URL,
            headers={"Content-Type": "application/json"},
            json=payload,
            stream=True,
            timeout=DEFAULT_TIMEOUT
        )

        if response.status_code == 200:
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    # SSE format: "data: {...}"
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]  # Remove "data: " prefix

                        # Check for stream end
                        if data_str.strip() == "[DONE]":
                            break

                        try:
                            import json
                            data = json.loads(data_str)

                            # Extract content from delta
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue
        else:
            raise LMStudioError(
                f"LM Studio returned HTTP {response.status_code}: {response.text}"
            )

    except requests.exceptions.ConnectionError:
        raise LMStudioError("Cannot connect to LM Studio")
    except requests.exceptions.Timeout:
        raise LMStudioError("Request to LM Studio timed out")
    except Exception as e:
        raise LMStudioError(f"Error streaming from LM Studio: {str(e)}")


def build_messages(
    user_message: str,
    system_prompt: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, str]]:
    """
    Build the messages array for LM Studio API.

    Args:
        user_message: The user's message
        system_prompt: System prompt (optional)
        chat_history: Previous messages (optional)
        context: F1 session context to include (optional)

    Returns:
        List of message dicts ready for LM Studio
    """
    messages = []

    # Add system prompt
    if not system_prompt:
        system_prompt = "You are a helpful F1 Strategy Assistant with deep knowledge of Formula 1 racing, telemetry analysis, and race strategy."

    # Add context to system prompt if provided
    if context:
        context_str = "\n\nCurrent F1 Session Context:\n"
        if "year" in context:
            context_str += f"Year: {context['year']}\n"
        if "grand_prix" in context:
            context_str += f"Grand Prix: {context['grand_prix']}\n"
        if "session" in context:
            context_str += f"Session: {context['session']}\n"
        if "drivers" in context:
            context_str += f"Drivers: {', '.join(context['drivers'])}\n"

        system_prompt += context_str

    messages.append({
        "role": "system",
        "content": system_prompt
    })

    # Add chat history
    if chat_history:
        for msg in chat_history:
            role = msg.get("role", "")
            content = msg.get("content", "")

            # Only add text messages (skip images for now)
            if role in ["user", "assistant"] and content:
                messages.append({
                    "role": role,
                    "content": content
                })

    # Add current user message
    messages.append({
        "role": "user",
        "content": user_message
    })

    return messages
