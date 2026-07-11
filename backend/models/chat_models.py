"""
Chat Models

Pydantic models for chat API request/response validation.

Security C3 / S-8: the client-supplied ``chat_history`` and ``context`` reach the
LLM prompt (``llm_service.build_messages``), so they are bounded and pruned here
at the request boundary - before any LLM cost is paid - instead of trusting the
raw payload. ``context`` is pruned to the four keys ``build_messages`` actually
reads, dropping any injected keys; ``chat_history`` is capped in count and size.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

# Bounds (kept as module constants so the validators and any tests share them).
MAX_TEXT_CHARS = 8_000
MAX_IMAGE_CHARS = 12_000_000  # ~9 MB of binary once base64-decoded
MAX_HISTORY_MESSAGES = 40
MAX_MESSAGE_CHARS = 12_000
_ALLOWED_ROLES = {"user", "assistant", "system", "tool"}
# The only context keys build_messages consumes; everything else is dropped.
_ALLOWED_CONTEXT_KEYS = {"year", "grand_prix", "session", "drivers"}


class ChatMessage(BaseModel):
    """Single chat message."""
    role: str
    content: str


class ChatRequest(BaseModel):
    """Request model for chat messages."""
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    image: Optional[str] = Field(default=None, max_length=MAX_IMAGE_CHARS)
    chat_history: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None
    model: Optional[str] = Field(default=None, max_length=128)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1000, ge=1, le=8192)

    @field_validator("chat_history")
    @classmethod
    def _bound_history(cls, history: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
        """Cap the history length and each text message's size; reject unknown roles.

        Non-string ``content`` is tolerated (the frontend history carries
        ``tool_result`` entries that build_messages already filters out); only
        string content is length-checked.
        """
        if history is None:
            return None
        if len(history) > MAX_HISTORY_MESSAGES:
            raise ValueError(f"chat_history exceeds {MAX_HISTORY_MESSAGES} messages")
        for msg in history:
            role = msg.get("role")
            if role is not None and role not in _ALLOWED_ROLES:
                raise ValueError(f"invalid chat_history role: {role!r}")
            content = msg.get("content")
            if isinstance(content, str) and len(content) > MAX_MESSAGE_CHARS:
                raise ValueError(f"a chat_history message exceeds {MAX_MESSAGE_CHARS} chars")
        return history

    @field_validator("context")
    @classmethod
    def _prune_context(cls, context: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Keep only the four keys build_messages reads, with light bounds.

        Dropping unknown keys stops arbitrary client-supplied fields from riding
        into the prompt; the kept values are size-bounded so a huge GP name or
        driver list cannot bloat the system prompt.
        """
        if context is None:
            return None
        pruned: Dict[str, Any] = {}
        if isinstance(context.get("year"), int) and 2018 <= context["year"] <= 2030:
            pruned["year"] = context["year"]
        for key in ("grand_prix", "session"):
            value = context.get(key)
            if isinstance(value, str) and value:
                pruned[key] = value[:64]
        drivers = context.get("drivers")
        if isinstance(drivers, list):
            pruned["drivers"] = [str(d)[:16] for d in drivers[:30]]
        return pruned or None


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


class QueryResponse(BaseModel):
    """Response model for routed queries."""
    type: str  # Query type (BASIC_QUERY, TECHNICAL_QUERY, etc.)
    handler: str  # Handler class name
    response: str  # The actual response content
    metadata: Dict[str, Any]  # Additional metadata (processing time, tokens, etc.)
