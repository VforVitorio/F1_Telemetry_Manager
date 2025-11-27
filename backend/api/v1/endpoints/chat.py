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
    ChatMessage,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    QueryResponse
)
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
        # Build messages array with multimodal support
        messages = build_messages(
            user_message=request.text,
            image_base64=request.image,  # Pass image to LLM
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
        logger.error(f"LM Studio error with image: {e}")

        # Retry without image if error contains vision-related keywords
        if request.image and any(keyword in str(e).lower() for keyword in ['url', 'image', 'vision', 'multimodal']):
            logger.warning("Retrying without image (model may not support vision)")
            try:
                # Retry with text only
                messages_text_only = build_messages(
                    user_message=request.text + "\n\n[Note: Image was attached but model doesn't support vision]",
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
                        response=content + "\n\n⚠️ Note: Image was not processed (vision model required)",
                        llm_model=response.get("model"),
                        tokens_used=response.get("usage", {}).get("total_tokens")
                    )
            except Exception as retry_error:
                logger.error(f"Retry without image also failed: {retry_error}")

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
        # Build messages array with multimodal support
        messages = build_messages(
            user_message=request.text,
            image_base64=request.image,  # Pass image to LLM
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
