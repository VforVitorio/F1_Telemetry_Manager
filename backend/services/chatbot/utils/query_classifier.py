"""
Query Classifier

Uses LLM to automatically classify user queries into predefined categories.
"""

import logging
from pathlib import Path
from typing import Optional
from enum import Enum

from backend.services.chatbot.lmstudio_service import send_message, LMStudioError

logger = logging.getLogger(__name__)


class QueryType(str, Enum):
    """Enumeration of supported query types."""
    BASIC_QUERY = "BASIC_QUERY"
    TECHNICAL_QUERY = "TECHNICAL_QUERY"
    COMPARISON_QUERY = "COMPARISON_QUERY"
    REPORT_REQUEST = "REPORT_REQUEST"
    DOWNLOAD_REQUEST = "DOWNLOAD_REQUEST"
    UNKNOWN = "UNKNOWN"  # Fallback for unclassified queries


class QueryClassifier:
    """
    Classifies user queries using LLM-based classification.

    Uses a specialized system prompt to determine the type of query
    and route it to the appropriate handler.
    """

    def __init__(self):
        """Initialize the classifier with the system prompt."""
        self.system_prompt = self._load_system_prompt()
        logger.info("QueryClassifier initialized")

    def _load_system_prompt(self) -> str:
        """
        Load the classifier system prompt from markdown file.

        Returns:
            str: The system prompt content
        """
        try:
            prompt_path = Path(__file__).parent.parent / "prompts" / "classifier_system_prompt.md"
            with open(prompt_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error loading classifier prompt: {e}")
            # Fallback minimal prompt
            return (
                "Classify the user query into one of these categories: "
                "BASIC_QUERY, TECHNICAL_QUERY, COMPARISON_QUERY, "
                "REPORT_REQUEST, DOWNLOAD_REQUEST. "
                "Return ONLY the category name."
            )

    def classify(
        self,
        user_message: str,
        temperature: float = 0.1,  # Low temperature for consistent classification
        max_tokens: int = 50  # Short response expected
    ) -> QueryType:
        """
        Classify a user message into a query type.

        Args:
            user_message: The message to classify
            temperature: LLM temperature (low for consistency)
            max_tokens: Maximum tokens for response

        Returns:
            QueryType: The classified query type
        """
        try:
            # Build messages for classification
            messages = [
                {
                    "role": "system",
                    "content": self.system_prompt
                },
                {
                    "role": "user",
                    "content": f"Classify this query: {user_message}"
                }
            ]

            logger.info(f"Classifying query: {user_message[:100]}...")

            # Get classification from LLM
            response = send_message(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False
            )

            # Extract classification
            if "choices" in response and len(response["choices"]) > 0:
                classification = response["choices"][0]["message"]["content"].strip().upper()

                # Validate and convert to QueryType
                try:
                    query_type = QueryType(classification)
                    logger.info(f"Query classified as: {query_type.value}")
                    return query_type
                except ValueError:
                    logger.warning(f"Invalid classification received: {classification}")
                    # Try to find a match in the response
                    for qt in QueryType:
                        if qt.value in classification:
                            logger.info(f"Matched query type: {qt.value}")
                            return qt

                    logger.warning("No valid query type found, defaulting to UNKNOWN")
                    return QueryType.UNKNOWN
            else:
                logger.error("Invalid response structure from LLM")
                return QueryType.UNKNOWN

        except LMStudioError as e:
            logger.error(f"LMStudio error during classification: {e}")
            # Fallback to rule-based classification
            return self._fallback_classify(user_message)
        except Exception as e:
            logger.error(f"Unexpected error during classification: {e}")
            return QueryType.UNKNOWN

    def _fallback_classify(self, user_message: str) -> QueryType:
        """
        Simple rule-based fallback classifier when LLM is unavailable.

        Args:
            user_message: The message to classify

        Returns:
            QueryType: The classified query type
        """
        message_lower = user_message.lower()

        # Check for download requests
        download_keywords = ['download', 'export', 'csv', 'json', 'excel', 'xlsx']
        if any(keyword in message_lower for keyword in download_keywords):
            logger.info("Fallback classified as DOWNLOAD_REQUEST")
            return QueryType.DOWNLOAD_REQUEST

        # Check for report requests
        report_keywords = ['report', 'summary', 'summarize', 'document', 'pdf']
        if any(keyword in message_lower for keyword in report_keywords):
            logger.info("Fallback classified as REPORT_REQUEST")
            return QueryType.REPORT_REQUEST

        # Check for comparison queries
        comparison_keywords = ['compare', 'versus', 'vs', 'vs.', 'difference between', 'delta']
        if any(keyword in message_lower for keyword in comparison_keywords):
            logger.info("Fallback classified as COMPARISON_QUERY")
            return QueryType.COMPARISON_QUERY

        # Check for technical queries
        technical_keywords = [
            'telemetry', 'speed', 'throttle', 'brake', 'rpm', 'gear',
            'temperature', 'tire', 'tyre', 'sector', 'lap time', 'data'
        ]
        if any(keyword in message_lower for keyword in technical_keywords):
            logger.info("Fallback classified as TECHNICAL_QUERY")
            return QueryType.TECHNICAL_QUERY

        # Default to basic query
        logger.info("Fallback classified as BASIC_QUERY")
        return QueryType.BASIC_QUERY
