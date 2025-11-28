"""
Chat Navigation Utilities

This module handles cross-page navigation to the chat,
allowing users to send charts and context from other pages.
"""

import streamlit as st
import plotly.graph_objects as go
import base64
from typing import Optional, Dict, Any, List
from datetime import datetime


def open_chat_with_image(
    image: str,
    prompt: str,
    chart_type: str,
    context: Optional[Dict[str, Any]] = None,
    auto_send: bool = True,
    new_chat: bool = False
) -> None:
    """
    Navigate to the chat page with a predefined image and prompt.

    Args:
        image: Base64 encoded image string
        prompt: Formatted prompt text
        chart_type: Type of chart ('speed_graph', 'comparison', 'delta', etc.)
        context: F1 context dictionary (year, gp, session, drivers)
        auto_send: If True, automatically send the message on arrival
        new_chat: If True, create a new chat; if False, append to current
    """
    # Store the pending message in session state
    st.session_state['chat_pending_message'] = {
        'image': image,
        'prompt': prompt,
        'context': context or {},
        'chart_type': chart_type,
        'auto_send': auto_send,
        'new_chat': new_chat,
        'timestamp': datetime.now().isoformat()
    }

    # Navigate to chat page
    st.session_state['current_page'] = 'chat'
    st.rerun()


def navigate_to_chat_with_context(
    context: Dict[str, Any],
    initial_message: Optional[str] = None
) -> None:
    """
    Navigate to chat with F1 context but without an image.

    Args:
        context: F1 context dictionary
        initial_message: Optional initial message to send
    """
    st.session_state['chat_context'] = context

    if initial_message:
        st.session_state['chat_pending_message'] = {
            'text': initial_message,
            'context': context,
            'auto_send': True,
            'timestamp': datetime.now().isoformat()
        }

    st.session_state['current_page'] = 'chat'
    st.rerun()


def plotly_fig_to_base64(
    fig: go.Figure,
    format: str = "jpg",
    width: int = 768,
    height: int = 480,
    scale: float = 1.0
) -> str:
    """
    Convert a Plotly figure to base64 encoded image with data URI format.

    Optimized for Qwen3-VL-4B-Instruct:
    - 768×480 (multiples of 32, required by Qwen3-VL)
    - Aspect ratio 1.6:1 (ideal for horizontal F1 telemetry charts)
    - Within optimal detection range (480-2560px)
    - Minimizes hallucinations while maintaining legibility
    - Source: https://github.com/QwenLM/Qwen3-VL

    Args:
        fig: Plotly figure object
        format: Image format ('jpg' for smaller size, 'png' for quality)
        width: Image width in pixels (default: 768, multiple of 32)
        height: Image height in pixels (default: 480, multiple of 32)
        scale: Scale factor for higher resolution (1.0 = standard, 2.0 = retina)

    Returns:
        Base64 encoded image string with data URI prefix (data:image/jpeg;base64,...)
    """
    try:
        # Convert plotly figure to image bytes with optimized dimensions
        # Using JPEG format and lower resolution to reduce token usage
        img_bytes = fig.to_image(
            format=format,
            width=width,
            height=height,
            scale=scale
        )

        # Encode to base64
        img_b64 = base64.b64encode(img_bytes).decode('utf-8')

        # Add data URI prefix for proper multimodal format
        mime_type = f"image/{format}"
        data_uri = f"data:{mime_type};base64,{img_b64}"

        # Log size for debugging
        size_kb = len(data_uri) / 1024
        st.info(
            f"📊 Chart image size: {size_kb:.0f}KB (~{int(size_kb * 750)} tokens estimated)")

        if size_kb > 200:  # Warn if image is still large
            st.warning(
                f"⚠️ Image is {size_kb:.0f}KB. If the model fails, try increasing Context Length in LM Studio to 32K+")

        return data_uri
    except Exception as e:
        st.error(f"Error converting chart to image: {e}")
        return ""


def build_context_from_session(
    chart_type: str,
    additional_info: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Build a context object from the current session state.

    Args:
        chart_type: Type of chart
        additional_info: Additional chart-specific information

    Returns:
        Context dictionary with F1 session information
    """
    # Extract context from session state (dashboard/comparison pages)
    context = {
        "chart_type": chart_type,
        "timestamp": datetime.now().isoformat(),
    }

    # Try to get year, gp, session, drivers from session state
    # These would be set by dashboard/comparison pages
    if 'selected_year' in st.session_state:
        context['year'] = st.session_state['selected_year']

    if 'selected_gp' in st.session_state:
        context['gp'] = st.session_state['selected_gp']

    if 'selected_session' in st.session_state:
        context['session'] = st.session_state['selected_session']

    if 'selected_drivers' in st.session_state:
        context['drivers'] = st.session_state['selected_drivers']

    # Add chart-specific info
    if additional_info:
        context.update(additional_info)

    return context


def format_prompt_with_context(
    template: str,
    context: Dict[str, Any]
) -> str:
    """
    Format a prompt template with context variables.

    Args:
        template: String template with {variable} placeholders
        context: Dictionary with values to inject

    Returns:
        Formatted prompt string
    """
    try:
        return template.format(**context)
    except KeyError as e:
        # Missing variable in context
        st.warning(f"Missing context variable: {e}")
        return template
    except Exception as e:
        st.error(f"Error formatting prompt: {e}")
        return template


def get_driver_info(driver_code: str) -> Dict[str, Any]:
    """
    Get full driver information from driver code.

    Args:
        driver_code: Driver code (e.g., "VER", "HAM")

    Returns:
        Dictionary with driver info (name, team, number)
    """
    # TODO: Import from backend.core.driver_colors or create local mapping
    # For now, return basic info

    # This would ideally call the backend or use a shared driver mapping
    # Placeholder implementation:
    driver_mapping = {
        "VER": {"name": "Max Verstappen", "team": "Red Bull Racing", "number": 1},
        "HAM": {"name": "Lewis Hamilton", "team": "Mercedes", "number": 44},
        "LEC": {"name": "Charles Leclerc", "team": "Ferrari", "number": 16},
        "SAI": {"name": "Carlos Sainz", "team": "Ferrari", "number": 55},
        "PER": {"name": "Sergio Perez", "team": "Red Bull Racing", "number": 11},
        "RUS": {"name": "George Russell", "team": "Mercedes", "number": 63},
        "NOR": {"name": "Lando Norris", "team": "McLaren", "number": 4},
        "PIA": {"name": "Oscar Piastri", "team": "McLaren", "number": 81},
        "ALO": {"name": "Fernando Alonso", "team": "Aston Martin", "number": 14},
        "STR": {"name": "Lance Stroll", "team": "Aston Martin", "number": 18},
    }

    return driver_mapping.get(
        driver_code,
        {"name": driver_code, "team": "Unknown", "number": 0}
    )


def clear_pending_message() -> None:
    """
    Clear the pending message from session state.
    Called after processing a pending message.
    """
    if 'chat_pending_message' in st.session_state:
        del st.session_state['chat_pending_message']
