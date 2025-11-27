"""
Basic Query Handler

Handles simple queries about F1 concepts, terminology, and general information.
"""

import logging
from typing import Dict, Any, Optional

from .base_handler import BaseHandler
from backend.services.chatbot.lmstudio_service import (
    build_messages,
    send_message,
    LMStudioError
)

logger = logging.getLogger(__name__)


class BasicQueryHandler(BaseHandler):
    """
    Handler for basic F1 queries.

    Processes simple questions about F1 concepts, rules, terminology,
    and general information without requiring telemetry data.
    """

    def __init__(self):
        """Initialize the basic query handler."""
        super().__init__()
        self.system_prompt = self._get_system_prompt()

    def _get_system_prompt(self) -> str:
        """
        Get the system prompt for basic queries.

        Returns:
            str: System prompt
        """
        return (
            "You are a knowledgeable F1 Assistant specializing in explaining "
            "Formula 1 concepts, rules, terminology, and general information to users. "
            "\n\n"
            "Your responses should be:\n"
            "- Clear and easy to understand\n"
            "- Accurate and up-to-date\n"
            "- Educational and engaging\n"
            "- Suitable for both beginners and enthusiasts\n"
            "\n"
            "If the user asks about technical data or telemetry, politely inform them "
            "that you specialize in general F1 knowledge and suggest they ask a more "
            "specific technical question."
        )

    def handle(
        self,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Handle a basic query.

        Args:
            message: The user's message
            image: Optional base64 encoded image (not used for basic queries)
            chat_history: Optional chat history
            context: Optional F1 session context
            **kwargs: Additional parameters (model, temperature, max_tokens)

        Returns:
            Dict with response and metadata
        """
        self._log_request(message, **kwargs)

        try:
            # Build messages with basic query system prompt
            messages = build_messages(
                user_message=message,
                system_prompt=self.system_prompt,
                chat_history=chat_history,
                context=context
            )

            # Get response from LLM
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 1000),
                stream=False
            )

            # Extract response content
            if "choices" in response and len(response["choices"]) > 0:
                content = response["choices"][0]["message"]["content"]
                llm_model = response.get("model")
                tokens_used = response.get("usage", {}).get("total_tokens")

                self._log_response(len(content))

                return {
                    "response": content,
                    "llm_model": llm_model,
                    "tokens_used": tokens_used,
                    "metadata": {
                        "handler_type": "basic_query",
                        "used_context": context is not None,
                        "used_history": chat_history is not None and len(chat_history) > 0,
                    }
                }
            else:
                raise ValueError("Invalid response structure from LLM")

        except LMStudioError as e:
            logger.error(f"LMStudio error in BasicQueryHandler: {e}")
            return {
                "response": f"I'm having trouble connecting to the AI service. Error: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "basic_query",
                    "error": str(e)
                }
            }
        except Exception as e:
            logger.error(f"Error in BasicQueryHandler: {e}", exc_info=True)
            return {
                "response": f"An error occurred while processing your query: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "basic_query",
                    "error": str(e)
                }
            }
