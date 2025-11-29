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
from utils.report_storage import save_report

# Component imports
from components.chatbot.chat_sidebar import render_chat_sidebar
from components.chatbot.chat_history import render_chat_history
from components.chatbot.chat_input import render_chat_input
from components.chatbot.chat_message import render_chat_message
from components.voice.voice_chat import render_voice_chat

# Service imports
from services.chat_service import stream_message, get_available_models, check_lm_studio_health, generate_report

# Default model configuration (hidden from user)
DEFAULT_MODEL = "llama3.2-vision"
DEFAULT_TEMPERATURE = 0.1  # Low temperature for high confidence in F1 domain


def initialize_chat_mode():
    """Initialize chat mode (text or voice)."""
    if 'chat_mode' not in st.session_state:
        st.session_state.chat_mode = "text"  # Default to text mode


def render_header():
    """Display page header with mode toggle."""
    st.markdown(
        "<h1 style='text-align: center;'>🏎️ F1 STRATEGY ASSISTANT CHAT</h1>",
        unsafe_allow_html=True
    )

    # Mode toggle with buttons (like login/register)
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        tab_cols = st.columns(2)
        with tab_cols[0]:
            if st.button("💬 Text Chat", use_container_width=True,
                         type="primary" if st.session_state.chat_mode == 'text' else "secondary"):
                st.session_state.chat_mode = 'text'
                st.rerun()
        with tab_cols[1]:
            if st.button("🎤 Voice Chat", use_container_width=True,
                         type="primary" if st.session_state.chat_mode == 'voice' else "secondary"):
                st.session_state.chat_mode = 'voice'
                st.rerun()

    st.markdown("---")


def handle_pending_message():
    """
    Check for and process pending messages from other pages.
    This happens when user clicks "Ask AI about this" from dashboard/comparison.

    Note: This function does NOT send messages synchronously during page load
    to avoid freezing the UI. Instead, it prepares the message and sets a flag
    for deferred sending after the UI renders.
    """
    if 'chat_pending_message' not in st.session_state:
        return

    pending = st.session_state['chat_pending_message']

    # Create new chat if requested
    if pending.get('new_chat', False):
        create_new_chat(context=pending.get('context'))

    # Prepare message text and image
    message_text = pending.get('prompt') or pending.get('text', '')
    image_base64 = pending.get('image')

    # If auto-send is requested, set a flag for deferred sending
    # This avoids blocking the page load with a synchronous LLM call
    if pending.get('auto_send', False):
        # Convert base64 image to bytes if present
        import base64
        image_bytes = None
        if image_base64:
            try:
                # Remove data URI prefix if present before decoding
                if image_base64.startswith('data:image'):
                    image_base64 = image_base64.split(',', 1)[1]
                image_bytes = base64.b64decode(image_base64)
            except Exception as e:
                st.error(f"Error decoding image: {e}")

        # Clear pending message before sending (to avoid loops)
        clear_pending_message()

        # Send the message automatically with processing indicator
        with st.spinner("🔄 Processing chart analysis request..."):
            handle_send_message(message_text, image_bytes)
        return  # Don't rerun here, handle_send_message will do it

    # If not auto-sending, just add to history for display
    if image_base64:
        add_message("user", "image", image_base64)

    if message_text:
        add_message("user", "text", message_text)

    # Clear the pending message
    clear_pending_message()

    # Rerun to show the new messages
    st.rerun()


def handle_send_message(text: str, image: Optional[str]):
    """
    Handle sending a message to the LLM.

    Args:
        text: User message text
        image: Optional image in base64 data URI format (string)
    """
    # Validate input
    if not text.strip() and image is None:
        st.warning("⚠️ Please enter a message or upload an image.")
        return

    # Store image to send (before adding to history)
    image_to_send = image

    # Add user messages to history
    if text.strip():
        add_message("user", "text", text)
    if image is not None:
        # Convert bytes to base64 for storage in history
        import base64
        if isinstance(image, bytes):
            image_b64 = base64.b64encode(image).decode('utf-8')
            add_message("user", "image", image_b64)
        else:
            add_message("user", "image", image)

    # Set streaming state
    st.session_state.chat_streaming = True

    try:
        # Get chat history for context (excluding current messages we just added)
        num_messages_added = (1 if text.strip() else 0) + (1 if image else 0)
        history = get_chat_history(
        )[:-num_messages_added] if num_messages_added > 0 else get_chat_history()

        # Build context from session state if available
        context = {}
        if hasattr(st.session_state, 'chat_context'):
            context = st.session_state.chat_context

        # If no image provided explicitly, look for the most recent user image in history
        # This allows the LLM to see previously uploaded images
        if image_to_send is None:
            for msg in reversed(history):
                if msg.get("role") == "user" and msg.get("type") == "image":
                    image_to_send = msg.get("content")
                    break

        # Get response from backend using send_message (non-streaming for simplicity)
        from services.chat_service import send_message as chat_send_message

        response = chat_send_message(
            text=text,
            image=image_to_send,  # Now passing base64 string
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


def render_report_button():
    """Render the report download button."""
    chat_history = get_chat_history()

    # Only show if there's chat history with at least 2 messages (user + assistant)
    if len(chat_history) >= 2:
        col1, col2, col3 = st.columns([2, 1, 2])
        with col2:
            if st.button("📄 Download Report", use_container_width=True, type="secondary"):
                with st.spinner("Generating report..."):
                    # Get context if available
                    context = st.session_state.get('chat_context', {})

                    # Generate report
                    report_content = generate_report(
                        chat_history=chat_history,
                        context=context
                    )

                    if report_content:
                        # Prepare filename
                        from datetime import datetime
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        filename = f"f1_chat_report_{timestamp}.md"

                        # Save report to storage for sidebar access
                        save_report(
                            content=report_content,
                            filename=filename,
                            context=context
                        )

                        # Show download button
                        st.download_button(
                            label="⬇️ Download Markdown Report",
                            data=report_content,
                            file_name=filename,
                            mime="text/markdown",
                            use_container_width=True,
                            key=f"download_{timestamp}"
                        )
                        st.success("✅ Report generated successfully!")


def render_chat_page():
    """
    Main chat page rendering function.
    Orchestrates all chat components and handles user interactions.
    """
    # Initialize chat mode
    initialize_chat_mode()

    # Initialize chat state
    initialize_chat_state()

    # Check for pending messages from other pages
    handle_pending_message()

    # Render header with mode toggle
    render_header()

    # Check current mode and render accordingly
    if st.session_state.chat_mode == "voice":
        # Voice Chat Mode
        render_voice_chat()
    else:
        # Text Chat Mode (original functionality)
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

        # Sidebar with chat management (NO model parameters)
        with st.sidebar:
            render_chat_sidebar()

        # Main content area
        st.markdown("## Chat")

        # Report download button (appears when there's chat history)
        render_report_button()

        # Chat history (scrollable area)
        render_chat_history()

        # Input area (fixed at bottom visually)
        st.markdown("<div style='margin-top: 20px;'></div>",
                    unsafe_allow_html=True)
        text, image, send_clicked = render_chat_input()

        if send_clicked:
            # Show processing indicator immediately
            with st.spinner("🔄 Processing your message..."):
                handle_send_message(text, image)
            st.rerun()

        # Show streaming indicator if active
        if st.session_state.get('chat_streaming', False):
            with st.spinner("🤖 Assistant is generating response..."):
                st.empty()  # Placeholder to keep spinner visible

        # Handle deferred auto-send (after UI is rendered)
        # This is triggered when user clicks "Ask AI" button from other pages
        if st.session_state.get('pending_auto_send'):
            auto_send_data = st.session_state.pending_auto_send
            del st.session_state.pending_auto_send  # Clear flag

            # Show info message
            st.info("🤖 Analyzing the chart with vision model...")

            # Send the message now that UI is rendered
            handle_send_message(
                text=auto_send_data.get('text', ''),
                image=auto_send_data.get('image')
            )
            st.rerun()


# Entry point
if __name__ == "__main__":
    render_chat_page()
