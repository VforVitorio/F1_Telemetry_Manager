"""
Query Validators

Validation functions for query requests and responses.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Custom exception for validation errors."""
    pass


def validate_query_request(request_data: Dict[str, Any]) -> bool:
    """
    Validate a query request payload.

    Args:
        request_data: The request data to validate

    Returns:
        bool: True if valid

    Raises:
        ValidationError: If validation fails
    """
    # Check required fields
    if "text" not in request_data:
        raise ValidationError("Missing required field: 'text'")

    text = request_data["text"]
    if not isinstance(text, str):
        raise ValidationError("Field 'text' must be a string")

    if not text.strip():
        raise ValidationError("Field 'text' cannot be empty")

    # Validate optional fields
    if "image" in request_data and request_data["image"] is not None:
        image = request_data["image"]
        if not isinstance(image, str):
            raise ValidationError("Field 'image' must be a string (base64)")

        # Basic check for base64 format
        if not image.startswith("data:image/"):
            raise ValidationError("Field 'image' must be in data URI format")

    # Validate chat_history if present
    if "chat_history" in request_data and request_data["chat_history"] is not None:
        chat_history = request_data["chat_history"]
        if not isinstance(chat_history, list):
            raise ValidationError("Field 'chat_history' must be a list")

        for idx, message in enumerate(chat_history):
            if not isinstance(message, dict):
                raise ValidationError(f"Message at index {idx} must be a dictionary")
            if "role" not in message or "content" not in message:
                raise ValidationError(f"Message at index {idx} missing 'role' or 'content'")

    # Validate context if present
    if "context" in request_data and request_data["context"] is not None:
        context = request_data["context"]
        if not isinstance(context, dict):
            raise ValidationError("Field 'context' must be a dictionary")

    # Validate temperature if present
    if "temperature" in request_data:
        temperature = request_data["temperature"]
        if not isinstance(temperature, (int, float)):
            raise ValidationError("Field 'temperature' must be a number")
        if not 0.0 <= temperature <= 2.0:
            raise ValidationError("Field 'temperature' must be between 0.0 and 2.0")

    # Validate max_tokens if present
    if "max_tokens" in request_data:
        max_tokens = request_data["max_tokens"]
        if not isinstance(max_tokens, int):
            raise ValidationError("Field 'max_tokens' must be an integer")
        if max_tokens <= 0:
            raise ValidationError("Field 'max_tokens' must be positive")

    logger.debug("Query request validation passed")
    return True


def validate_image_size(image_data: str, max_size_mb: float = 5.0) -> bool:
    """
    Validate that an image is within size limits.

    Args:
        image_data: Base64 encoded image data
        max_size_mb: Maximum allowed size in megabytes

    Returns:
        bool: True if valid

    Raises:
        ValidationError: If image is too large
    """
    # Remove data URI prefix to get actual base64 data
    if "," in image_data:
        base64_data = image_data.split(",", 1)[1]
    else:
        base64_data = image_data

    # Calculate size (base64 is ~33% larger than original)
    size_bytes = len(base64_data) * 3 / 4
    size_mb = size_bytes / (1024 * 1024)

    if size_mb > max_size_mb:
        raise ValidationError(
            f"Image size ({size_mb:.2f}MB) exceeds maximum allowed size ({max_size_mb}MB)"
        )

    logger.debug(f"Image size validation passed: {size_mb:.2f}MB")
    return True
