"""
Comparison Query Handler

Handles multi-driver/multi-lap comparison queries with statistical analysis.
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


class ComparisonQueryHandler(BaseHandler):
    """
    Handler for comparison queries.

    Processes queries that compare multiple drivers, laps, or sessions
    with statistical analysis and performance deltas.
    """

    def __init__(self):
        """Initialize the comparison query handler."""
        super().__init__()
        self.system_prompt = self._get_system_prompt()

    def _get_system_prompt(self) -> str:
        """
        Get the system prompt for comparison queries.

        Returns:
            str: System prompt
        """
        return (
            "You are an expert F1 Performance Analyst specializing in "
            "comparative analysis between drivers, laps, and sessions. "
            "\n\n"
            "Your expertise includes:\n"
            "- Side-by-side performance comparisons\n"
            "- Statistical analysis and delta calculations\n"
            "- Identifying performance advantages and disadvantages\n"
            "- Sector-by-sector analysis\n"
            "- Teammate comparisons and qualifying battles\n"
            "- Race pace vs qualifying pace analysis\n"
            "\n"
            "When providing comparisons:\n"
            "- Present data in a clear, structured format\n"
            "- Highlight key differences and similarities\n"
            "- Calculate relevant deltas (time, speed, percentage)\n"
            "- Provide context for the differences\n"
            "- Identify trends and patterns\n"
            "- Be objective and data-driven\n"
            "\n"
            "If comparison data is not provided in the context, explain what data "
            "would be needed for a complete comparison analysis."
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
        Handle a comparison query.

        Args:
            message: The user's message
            image: Optional base64 encoded image (e.g., comparison charts)
            chat_history: Optional chat history
            context: Optional F1 session context with comparison data
            **kwargs: Additional parameters (model, temperature, max_tokens)

        Returns:
            Dict with response and metadata
        """
        self._log_request(message, **kwargs)

        try:
            # TODO: Future enhancement - fetch comparison data from telemetry service
            # Extract driver names/lap numbers from the query
            # Retrieve and format comparison data

            # Build messages with comparison system prompt
            messages = build_messages(
                user_message=message,
                image_base64=image,  # Pass image (comparison charts) to build_messages
                system_prompt=self.system_prompt,
                chat_history=chat_history,
                context=context
            )

            # Get response from LLM
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 1500),  # Higher for detailed comparisons
                stream=False
            )

            # Extract response content
            if "choices" in response and len(response["choices"]) > 0:
                content = response["choices"][0]["message"]["content"]
                llm_model = response.get("model")
                tokens_used = response.get("usage", {}).get("total_tokens")

                self._log_response(len(content))

                # TODO: Extract compared entities from response or context
                compared_entities = self._extract_compared_entities(message, context)

                return {
                    "response": content,
                    "llm_model": llm_model,
                    "tokens_used": tokens_used,
                    "metadata": {
                        "handler_type": "comparison_query",
                        "used_context": context is not None,
                        "used_history": chat_history is not None and len(chat_history) > 0,
                        "used_image": image is not None,
                        "compared_entities": compared_entities,
                        "requires_comparison_data": True,
                    }
                }
            else:
                raise ValueError("Invalid response structure from LLM")

        except LMStudioError as e:
            logger.error(f"LMStudio error in ComparisonQueryHandler: {e}")
            return {
                "response": f"I'm having trouble connecting to the AI service. Error: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "comparison_query",
                    "error": str(e)
                }
            }
        except Exception as e:
            logger.error(f"Error in ComparisonQueryHandler: {e}", exc_info=True)
            return {
                "response": f"An error occurred while processing your comparison query: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "comparison_query",
                    "error": str(e)
                }
            }

    def _extract_compared_entities(
        self,
        message: str,
        context: Optional[Dict[str, Any]]
    ) -> list:
        """
        Extract entities being compared from message or context.

        Args:
            message: User message
            context: Optional context data

        Returns:
            List of entities being compared
        """
        # TODO: Implement entity extraction
        # For now, return empty list or extract from context if available
        entities = []

        if context and "drivers" in context:
            entities = context["drivers"]

        return entities
