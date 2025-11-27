"""
Query Router

Main router that detects query types and routes them to appropriate handlers.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime

from backend.services.chatbot.utils.query_classifier import QueryClassifier, QueryType
from backend.services.chatbot.utils.validators import validate_query_request
from backend.services.chatbot.handlers import (
    BasicQueryHandler,
    TechnicalQueryHandler,
    ComparisonQueryHandler,
    ReportHandler,
    DownloadHandler,
)

logger = logging.getLogger(__name__)


class QueryRouter:
    """
    Routes user queries to appropriate handlers based on query type.

    The router uses an LLM-based classifier to detect the query type
    and then delegates processing to specialized handlers.
    """

    def __init__(self):
        """Initialize the router with classifier and handlers."""
        self.classifier = QueryClassifier()

        # Initialize handlers
        self.handlers = {
            QueryType.BASIC_QUERY: BasicQueryHandler(),
            QueryType.TECHNICAL_QUERY: TechnicalQueryHandler(),
            QueryType.COMPARISON_QUERY: ComparisonQueryHandler(),
            QueryType.REPORT_REQUEST: ReportHandler(),
            QueryType.DOWNLOAD_REQUEST: DownloadHandler(),
        }

        logger.info("QueryRouter initialized with all handlers")

    def detect_query_type(self, user_message: str) -> QueryType:
        """
        Detect the type of a user query.

        Args:
            user_message: The user's message

        Returns:
            QueryType: The detected query type
        """
        try:
            query_type = self.classifier.classify(user_message)
            logger.info(f"Query type detected: {query_type.value}")
            return query_type
        except Exception as e:
            logger.error(f"Error detecting query type: {e}")
            return QueryType.UNKNOWN

    def route_to_handler(
        self,
        query_type: QueryType,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Route a query to the appropriate handler.

        Args:
            query_type: The type of query
            message: The user's message
            image: Optional base64 encoded image
            chat_history: Optional chat history
            context: Optional F1 session context
            **kwargs: Additional parameters for handlers

        Returns:
            Dict containing the handler response
        """
        try:
            # Get the appropriate handler
            handler = self.handlers.get(query_type)

            if handler is None:
                logger.warning(f"No handler found for query type: {query_type}")
                # Fallback to basic query handler
                handler = self.handlers[QueryType.BASIC_QUERY]

            logger.info(f"Routing to handler: {handler.__class__.__name__}")

            # Execute handler
            response = handler.handle(
                message=message,
                image=image,
                chat_history=chat_history,
                context=context,
                **kwargs
            )

            return response

        except Exception as e:
            logger.error(f"Error routing to handler: {e}", exc_info=True)
            raise

    def process_query(
        self,
        text: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> Dict[str, Any]:
        """
        Process a complete query: detect type, route, and handle.

        Args:
            text: The user's message
            image: Optional base64 encoded image
            chat_history: Optional chat history
            context: Optional F1 session context
            model: Optional model name
            temperature: LLM temperature
            max_tokens: Maximum tokens for response

        Returns:
            Dict with complete response including metadata
        """
        start_time = datetime.utcnow()

        try:
            # Validate request
            request_data = {
                "text": text,
                "image": image,
                "chat_history": chat_history,
                "context": context,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            validate_query_request(request_data)

            # Detect query type
            query_type = self.detect_query_type(text)

            # Route to handler
            handler_response = self.route_to_handler(
                query_type=query_type,
                message=text,
                image=image,
                chat_history=chat_history,
                context=context,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            # Calculate processing time
            end_time = datetime.utcnow()
            processing_time_ms = (end_time - start_time).total_seconds() * 1000

            # Build complete response
            response = {
                "type": query_type.value,
                "handler": self.handlers[query_type].__class__.__name__,
                "response": handler_response.get("response", ""),
                "metadata": {
                    "query_type": query_type.value,
                    "handler": self.handlers[query_type].__class__.__name__,
                    "processing_time_ms": round(processing_time_ms, 2),
                    "timestamp": start_time.isoformat(),
                    "llm_model": handler_response.get("llm_model"),
                    "tokens_used": handler_response.get("tokens_used"),
                    **handler_response.get("metadata", {}),
                }
            }

            logger.info(
                f"Query processed successfully: {query_type.value} "
                f"in {processing_time_ms:.2f}ms"
            )

            return response

        except Exception as e:
            logger.error(f"Error processing query: {e}", exc_info=True)
            end_time = datetime.utcnow()
            processing_time_ms = (end_time - start_time).total_seconds() * 1000

            return {
                "type": "ERROR",
                "handler": "None",
                "response": f"Error processing query: {str(e)}",
                "metadata": {
                    "error": str(e),
                    "processing_time_ms": round(processing_time_ms, 2),
                    "timestamp": start_time.isoformat(),
                }
            }
