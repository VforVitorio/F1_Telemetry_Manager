"""
LLM Service — Unified interface for LM Studio (local) and OpenAI (cloud).

Switch between providers via the LLM_PROVIDER env var:
  - LLM_PROVIDER=lmstudio  (default) → local LM Studio at localhost:1234
  - LLM_PROVIDER=openai               → OpenAI API with OPENAI_API_KEY

When using OpenAI, the model defaults to gpt-4.1-mini for general chat
and can be overridden per-call via the model parameter.
"""

import os
import requests
from typing import Dict, List, Any, Optional, Generator
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------
LLM_PROVIDER = os.getenv("F1_LLM_PROVIDER", os.getenv("LLM_PROVIDER", "lmstudio"))  # "lmstudio" | "openai"

# LM Studio (local)
_LM_HOST = os.getenv("LM_STUDIO_HOST", "localhost")
LM_STUDIO_URL = f"http://{_LM_HOST}:1234/v1/chat/completions"
LM_STUDIO_MODELS_URL = f"http://{_LM_HOST}:1234/v1/models"

# OpenAI (cloud)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
OPENAI_DEFAULT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-5.4-mini")

# Derived — which URLs to actually use
_is_openai = LLM_PROVIDER.lower() == "openai"
COMPLETIONS_URL = OPENAI_URL if _is_openai else LM_STUDIO_URL
MODELS_URL = OPENAI_MODELS_URL if _is_openai else LM_STUDIO_MODELS_URL
DEFAULT_TIMEOUT = 60 if _is_openai else None  # OpenAI has reasonable latency; LM Studio can be slow


def _headers() -> dict:
    """Build request headers — adds Authorization for OpenAI, plain for LM Studio."""
    h = {"Content-Type": "application/json"}
    if _is_openai and OPENAI_API_KEY:
        h["Authorization"] = f"Bearer {OPENAI_API_KEY}"
    return h


def _default_model(override: Optional[str] = None) -> Optional[str]:
    """Return the model to use.

    When using OpenAI, ignore local model names (llama, mistral, etc.)
    that the frontend might send — they don't exist on OpenAI and cause 404s.
    """
    if _is_openai:
        if override and (override.startswith("gpt") or override.startswith("o")):
            return override
        return OPENAI_DEFAULT_MODEL
    return override or None


class LMStudioError(Exception):
    """Custom exception for LLM service errors (LM Studio or OpenAI)."""
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
        provider = "OpenAI" if _is_openai else "LM Studio"
        response = requests.get(MODELS_URL, headers=_headers(), timeout=5)

        if response.status_code == 200:
            models = response.json()
            return {
                "status": "healthy",
                "lm_studio_reachable": True,
                "models_available": len(models.get("data", [])),
                "message": f"{provider} is running (provider={LLM_PROVIDER})"
            }
        else:
            return {
                "status": "unhealthy",
                "lm_studio_reachable": False,
                "message": f"{provider} returned status {response.status_code}"
            }

    except requests.exceptions.ConnectionError:
        provider = "OpenAI" if _is_openai else "LM Studio"
        logger.error("Cannot connect to %s", provider)
        return {
            "status": "unhealthy",
            "lm_studio_reachable": False,
            "message": f"Cannot connect to {provider}. "
                       f"{'Check OPENAI_API_KEY' if _is_openai else 'Ensure LM Studio is running on port 1234'}"
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
        response = requests.get(MODELS_URL, headers=_headers(), timeout=5)

        if response.status_code == 200:
            models_data = response.json()
            models = [model.get("id", "")
                      for model in models_data.get("data", [])]
            return models
        else:
            raise LMStudioError(
                f"Failed to fetch models: HTTP {response.status_code}")

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
        resolved_model = _default_model(model)

        # OpenAI gpt-4.1+ / gpt-5+ use max_completion_tokens instead of max_tokens
        token_key = "max_completion_tokens" if _is_openai else "max_tokens"

        payload = {
            "messages": messages,
            "temperature": temperature,
            token_key: max_tokens,
            "stream": stream
        }

        if resolved_model:
            payload["model"] = resolved_model

        # Log payload structure (without full base64 to avoid log spam)
        logger.debug(
            f"Sending request to LM Studio with {len(messages)} messages")
        for i, msg in enumerate(messages):
            role = msg.get("role", "unknown")
            content = msg.get("content")
            if isinstance(content, list):
                logger.debug(
                    f"  Message {i}: role={role}, multimodal with {len(content)} parts")
                for j, part in enumerate(content):
                    part_type = part.get("type", "unknown")
                    if part_type == "image_url":
                        url = part.get("image_url", {}).get("url", "")
                        logger.debug(
                            f"    Part {j}: type={part_type}, url_prefix={url[:50]}...")
                    else:
                        logger.debug(f"    Part {j}: type={part_type}")
            else:
                logger.debug(
                    f"  Message {i}: role={role}, text={str(content)[:100]}...")

        response = requests.post(
            COMPLETIONS_URL,
            headers=_headers(),
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
        resolved_model = _default_model(model)

        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens" if _is_openai else "max_tokens": max_tokens,
            "stream": True
        }

        if resolved_model:
            payload["model"] = resolved_model

        response = requests.post(
            COMPLETIONS_URL,
            headers=_headers(),
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


def _compress_chat_history(chat_history: List[Dict[str, Any]]) -> str:
    """
    Compress chat history by summarizing older messages.
    Emulates Claude Code's memory compression strategy.

    Args:
        chat_history: List of message dicts to compress

    Returns:
        Compressed summary string
    """
    # Build conversation text
    conversation = []
    for msg in chat_history:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            conversation.append(f"User: {content}")
        elif role == "assistant":
            conversation.append(f"Assistant: {content}")

    conversation_text = "\n\n".join(conversation)

    # Create compression prompt
    summary_prompt = f"""Please provide a concise summary of the following conversation history.
Focus on key facts, decisions, and context that would be relevant for continuing this F1 telemetry analysis discussion.
Be brief but preserve important technical details.

Conversation:
{conversation_text}

Summary:"""

    # Send compression request to LM Studio
    try:
        compression_messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes conversations concisely."},
            {"role": "user", "content": summary_prompt}
        ]

        response = send_message(
            messages=compression_messages,
            temperature=0.3,  # Lower temperature for factual summary
            max_tokens=300,   # Keep summary short
            stream=False
        )

        if "choices" in response and len(response["choices"]) > 0:
            summary = response["choices"][0]["message"]["content"]
            logger.info(
                f"Compressed {len(chat_history)} messages into summary")
            return summary
        else:
            # Fallback: simple truncation
            return "Previous conversation context compressed."

    except Exception as e:
        logger.error(f"Failed to compress history: {e}")
        return "Previous conversation context compressed."


def build_messages(
    user_message: str,
    image_base64: Optional[str] = None,
    system_prompt: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Build the messages array for LM Studio API with smart history compression.

    Limits chat history to last 5 interactions (10 messages).
    When exceeding 5 interactions, compresses the first 4 into a summary.

    Supports multimodal messages for vision models using OpenAI-compatible format.

    Args:
        user_message: The user's message
        image_base64: Optional base64 encoded image (data URI format)
        system_prompt: System prompt (optional)
        chat_history: Previous messages (optional)
        context: F1 session context to include (optional)

    Returns:
        List of message dicts ready for LM Studio (with multimodal support)
    """
    messages = []

    # Add system prompt
    if not system_prompt:
        system_prompt = (
            "You are the F1 Strategy Assistant. You do NOT call tools yourself. "
            "The backend detects keywords in the user's message and runs the matching tool automatically. "
            "Each message triggers AT MOST ONE tool.\n\n"
            "KEYWORD → TOOL mapping (user must include driver code + GP + lap number):\n"
            "- 'tyre' / 'tire' / 'degradation' / 'compound' → predict_tire\n"
            "- 'pit' / 'stop' / 'undercut' / 'overcut' → predict_pit\n"
            "- 'pace' / 'lap time' / 'fast' / 'slow' → predict_pace\n"
            "- 'overtake' / 'pass' / 'drs' / 'safety car' → predict_situation\n"
            "- 'radio' / 'team radio' / 'message' → analyze_radio\n"
            "- 'regulation' / 'rule' / 'article' / 'fia' → query_regulations (no driver/GP/lap needed)\n"
            "- 'strategy' / 'recommend' / 'full analysis' → recommend_strategy\n\n"
            "CRITICAL RULES:\n"
            "1. NEVER fabricate or simulate tool results. If no tool was triggered, say so.\n"
            "2. If the user asks to 'run all tools', tell them to send SEPARATE messages, one per tool. "
            "Suggest the exact prompts, e.g.:\n"
            "   - 'ALO Melbourne lap 13 tyre status'\n"
            "   - 'ALO Melbourne lap 13 pace'\n"
            "   - 'ALO Melbourne lap 13 pit strategy'\n"
            "   - 'ALO Melbourne lap 13 overtake probability'\n"
            "   - 'ALO Melbourne lap 13 radio'\n"
            "   - 'ALO Melbourne lap 13 recommend strategy'\n"
            "3. If a tool result appears in the conversation, summarize it. "
            "If NOT, respond: 'That tool was not triggered. Try: <driver> <GP> lap <N> <keyword>'\n\n"
            "For general F1 questions (no driver/GP/lap), answer from your knowledge. "
            "Keep responses under 200 words unless asked for detail."
        )

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

    # Process chat history with compression
    if chat_history:
        # Filter to only text messages (skip images and tool_result objects)
        text_history = [
            msg for msg in chat_history
            if msg.get("role") in ["user", "assistant"]
            and msg.get("content")
            and msg.get("type") != "tool_result"
            and isinstance(msg.get("content"), str)
        ]

        # Limit to last 5 interactions (10 messages: 5 user + 5 assistant)
        MAX_INTERACTIONS = 5
        MAX_MESSAGES = MAX_INTERACTIONS * 2  # user + assistant pairs

        if len(text_history) > MAX_MESSAGES:
            # Compress first 4 interactions (8 messages)
            messages_to_compress = text_history[:8]
            recent_messages = text_history[8:]  # Keep last interaction

            # Generate summary
            summary = _compress_chat_history(messages_to_compress)

            # Add summary as system message
            messages.append({
                "role": "system",
                "content": f"[Previous conversation summary]: {summary}"
            })

            # Add recent messages
            for msg in recent_messages:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })

            logger.info(
                f"Compressed chat history: {len(messages_to_compress)} messages → summary + {len(recent_messages)} recent")
        else:
            # No compression needed, add all history
            for msg in text_history:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })

    # Add current user message (with multimodal support for vision models)
    if image_base64:
        # Use OpenAI-compatible multimodal format for vision models
        # Format: https://platform.openai.com/docs/guides/vision
        # Compatible with Qwen2-VL and other vision models
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": user_message
                },
                {
                    "type": "image_url",
                    "image_url": {
                        # Should be in format: data:image/jpeg;base64,...
                        "url": image_base64
                    }
                }
            ]
        })
        logger.info(
            f"Built multimodal message with image (size: {len(image_base64)} chars)")
    else:
        # Text-only message
        messages.append({
            "role": "user",
            "content": user_message
        })

    return messages
