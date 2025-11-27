"""
Base Handler

Abstract base class for all query handlers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseHandler(ABC):
    """
    Abstract base class for query handlers.

    All handlers must implement the handle() method to process queries.
    """

    def __init__(self):
        """Initialize the handler."""
        self.handler_name = self.__class__.__name__
        logger.info(f"{self.handler_name} initialized")

    @abstractmethod
    def handle(
        self,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Handle a query and return a response.

        Args:
            message: The user's message
            image: Optional base64 encoded image
            chat_history: Optional chat history
            context: Optional F1 session context
            **kwargs: Additional parameters

        Returns:
            Dict with response and metadata:
            {
                "response": str,
                "llm_model": Optional[str],
                "tokens_used": Optional[int],
                "metadata": Dict[str, Any]
            }
        """
        pass

    def _log_request(self, message: str, **kwargs):
        """Log incoming request."""
        logger.info(
            f"{self.handler_name} received request: {message[:100]}... "
            f"(kwargs: {list(kwargs.keys())})"
        )

    def _log_response(self, response_length: int):
        """Log response."""
        logger.info(f"{self.handler_name} generated response ({response_length} chars)")
