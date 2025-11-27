"""
Download Handler

Handles requests to download or export data in various formats (CSV, JSON, Excel).
"""

import logging
from typing import Dict, Any, Optional

from .base_handler import BaseHandler

logger = logging.getLogger(__name__)


class DownloadHandler(BaseHandler):
    """
    Handler for data download/export requests.

    Processes requests to export telemetry data, analysis results,
    or conversation data in formats like CSV, JSON, or Excel.
    """

    def __init__(self):
        """Initialize the download handler."""
        super().__init__()
        self.supported_formats = ["csv", "json", "excel", "xlsx"]

    def handle(
        self,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Handle a download request.

        Args:
            message: The user's message
            image: Optional base64 encoded image (not used for downloads)
            chat_history: Optional chat history
            context: Optional F1 session context with data to export
            **kwargs: Additional parameters

        Returns:
            Dict with response and metadata including download information
        """
        self._log_request(message, **kwargs)

        try:
            # Detect requested format
            requested_format = self._detect_format(message)

            # Check if we have data to export
            if not context or not self._has_exportable_data(context):
                return {
                    "response": (
                        "I don't have any data to export at the moment. "
                        "Please perform an analysis or comparison first, and then "
                        f"I can export the data as {requested_format.upper()}."
                    ),
                    "llm_model": None,
                    "tokens_used": None,
                    "metadata": {
                        "handler_type": "download",
                        "requested_format": requested_format,
                        "error": "No exportable data available",
                        "available_formats": self.supported_formats,
                    }
                }

            # TODO: Future enhancement - integrate with data export service
            # Generate actual file and return download link/data

            # For now, provide informative response
            response_text = self._generate_download_response(requested_format, context)

            return {
                "response": response_text,
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "download",
                    "requested_format": requested_format,
                    "available_formats": self.supported_formats,
                    "data_available": True,
                    # TODO: Add actual download link when implemented
                    # "download_url": "...",
                    # "file_size": "...",
                    # "expires_at": "..."
                }
            }

        except Exception as e:
            logger.error(f"Error in DownloadHandler: {e}", exc_info=True)
            return {
                "response": f"An error occurred while preparing your download: {str(e)}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "download",
                    "error": str(e)
                }
            }

    def _detect_format(self, message: str) -> str:
        """
        Detect the requested export format from the message.

        Args:
            message: User's message

        Returns:
            str: Detected format (defaults to 'csv')
        """
        message_lower = message.lower()

        for fmt in self.supported_formats:
            if fmt in message_lower:
                logger.info(f"Detected format: {fmt}")
                return fmt

        # Default to CSV if no format specified
        logger.info("No format detected, defaulting to CSV")
        return "csv"

    def _has_exportable_data(self, context: Optional[Dict[str, Any]]) -> bool:
        """
        Check if context contains exportable data.

        Args:
            context: Context data

        Returns:
            bool: True if data is available for export
        """
        if not context:
            return False

        # Check for common data indicators
        exportable_keys = [
            "telemetry_data",
            "lap_times",
            "comparison_data",
            "analysis_results",
            "drivers",
            "session_data"
        ]

        return any(key in context for key in exportable_keys)

    def _generate_download_response(
        self,
        format: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Generate a response about the download.

        Args:
            format: Requested format
            context: Context with data info

        Returns:
            str: Response message
        """
        # TODO: Replace with actual download link generation
        response = f"## Data Export Request\n\n"
        response += f"I'm preparing to export your data in **{format.upper()}** format.\n\n"

        # Describe available data
        if "drivers" in context:
            response += f"**Drivers**: {', '.join(context['drivers'])}\n"
        if "session" in context:
            response += f"**Session**: {context['session']}\n"
        if "year" in context and "grand_prix" in context:
            response += f"**Event**: {context['year']} {context['grand_prix']}\n"

        response += "\n---\n\n"
        response += (
            "**Note**: The download functionality will be fully implemented soon. "
            "This will include:\n"
            "- Direct download links\n"
            "- Multiple format options (CSV, JSON, Excel)\n"
            "- Data validation and formatting\n"
            "- Automatic file naming\n"
        )

        return response
