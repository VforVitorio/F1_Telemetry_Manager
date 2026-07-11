"""
Chat API Endpoints

Handles chat requests from frontend and communicates with LM Studio.
Provides endpoints for health checks, sending messages, and streaming responses.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException

from backend.core.rate_limit import rate_limit
from fastapi.responses import StreamingResponse

from backend.services.chatbot import chat_engine
from backend.services.chatbot.llm_service import (
    check_health,
    get_available_models,
    send_message as lm_send_message,
    stream_message as lm_stream_message,
    build_messages,
    LLMServiceError
)
from backend.services.chatbot.stage_tracker import (
    clear_stage,
    get_stage,
)
from backend.models.chat_models import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
)
from backend.models.tool_schemas import ToolMessageRequest, ToolMessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Check if LM Studio is accessible and healthy.

    Returns:
        Health status information
    """
    try:
        health_info = check_health()
        return health_info
    except Exception as e:
        logger.error(f"Error checking health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def get_models():
    """
    Get list of available models from LM Studio.

    Returns:
        List of model names
    """
    try:
        models = get_available_models()
        return {"models": models}
    except LLMServiceError as e:
        logger.error(f"LM Studio error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message", response_model=ChatResponse, dependencies=[Depends(rate_limit("chat-message", capacity=10, per_minute=20))])
async def send_chat_message(request: ChatRequest):
    """
    Send a message to LM Studio and get the complete response (non-streaming).

    Args:
        request: Chat request with message, history, and parameters

    Returns:
        Complete chat response
    """
    try:
        # Build messages array with multimodal support for vision models
        messages = build_messages(
            user_message=request.text,
            image_base64=request.image,
            chat_history=request.chat_history,
            context=request.context
        )

        # Send to LM Studio
        response = lm_send_message(
            messages=messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=False
        )

        # Extract response content
        if "choices" in response and len(response["choices"]) > 0:
            content = response["choices"][0]["message"]["content"]
            llm_model = response.get("model")
            tokens_used = response.get("usage", {}).get("total_tokens")

            return ChatResponse(
                response=content,
                llm_model=llm_model,
                tokens_used=tokens_used
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Invalid response from LM Studio"
            )

    except LLMServiceError as e:
        logger.error(f"LM Studio error: {e}")

        # Always retry without image if an image was attached
        # Many vision errors don't have obvious keywords (e.g., "Channel Error")
        if request.image:
            logger.warning(
                f"Image was attached and LM Studio failed - retrying without image. Original error: {e}")
            try:
                # Retry with text only
                messages_text_only = build_messages(
                    user_message=request.text +
                    "\n\n[Note: Image was attached but the model couldn't process it]",
                    image_base64=None,
                    chat_history=request.chat_history,
                    context=request.context
                )

                response = lm_send_message(
                    messages=messages_text_only,
                    model=request.model,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    stream=False
                )

                if "choices" in response and len(response["choices"]) > 0:
                    content = response["choices"][0]["message"]["content"]
                    return ChatResponse(
                        response=content + "\n\n⚠️ Note: The attached image could not be processed. The model may not support vision, or the image format is incompatible.",
                        llm_model=response.get("model"),
                        tokens_used=response.get(
                            "usage", {}).get("total_tokens")
                    )
            except Exception as retry_error:
                logger.error(f"Retry without image also failed: {retry_error}")
                raise HTTPException(
                    status_code=503,
                    detail=f"LM Studio failed with image: {e}. Retry without image also failed: {retry_error}"
                )

        # No image attached, or retry failed
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream", dependencies=[Depends(rate_limit("chat-stream", capacity=10, per_minute=20))])
async def stream_chat_message(request: ChatRequest):
    """
    Send a message to LM Studio and stream the response.

    Args:
        request: Chat request with message, history, and parameters

    Returns:
        Streaming response with text chunks
    """
    try:
        # Build messages array with multimodal support for vision models
        messages = build_messages(
            user_message=request.text,
            image_base64=request.image,
            chat_history=request.chat_history,
            context=request.context
        )

        # Create a generator that yields chunks
        def generate():
            try:
                for chunk in lm_stream_message(
                    messages=messages,
                    model=request.model,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens
                ):
                    yield chunk
            except LLMServiceError as e:
                logger.error(f"LM Studio streaming error: {e}")
                yield f"\n\nError: {str(e)}"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"\n\nError: {str(e)}"

        return StreamingResponse(
            generate(),
            media_type="text/plain"
        )

    except Exception as e:
        logger.error(f"Error initializing stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /tool-message — Tool-aware chat (MCP-driven via chat_engine)
# ---------------------------------------------------------------------------
#
# Routing is now performed by the LLM itself: the chat_engine pulls every
# tool from the FastMCP server, exposes them via OpenAI's ``tools=`` API,
# and dispatches the model's choice back through the MCP client.  No more
# regex/keyword extractor, no more separate classifier — the model sees
# the same schemas an external MCP client would and decides for itself.
# The legacy ``tool_param_extractor``, ``query_classifier``, ``QueryRouter``
# and per-handler files were retired in the same refactor along with the
# ``/chat/query`` endpoint.


@router.get("/status")
def chat_status(request_id: str):
    """Return the latest backend stage for *request_id* (smart-spinner poll target).

    The Streamlit chat polls this endpoint every ~1s while a message is in
    flight so the spinner label can mirror the real backend stage instead
    of rotating fake placeholders.
    """
    return {"stage": get_stage(request_id)}


@router.post("/tool-message", response_model=ToolMessageResponse, dependencies=[Depends(rate_limit("chat-tool-message", capacity=10, per_minute=20))])
async def tool_message(
    request: ToolMessageRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    """Tool-aware chat — non-streaming JSON variant.

    Drives ``chat_engine.get_response`` and packages the result into the
    ``ToolMessageResponse`` shape the rest of the API expects.  The
    optional ``X-Request-Id`` header is echoed into the stage tracker so
    the frontend's smart-spinner poll target (``/chat/status``) keeps
    working even for non-streaming consumers.
    """
    request_id = x_request_id or str(uuid.uuid4())
    try:
        result = await chat_engine.get_response(
            text=request.text,
            request_id=request_id,
            image=request.image,
            chat_history=request.chat_history,
            context=request.context,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return ToolMessageResponse(
            response=result.get("response") or "No response from LLM.",
            llm_model=result.get("llm_model"),
            tokens_used=result.get("tokens_used"),
            tool_result=result.get("tool_result"),
        )
    except Exception as exc:
        logger.exception("tool_message failed")
        return ToolMessageResponse(response=f"Error contacting the LLM: {exc}")
    finally:
        clear_stage(request_id)


@router.post("/tool-message-stream", dependencies=[Depends(rate_limit("chat-tool-stream", capacity=10, per_minute=20))])
async def tool_message_stream(
    request: ToolMessageRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    """Tool-aware chat — Server-Sent Events streaming variant.

    Yields the same event sequence the frontend has consumed since v1.3:
    ``stage`` (whenever the backend phase advances), ``tool_result`` (rich
    structured payload that maps to the chat's tool renderers), ``token``
    (LLM text chunks for the live-typing UX), and ``done`` (final marker
    with provider metadata).  All formatting concerns live in this module;
    the ``chat_engine`` only produces (event, payload) tuples.
    """
    request_id = x_request_id or str(uuid.uuid4())

    async def event_stream():
        try:
            async for event_name, payload in chat_engine.stream_response(
                text=request.text,
                request_id=request_id,
                image=request.image,
                chat_history=request.chat_history,
                context=request.context,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                yield _sse(event_name, payload)
        except Exception as exc:
            logger.exception("tool_message_stream failed")
            yield _sse("token", {"token": f"\n\nError: {exc}"})
            yield _sse("done", {"error": str(exc)})
        finally:
            clear_stage(request_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # Prevent intermediate proxies (nginx, Docker) and the browser
            # from buffering the stream; the user must see tokens land
            # incrementally rather than as a single delayed dump.
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, payload: dict) -> str:
    """Format a single Server-Sent Event frame.

    SSE allows a ``data:`` field to span multiple lines, but ``json.dumps``
    yields a single-line representation by default which keeps both the
    parser and the network frame simple.  ``ensure_ascii=False`` preserves
    accented characters — chat messages are bilingual.
    """
    return f"event: {event}\ndata: {json.dumps(payload, default=str, ensure_ascii=False)}\n\n"
