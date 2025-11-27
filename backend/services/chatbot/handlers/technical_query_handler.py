"""
Technical Query Handler

Handles advanced technical queries requiring telemetry data and performance analysis.
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


class TechnicalQueryHandler(BaseHandler):
    """
    Handler for technical F1 queries.

    Processes advanced questions requiring telemetry data, performance metrics,
    and detailed technical analysis.
    """

    def __init__(self):
        """Initialize the technical query handler."""
        super().__init__()
        self.system_prompt = self._get_system_prompt()

    def _get_system_prompt(self) -> str:
        """
        Get the system prompt for technical queries.

        Returns:
            str: System prompt
        """
        return (
            "You are an expert F1 Technical Analyst with deep knowledge of "
            "telemetry data, performance metrics, and racing engineering. "
            "\n\n"
            "Your expertise includes:\n"
            "- Telemetry analysis (speed, throttle, brake, RPM, gear, DRS)\n"
            "- Performance optimization and setup analysis\n"
            "- Tire management and degradation patterns\n"
            "- Aerodynamic efficiency and downforce\n"
            "- Power unit performance and energy recovery\n"
            "- Racing line optimization\n"
            "\n"
            "When analyzing telemetry data:\n"
            "- Provide specific technical insights\n"
            "- Reference actual data points when available\n"
            "- Explain the 'why' behind the numbers\n"
            "- Suggest performance improvements when relevant\n"
            "- Use technical terminology appropriately\n"
            "\n"
            "If telemetry data is not provided in the context, explain what data "
            "would be needed to provide a complete analysis."
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
        Handle a technical query.

        Args:
            message: The user's message
            image: Optional base64 encoded image (e.g., telemetry charts)
            chat_history: Optional chat history
            context: Optional F1 session context with telemetry data
            **kwargs: Additional parameters (model, temperature, max_tokens)

        Returns:
            Dict with response and metadata
        """
        self._log_request(message, **kwargs)

        try:
            # TODO: Future enhancement - fetch telemetry data based on context
            # This would integrate with the existing telemetry service

            # Build messages with technical system prompt
            messages = build_messages(
                user_message=message,
                image_base64=image,  # Pass image (telemetry charts) to build_messages
                system_prompt=self.system_prompt,
                chat_history=chat_history,
                context=context
            )

            # Get response from LLM
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 1500),  # Higher for technical detail
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
                        "handler_type": "technical_query",
                        "used_context": context is not None,
                        "used_history": chat_history is not None and len(chat_history) > 0,
                        "used_image": image is not None,
                        "requires_telemetry_data": True,
                    }
                }
            else:
                raise ValueError("Invalid response structure from LLM")

        except LMStudioError as e:
            logger.error(f"LMStudio error in TechnicalQueryHandler: {e}")
            return {
                "response": f"I'm having trouble connecting to the AI service. Error: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "technical_query",
                    "error": str(e)
                }
            }
        except Exception as e:
            logger.error(f"Error in TechnicalQueryHandler: {e}", exc_info=True)
            return {
                "response": f"An error occurred while processing your technical query: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "technical_query",
                    "error": str(e)
                }
            }
