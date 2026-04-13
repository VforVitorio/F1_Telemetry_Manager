"""
Chat API Endpoints

Handles chat requests from frontend and communicates with LM Studio.
Provides endpoints for health checks, sending messages, and streaming responses.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import logging

from backend.services.chatbot.lmstudio_service import (
    check_health,
    get_available_models,
    send_message as lm_send_message,
    stream_message as lm_stream_message,
    build_messages,
    LMStudioError
)
from backend.models.chat_models import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    QueryResponse
)
from backend.models.tool_schemas import ToolMessageRequest, ToolMessageResponse
from backend.services.chatbot.router import QueryRouter
from backend.services.chatbot.utils.validators import ValidationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Initialize the query router (singleton)
query_router = QueryRouter()


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
    except LMStudioError as e:
        logger.error(f"LM Studio error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message", response_model=ChatResponse)
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

    except LMStudioError as e:
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


@router.post("/stream")
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
            except LMStudioError as e:
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


@router.post("/query", response_model=QueryResponse)
async def process_query(request: ChatRequest):
    """
    Process a query with intelligent routing to appropriate handler.

    This endpoint automatically detects the type of query (basic, technical,
    comparison, report, or download) and routes it to the specialized handler.

    Args:
        request: Chat request with message, history, and parameters

    Returns:
        QueryResponse with type, handler, response, and metadata
    """
    try:
        logger.info(f"Received query request: {request.text[:100]}...")

        # Process query through router
        result = query_router.process_query(
            text=request.text,
            image=request.image,
            chat_history=request.chat_history,
            context=request.context,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        logger.info(
            f"Query processed successfully: type={result['type']}, "
            f"handler={result['handler']}"
        )

        return QueryResponse(**result)

    except ValidationError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except LMStudioError as e:
        logger.error(f"LM Studio error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /tool-message — Tool-aware chat (strategy tools + LLM fallback)
# ---------------------------------------------------------------------------


@router.post("/tool-message", response_model=ToolMessageResponse)
def tool_message(request: ToolMessageRequest):
    """Chat endpoint with automatic strategy tool invocation.

    Classifies the user message.  If it looks like a strategy query,
    extracts parameters (GP, driver, lap) and calls the appropriate ML
    agent in-process.  The raw result is summarised by LM Studio and
    returned alongside a structured ``tool_result`` for rich frontend
    rendering.  Non-strategy messages are forwarded to LM Studio directly.
    """
    from backend.services.chatbot.utils.query_classifier import QueryClassifier, QueryType
    from backend.services.chatbot.handlers.strategy_handler import StrategyHandler
    from backend.services.chatbot.utils.tool_param_extractor import ToolParameterExtractor

    # 1. Always try to extract tool params first — the extractor is smarter
    #    than the classifier at detecting driver+GP+lap patterns
    extractor = _build_extractor()
    tool_call = extractor.extract(request.text)

    # 2. If extractor found a confident tool call, use it directly
    if tool_call.confidence >= 0.5:
        logger.info("Tool extractor matched: %s (confidence %.2f)", tool_call.tool, tool_call.confidence)
    else:
        # Fall back to classifier for ambiguous messages
        classifier = QueryClassifier()
        query_type = classifier.classify(request.text)

        if query_type != QueryType.STRATEGY_QUERY:
            return _forward_to_llm(request)

        # Classifier said strategy but extractor low confidence → try anyway
        if tool_call.confidence < 0.3:
            return _forward_to_llm(request)

    if not tool_call.is_rag_query and not tool_call.is_listing_tool and not tool_call.is_telemetry_tool and not tool_call.has_required_location:
        return ToolMessageResponse(
            response=(
                "I'd like to run that analysis for you, but I need a bit more info. "
                "Could you tell me the **Grand Prix**, **driver** (e.g. VER, HAM), "
                "and **lap number**?"
            ),
        )

    # 5. Execute tool + summarise
    handler = StrategyHandler()
    result = handler.handle_with_tools(
        message=request.text,
        tool_call=tool_call,
        image=request.image,
        chat_history=request.chat_history,
    )

    return ToolMessageResponse(
        response=result["response"],
        llm_model=result.get("llm_model"),
        tokens_used=result.get("tokens_used"),
        tool_result=result.get("tool_result"),
    )


def _forward_to_llm(request: ToolMessageRequest) -> ToolMessageResponse:
    """Forward a non-strategy message to LM Studio and return plain text."""
    try:
        messages = build_messages(
            user_message=request.text,
            image_base64=request.image,
            chat_history=request.chat_history,
            context=request.context,
        )
        response = lm_send_message(
            messages=messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        content = ""
        if "choices" in response and response["choices"]:
            content = response["choices"][0]["message"]["content"]
        return ToolMessageResponse(
            response=content or "No response from LLM.",
            llm_model=response.get("model"),
            tokens_used=response.get("usage", {}).get("total_tokens"),
        )
    except Exception as exc:
        logger.error("LLM forward error: %s", exc, exc_info=True)
        return ToolMessageResponse(
            response=f"Error contacting the LLM: {exc}",
        )


def _build_extractor() -> "ToolParameterExtractor":
    """Create a ToolParameterExtractor with the current GP list for fuzzy matching."""
    from backend.services.chatbot.utils.tool_param_extractor import ToolParameterExtractor
    from backend.utils.laps_cache import get_laps_df

    extractor = ToolParameterExtractor()
    df = get_laps_df(2025)
    if df is not None:
        gps = sorted(df["GP_Name"].dropna().unique().tolist())
        extractor.refresh_gps(gps)
    return extractor
