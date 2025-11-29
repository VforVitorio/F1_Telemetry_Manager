"""
Download Handler

Handles requests to download or export data in various formats (CSV, JSON, Excel).
"""

import logging
from typing import Dict, Any, Optional
from pathlib import Path

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
        self.supported_formats = ["csv", "json", "excel", "xlsx", "parquet"]
        self.system_prompt = self._get_system_prompt()

    def _get_system_prompt(self) -> str:
        """
        Get the system prompt for download requests.

        Returns:
            str: System prompt
        """
        try:
            prompt_path = Path(__file__).parent.parent / "prompts" / "download_handler_prompt.md"
            with open(prompt_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error loading download handler prompt: {e}")
            # Fallback minimal prompt
            return (
                "You are a helpful F1 Data Export Assistant. "
                "Guide users through exporting telemetry data, lap times, and analysis results "
                "in various formats (CSV, JSON, Excel). "
                "Explain what data will be included and how to use it."
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
                    "response": self._generate_no_data_response(requested_format),
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

            # For now, provide informative response using system prompt knowledge
            response_text = self._generate_download_response(requested_format, context, message)

            return {
                "response": response_text,
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "download",
                    "requested_format": requested_format,
                    "available_formats": self.supported_formats,
                    "data_available": True,

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

    def _generate_no_data_response(self, requested_format: str) -> str:
        """
        Generate response when no data is available.

        Args:
            requested_format: The format user requested

        Returns:
            str: Informative response
        """
        return (
            f"## Data Export Request - {requested_format.upper()}\n\n"
            "I don't have any data to export at the moment.\n\n"
            "**To export data, you need to:**\n"
            "1. Specify an F1 session (Year, Grand Prix, Session type)\n"
            "2. Select driver(s) to analyze\n"
            "3. Perform an analysis or comparison\n"
            "4. Then request the export\n\n"
            "**Example:**\n"
            f'> "Download Verstappen\'s telemetry from 2024 Monaco Qualifying as {requested_format.upper()}"\n\n'
            f"**Supported formats:** {', '.join(self.supported_formats).upper()}"
        )

    def _generate_download_response(
        self,
        format: str,
        context: Dict[str, Any],
        user_message: str
    ) -> str:
        """
        Generate a response about the download using system prompt guidance.

        Args:
            format: Requested format
            context: Context with data info
            user_message: Original user message

        Returns:
            str: Response message
        """
        # Build comprehensive response based on system prompt knowledge
        response = f"## Data Export Preparation - {format.upper()} Format\n\n"

        # Data Summary
        response += "**Data to be Exported:**\n"
        if "drivers" in context:
            response += f"- **Drivers**: {', '.join(context['drivers'])}\n"
        if "session" in context:
            response += f"- **Session**: {context['session']}\n"
        if "year" in context and "grand_prix" in context:
            response += f"- **Event**: {context['year']} {context['grand_prix']}\n"

        response += "\n"

        # Format-specific guidance
        response += self._get_format_guidance(format)

        # Export structure preview
        response += "\n**Data Structure:**\n\n"
        response += self._get_structure_preview(format, context)

        # Next steps
        response += "\n---\n\n"
        response += "**Status:**\n"
        response += (
            "The full download functionality is currently in development. "
            "When implemented, you will receive:\n"
            "- Direct download link\n"
            "- Estimated file size\n"
            "- Data validation confirmation\n"
            "- Usage instructions\n\n"
            "For now, this preview shows what will be included in your export."
        )

        return response

    def _get_format_guidance(self, format: str) -> str:
        """Get format-specific guidance."""
        guidance = {
            "csv": (
                "**CSV Format - Recommended for:**\n"
                "- Excel and spreadsheet applications\n"
                "- Data analysis in Python/R\n"
                "- Database imports\n"
                "- Universal compatibility\n"
            ),
            "json": (
                "**JSON Format - Recommended for:**\n"
                "- Web applications and APIs\n"
                "- Programming/scripting\n"
                "- Preserving complex data structures\n"
                "- Nested relationships\n"
            ),
            "excel": (
                "**Excel Format - Recommended for:**\n"
                "- Business reporting\n"
                "- Multiple related datasets (sheets)\n"
                "- Non-technical users\n"
                "- Professional presentations\n"
            ),
            "parquet": (
                "**Parquet Format - Recommended for:**\n"
                "- Big data analytics\n"
                "- Python data science (Pandas, Spark)\n"
                "- Large datasets with high compression\n"
                "- Fast columnar access\n"
            )
        }
        return guidance.get(format, guidance.get("xlsx", guidance["csv"]))

    def _get_structure_preview(self, format: str, context: Dict[str, Any]) -> str:
        """Generate a preview of the data structure."""
        if format == "csv":
            return (
                "```csv\n"
                "Time_ms, Speed_kph, Throttle_pct, Brake_pct, RPM, Gear, DRS\n"
                "0, 287.3, 100, 0, 11234, 7, 1\n"
                "20, 289.1, 100, 0, 11456, 7, 1\n"
                "...\n"
                "```"
            )
        elif format == "json":
            return (
                "```json\n"
                "{\n"
                '  "session": {\n'
                '    "year": 2024,\n'
                '    "grand_prix": "Monaco",\n'
                '    "type": "Qualifying"\n'
                "  },\n"
                '  "telemetry": [\n'
                "    {...},\n"
                "    {...}\n"
                "  ]\n"
                "}\n"
                "```"
            )
        else:
            return "Multiple sheets with formatted data, formulas, and charts."
