"""
LLM Service — Unified interface for LM Studio (local) and OpenAI (cloud).

Switch between providers via the LLM_PROVIDER env var:
  - LLM_PROVIDER=lmstudio  (default) → local LM Studio at localhost:1234
  - LLM_PROVIDER=openai               → OpenAI API with OPENAI_API_KEY

When using OpenAI, the model defaults to gpt-5.4-mini for general chat
and can be overridden per-call via the model parameter or the
OPENAI_CHAT_MODEL env var.
"""

import os
import time
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
# Every provider call gets a FINITE timeout so a hung backend (a stuck local
# model, a dead socket) errors instead of freezing the server forever
# (Security S-5 / LLM-cost L-1). LM Studio gets a more generous default because
# a large local model on modest hardware is legitimately slow; both are
# overridable via F1_LLM_TIMEOUT (seconds).
DEFAULT_TIMEOUT = float(os.getenv("F1_LLM_TIMEOUT", "60" if _is_openai else "120"))


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


class LLMServiceError(Exception):
    """Custom exception for LLM service errors (LM Studio or OpenAI)."""
    pass


def check_health() -> Dict[str, Any]:
    """
    Check if LM Studio is accessible and healthy.

    Returns:
        Dict with status information

    Raises:
        LLMServiceError: If LM Studio is not accessible
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


class ProviderPreflight:
    """TTL-cached provider availability so an expensive turn can fail fast (LLM-cost L-3).

    Reuses ``check_health`` (a cheap /models GET with a 5s timeout). The result is
    cached for ``ttl_s`` so we do not ping the provider on every turn; a failed
    provider call can invalidate the cache via ``mark_failed`` so the next turn
    re-checks. This is a fail-fast accelerator, not a hard gate - when in doubt it
    reports available and lets the finite provider timeout bound the damage.
    """

    def __init__(self, ttl_s: float = 30.0) -> None:
        self._ttl_s = ttl_s
        self._ok = True
        self._checked_at = -1e9

    def is_available(self) -> bool:
        """Return cached availability, refreshing via check_health when the TTL lapses."""
        now = time.monotonic()
        if now - self._checked_at < self._ttl_s:
            return self._ok
        try:
            self._ok = check_health().get("status") == "healthy"
        except Exception:
            self._ok = False
        self._checked_at = now
        return self._ok

    def mark_failed(self) -> None:
        """Invalidate the cache after a provider call fails, so the next turn re-checks."""
        self._ok = False
        self._checked_at = time.monotonic()


# Process-level singleton reused across chat/voice turns.
PREFLIGHT = ProviderPreflight()


def get_available_models() -> List[str]:
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names

    Raises:
        LLMServiceError: If unable to fetch models
    """
    try:
        response = requests.get(MODELS_URL, headers=_headers(), timeout=5)

        if response.status_code == 200:
            models_data = response.json()
            models = [model.get("id", "")
                      for model in models_data.get("data", [])]
            return models
        else:
            raise LLMServiceError(
                f"Failed to fetch models: HTTP {response.status_code}")

    except requests.exceptions.ConnectionError:
        raise LLMServiceError("Cannot connect to LM Studio")
    except Exception as e:
        raise LLMServiceError(f"Error fetching models: {str(e)}")


def send_message(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    stream: bool = False,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Send a message to the configured LLM provider and return the response.

    The ``tools`` parameter mirrors OpenAI's function-calling protocol — a
    list of tool schemas (``{"type": "function", "function": {...}}``) the
    model can choose to call.  When provided, the response may include
    ``choices[0].message.tool_calls`` instead of (or alongside) text.
    LM Studio's OpenAI-compatible v1 API forwards the field unchanged,
    so the same code path works for cloud and local providers — modern
    instruct-tuned local models will honour it, older or non-instruct
    ones will simply ignore it and return text.

    Args:
        messages: List of message dicts with 'role' and 'content'.
        model: Model name (optional, LM Studio uses the loaded model).
        temperature: Sampling temperature.
        max_tokens: Token cap for the response.
        stream: Whether to stream the response (chunked).
        tools: Optional OpenAI-formatted tool schemas the model can call.
        tool_choice: Optional ``"auto" | "none" | {"type": "function", ...}``
            override; defaults to ``"auto"`` whenever ``tools`` is set.

    Returns:
        Response dict from the provider.

    Raises:
        LLMServiceError: If the request fails.
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

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice or "auto"

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
            raise LLMServiceError(
                "LM Studio endpoint not found. "
                "Ensure the server is started in LM Studio (Developer → Start Server)"
            )
        else:
            raise LLMServiceError(
                f"LM Studio returned HTTP {response.status_code}: {response.text}"
            )

    except requests.exceptions.ConnectionError:
        raise LLMServiceError(
            "Cannot connect to LM Studio. "
            "Ensure LM Studio is running and the server is started on port 1234"
        )
    except requests.exceptions.Timeout:
        raise LLMServiceError("Request to LM Studio timed out")
    except Exception as e:
        raise LLMServiceError(f"Error sending message to LM Studio: {str(e)}")


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
        LLMServiceError: If the request fails
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
            raise LLMServiceError(
                f"LM Studio returned HTTP {response.status_code}: {response.text}"
            )

    except requests.exceptions.ConnectionError:
        raise LLMServiceError("Cannot connect to LM Studio")
    except requests.exceptions.Timeout:
        raise LLMServiceError("Request to LM Studio timed out")
    except Exception as e:
        raise LLMServiceError(f"Error streaming from LM Studio: {str(e)}")


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
            "You are the F1 Strategy Assistant — a bilingual (English / Spanish) "
            "expert embedded in a real-time race telemetry and simulation system.\n\n"
            "HOW THIS SYSTEM WORKS\n"
            "- You do NOT call tools yourself. The backend extracts intent from the "
            "user's message and runs the right tool BEFORE the message reaches you.\n"
            "- If a tool ran, its result is attached to the conversation. Summarise it "
            "in 2-4 sentences with the key strategic insight.\n"
            "- If no tool ran, the message is one of: casual chat, a general F1 "
            "question, or an analysis request that is missing required parameters.\n\n"
            "HOW TO RESPOND WHEN NO TOOL RAN\n"
            "1. Casual greetings, smalltalk, thanks → respond naturally and briefly. "
            "Mirror the user's language (Spanish if they wrote in Spanish).\n"
            "2. General F1 questions (rules, history, concepts, terminology, no "
            "driver/GP/lap needed) → answer from your knowledge in 2-4 sentences.\n"
            "3. The user clearly wants a per-driver analysis (mentions tyre, pit, pace, "
            "undercut, telemetry, lap times, etc.) but did NOT provide enough info → "
            "politely list what is missing and ask for it. Required pieces are:\n"
            "   - Driver: a 3-letter code (VER, HAM, NOR, LEC...) or full surname.\n"
            "   - Grand Prix: e.g. Monaco, Silverstone, Bahrain, Monza, Spa.\n"
            "   - Lap number: an integer between 1 and the race length.\n"
            "   Year is optional (defaults to 2025; valid range 2023-2025).\n"
            "   Example: \"To analyse tyre degradation I need a driver, a Grand Prix "
            "and a lap number — for example: 'tyre degradation for VER at Monza lap 30'.\"\n\n"
            "HARD RULES\n"
            "- ALWAYS respond in the same language the user wrote in. If the "
            "user wrote in Spanish, respond in Spanish. If in English, respond "
            "in English. This applies to every response, including when asking "
            "for missing parameters or refusing to answer.\n"
            "- Never fabricate tool results, telemetry numbers, lap times or "
            "predictions. If you do not know, say so.\n"
            "- Do not invent driver codes, Grand Prix names, or seasons.\n"
            "- Keep responses under 200 words unless the user asks for detail.\n\n"
            "MULTI-DRIVER REQUESTS\n"
            "When the user asks to compare two drivers:\n"
            "- Telemetry overlay (speed / throttle / brake / lap times) → say it works "
            "natively: ask phrases like 'compare VER vs LEC at Monza' and it routes "
            "to the compare_drivers tool. The Streamlit Comparison page is the "
            "dedicated UI for this.\n"
            "- Strategy decisions for two drivers in one call → not supported. The "
            "strategy agents are designed first-person (one driver per analysis). "
            "If the user wants the rival as context (gap, compound, tyre age) "
            "around a single-driver decision, that mode exists in the CLI "
            "(--rival CODE) and in the Arcade (--driver2 CODE); the Streamlit "
            "Strategy page does not expose it yet."
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
