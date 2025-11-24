"""
AI Chat Page

Interactive chat interface for F1 telemetry analysis using LLM.
Supports text and multimodal interactions, chat history management,
and context-aware responses.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

# Standard library imports
import streamlit as st
from typing import Optional

# Local imports
from utils.chat_state import (
    initialize_chat_state,
    add_message,
    get_chat_history,
    save_current_chat,
    create_new_chat,
    delete_current_chat,
    load_chat,
    get_saved_chat_names
)
from utils.chat_navigation import clear_pending_message

# Component imports
from components.chatbot.chat_sidebar import render_chat_sidebar
from components.chatbot.chat_history import render_chat_history
from components.chatbot.chat_input import render_chat_input
from components.chatbot.chat_message import render_chat_message

# Service imports
from services.chat_service import stream_message, get_available_models, check_lm_studio_health

# Default model configuration (hidden from user)
DEFAULT_MODEL = "llama3.2-vision"
DEFAULT_TEMPERATURE = 0.1  # Low temperature for high confidence in F1 domain


def render_header():
    """Display page header."""
    st.markdown(
        "<h1 style='text-align: center;'>🏎️ F1 STRATEGY ASSISTANT CHAT</h1>",
        unsafe_allow_html=True
    )
    st.markdown("---")


def handle_pending_message():
    """
    Check for and process pending messages from other pages.
    This happens when user clicks "Ask AI about this" from dashboard/comparison.
    """
    if 'chat_pending_message' not in st.session_state:
        return

    pending = st.session_state['chat_pending_message']

    # Create new chat if requested
    if pending.get('new_chat', False):
        create_new_chat(context=pending.get('context'))

    # Add messages to history
    if 'image' in pending:
        add_message("user", "image", pending['image'])

    if 'prompt' in pending:
        add_message("user", "text", pending['prompt'])
    elif 'text' in pending:
        add_message("user", "text", pending['text'])

    # Auto-send if requested
    if pending.get('auto_send', False):
        # TODO: Implement auto-send functionality
        # This should call handle_send_message with the pending content
        st.info("🤖 Processing your question about the chart...")

        # For now, just show a placeholder
        st.warning(
            "Auto-send functionality will be implemented when backend is ready")

    # Clear the pending message
    clear_pending_message()

    # Rerun to show the new messages
    st.rerun()


def handle_send_message(text: str, image: Optional[bytes]):
    """
    Handle sending a message to the LLM.

    Args:
        text: User message text
        image: Optional image bytes
    """
    # Validate input
    if not text.strip() and image is None:
        st.warning("⚠️ Please enter a message or upload an image.")
        return

    # Add user messages to history
    if text.strip():
        add_message("user", "text", text)
    if image is not None:
        add_message("user", "image", image)

    # Set streaming state
    st.session_state.chat_streaming = True

    try:
        # Get chat history for context
        history = get_chat_history()

        # Build context from session state if available
        context = {}
        if hasattr(st.session_state, 'chat_context'):
            context = st.session_state.chat_context

        # Get response from backend using send_message (non-streaming for simplicity)
        from services.chat_service import send_message as chat_send_message

        response = chat_send_message(
            text=text,
            image=image,
            chat_history=history,
            context=context,
            model=DEFAULT_MODEL,
            temperature=DEFAULT_TEMPERATURE
        )

        # Add assistant response
        add_message("assistant", "text", response)

    except Exception as e:
        st.error(f"Error communicating with LM Studio: {e}")
        add_message("assistant", "text", f"Error: {str(e)}")

    finally:
        st.session_state.chat_streaming = False

        # Increment input key to clear the input field
        st.session_state.chat_input_key += 1

        # Save current chat
        save_current_chat()


def check_lm_studio_connection():
    """
    Check if LM Studio is accessible.

    Returns:
        bool: True if connected, False otherwise
    """
    return check_lm_studio_health()


def render_chat_page():
    """
    Main chat page rendering function.
    Orchestrates all chat components and handles user interactions.
    """
    # Initialize chat state
    initialize_chat_state()

    # Check for pending messages from other pages
    handle_pending_message()

    # Check LM Studio connection
    if not check_lm_studio_connection():
        st.error("⚠️ Cannot connect to LM Studio. Please ensure:")
        st.markdown("""
        1. LM Studio is running
        2. Local server is started (http://localhost:1234)
        3. A model is loaded
        4. Backend server is running (http://localhost:8000)
        """)
        st.stop()

    # Render header
    render_header()

    # Sidebar with chat management (NO model parameters)
    with st.sidebar:
        render_chat_sidebar()

    # Main content area
    st.markdown("## Chat")

    # Chat history (scrollable area)
    render_chat_history()

    # Input area (fixed at bottom visually)
    st.markdown("<div style='margin-top: 20px;'></div>",
                unsafe_allow_html=True)
    text, image, send_clicked = render_chat_input()

    if send_clicked:
        handle_send_message(text, image)
        st.rerun()

    # Show streaming indicator if active
    if st.session_state.get('chat_streaming', False):
        st.info("🤖 Assistant is thinking...")


# Entry point
if __name__ == "__main__":
    render_chat_page()
