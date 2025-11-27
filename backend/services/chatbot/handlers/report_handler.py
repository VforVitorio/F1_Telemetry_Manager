"""
Report Handler

Handles requests to generate reports and summaries from conversations.
"""

import logging
from typing import Dict, Any, Optional

from .base_handler import BaseHandler
from backend.services.chatbot.lmstudio_service import (
    send_message,
    LMStudioError
)

logger = logging.getLogger(__name__)


class ReportHandler(BaseHandler):
    """
    Handler for report generation requests.

    Processes requests to summarize conversations, generate reports,
    and create documentation from chat interactions.
    """

    def __init__(self):
        """Initialize the report handler."""
        super().__init__()
        self.system_prompt = self._get_system_prompt()

    def _get_system_prompt(self) -> str:
        """
        Get the system prompt for report generation.

        Returns:
            str: System prompt
        """
        return (
            "You are an expert F1 Report Generator specializing in creating "
            "clear, concise, and professional summaries of F1 analyses and conversations. "
            "\n\n"
            "Your responsibilities:\n"
            "- Summarize complex technical discussions\n"
            "- Highlight key findings and insights\n"
            "- Structure information logically\n"
            "- Include relevant data points and statistics\n"
            "- Maintain technical accuracy\n"
            "- Format reports in a readable, professional manner\n"
            "\n"
            "Report Structure:\n"
            "1. Executive Summary - Brief overview\n"
            "2. Key Findings - Main insights discovered\n"
            "3. Detailed Analysis - Technical details\n"
            "4. Data Points - Relevant statistics\n"
            "5. Conclusions - Summary and recommendations\n"
            "\n"
            "Use markdown formatting for better readability."
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
        Handle a report generation request.

        Args:
            message: The user's message
            image: Optional base64 encoded image (not typically used for reports)
            chat_history: Chat history to summarize (required for reports)
            context: Optional F1 session context
            **kwargs: Additional parameters (model, temperature, max_tokens)

        Returns:
            Dict with response and metadata
        """
        self._log_request(message, **kwargs)

        try:
            # Check if we have chat history to summarize
            if not chat_history or len(chat_history) == 0:
                return {
                    "response": (
                        "I don't have any conversation history to create a report from. "
                        "Please have a conversation first, and then I can generate a "
                        "summary report of our discussion."
                    ),
                    "llm_model": None,
                    "tokens_used": None,
                    "metadata": {
                        "handler_type": "report",
                        "error": "No chat history available",
                    }
                }

            # Build report generation prompt
            report_prompt = self._build_report_prompt(message, chat_history, context)

            messages = [
                {
                    "role": "system",
                    "content": self.system_prompt
                },
                {
                    "role": "user",
                    "content": report_prompt
                }
            ]

            # Get response from LLM
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.5),  # Lower for consistency
                max_tokens=kwargs.get("max_tokens", 2000),  # Higher for complete reports
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
                        "handler_type": "report",
                        "messages_summarized": len(chat_history),
                        "report_format": "markdown",
                        "used_context": context is not None,
                    }
                }
            else:
                raise ValueError("Invalid response structure from LLM")

        except LMStudioError as e:
            logger.error(f"LMStudio error in ReportHandler: {e}")
            return {
                "response": f"I'm having trouble connecting to the AI service. Error: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "report",
                    "error": str(e)
                }
            }
        except Exception as e:
            logger.error(f"Error in ReportHandler: {e}", exc_info=True)
            return {
                "response": f"An error occurred while generating the report: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "report",
                    "error": str(e)
                }
            }

    def _build_report_prompt(
        self,
        user_request: str,
        chat_history: list,
        context: Optional[Dict[str, Any]]
    ) -> str:
        """
        Build a prompt for report generation.

        Args:
            user_request: User's report request
            chat_history: Conversation history
            context: Optional context data

        Returns:
            str: Complete prompt for report generation
        """
        prompt = f"User Request: {user_request}\n\n"
        prompt += "Please generate a professional report summarizing the following conversation:\n\n"

        # Add context if available
        if context:
            prompt += "## Session Context\n"
            if "year" in context:
                prompt += f"- Year: {context['year']}\n"
            if "grand_prix" in context:
                prompt += f"- Grand Prix: {context['grand_prix']}\n"
            if "session" in context:
                prompt += f"- Session: {context['session']}\n"
            if "drivers" in context:
                prompt += f"- Drivers: {', '.join(context['drivers'])}\n"
            prompt += "\n"

        # Add conversation history
        prompt += "## Conversation History\n\n"
        for idx, msg in enumerate(chat_history, 1):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if role and content:
                prompt += f"**{role.capitalize()}**: {content}\n\n"

        prompt += "\n---\n\n"
        prompt += "Generate a comprehensive report following the standard report structure."

        return prompt
