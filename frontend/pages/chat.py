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
import base64
from typing import Optional, Tuple

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

# TODO: Import when components are created
# from components.chatbot.chat_sidebar import render_chat_sidebar
# from components.chatbot.chat_history import render_chat_history
# from components.chatbot.chat_input import render_chat_input
# from components.chatbot.chat_message import render_chat_message

# TODO: Import when service is created
# from services.chat_service import stream_message, get_available_models, check_lm_studio_health

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


def render_chat_sidebar():
    """
    Render the chat sidebar with chat management (NO model parameters).

    TODO: Move to components/chatbot/chat_sidebar.py
    """
    st.markdown("### 💬 Strategy Chats")

    # New chat button
    if st.button("➕ New chat", key="new_chat_btn", use_container_width=True):
        create_new_chat()
        st.rerun()

    # Display saved chats
    chat_names = get_saved_chat_names()
    if chat_names:
        st.markdown("#### Chat history")
        for chat_name in chat_names:
            # Only show button for chats that aren't the current one
            if chat_name != st.session_state.get("current_chat_name", None):
                if st.button(chat_name, key=f"load_{chat_name}", use_container_width=True):
                    load_chat(chat_name)
                    st.rerun()
            else:
                # Highlight the current chat
                st.markdown(
                    f'<div style="background-color: #23234a; padding: 10px; border-radius: 8px; '
                    f'border: 1px solid #a78bfa; margin: 6px 0;">'
                    f'<b>➜ {chat_name}</b></div>',
                    unsafe_allow_html=True
                )

    st.markdown("")  # Spacing

    # Delete button
    if st.button("🗑️ Delete current chat", key="delete_chat_btn", use_container_width=True):
        delete_current_chat()
        st.rerun()


def render_chat_input() -> Tuple[str, Optional[bytes], bool]:
    """
    Render the chat input area with integrated drag-and-drop and send button.
    ChatGPT-style input with file upload support directly in the message box.

    TODO: Move to components/chatbot/chat_input.py

    Returns:
        (text, image_bytes, send_clicked)
    """
    # Container for input area
    input_col, button_col = st.columns([0.90, 0.10])

    with input_col:
        # Text input area
        user_text = st.text_area(
            label="message_input",
            value="",
            key=f"user_text_area_{st.session_state.chat_input_key}",
            height=10,
            placeholder="Ask me anything about F1...",
            label_visibility="collapsed"
        )

        # File uploader
        user_image = st.file_uploader(
            label="📎 Attach image",
            type=["png", "jpg", "jpeg"],
            key=f"user_image_uploader_{st.session_state.chat_input_key}",
            help="Upload or drag & drop a chart or image for analysis"
        )

    with button_col:
        # Send button with airplane emoji - same height as textarea
        send_btn = st.button(
            "✈️ Send",
            key="send_btn",
            type="primary",
            use_container_width=True,
            help="Send message"
        )

    # Read image if uploaded
    image_bytes = None
    if user_image is not None:
        image_bytes = user_image.read()

    return user_text, image_bytes, send_btn


def render_chat_message(role: str, msg_type: str, content: any):
    """
    Render a single chat message.

    TODO: Move to components/chatbot/chat_message.py

    Args:
        role: 'user' or 'assistant'
        msg_type: 'text' or 'image'
        content: Message content
    """
    if msg_type == "text":
        if role == "user":
            st.markdown(
                f'<div class="chat-message user-message">'
                f'<span class="message-icon">🏎️</span>'
                f'<div class="message-content"><b>You:</b> {content}</div>'
                f'</div>',
                unsafe_allow_html=True
            )
        else:
            st.markdown(
                f'<div class="chat-message assistant-message">'
                f'<span class="message-icon">🤖</span>'
                f'<div class="message-content"><b>Assistant:</b> {content}</div>'
                f'</div>',
                unsafe_allow_html=True
            )
    elif msg_type == "image":
        if role == "user":
            st.markdown(
                '<div class="chat-message user-message">'
                '<span class="message-icon">🏎️</span>'
                '<div class="message-content"><b>Image sent:</b></div>'
                '</div>',
                unsafe_allow_html=True
            )
        if isinstance(content, bytes):
            st.image(content, width=400)
        elif isinstance(content, str):
            # Assume it's a base64 string
            try:
                img_bytes = base64.b64decode(content)
                st.image(img_bytes, width=400)
            except Exception:
                st.error("Could not display image")


def render_chat_history():
    """
    Render the full chat history.

    TODO: Move to components/chatbot/chat_history.py
    """
    # Custom CSS for chat messages (ChatGPT style) and sidebar
    st.markdown("""
        <style>
        /* Sidebar styling - elegant background matching app theme */
        [data-testid="stSidebar"] {
            background-color: #1e1b4b !important;
            border-right: 1px solid #2d2d3a;
        }

        [data-testid="stSidebar"] > div:first-child {
            background-color: #1e1b4b !important;
        }

        /* Sidebar content styling */
        [data-testid="stSidebar"] .element-container {
            color: #d1d5db;
        }

        [data-testid="stSidebar"] h3 {
            color: #a78bfa !important;
        }

        [data-testid="stSidebar"] h4 {
            color: #9ca3af !important;
        }

        /* Chat messages */
        .chat-message {
            display: flex;
            align-items: flex-start;
            padding: 16px;
            margin-bottom: 16px;
            border-radius: 12px;
            animation: fadeIn 0.3s ease-in;
            gap: 12px;
        }

        .message-icon {
            font-size: 1.5em;
            flex-shrink: 0;
        }

        .message-content {
            flex: 1;
            word-wrap: break-word;
            line-height: 1.6;
        }

        .user-message {
            background-color: #23234a;
            border-left: 3px solid #a78bfa;
        }

        .assistant-message {
            background-color: #393e46;
            border-left: 3px solid #3b82f6;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Streamlit file uploader styling */
        [data-testid="stFileUploader"] {
            border: 1px dashed #a78bfa;
            border-radius: 8px;
            padding: 8px;
            background-color: #1e1b4b;
            margin-top: 8px;
        }

        [data-testid="stFileUploader"] > div {
            font-size: 0.85rem;
            color: #9ca3af;
        }

        [data-testid="stFileUploader"] label {
            color: #9ca3af !important;
            font-size: 0.85rem !important;
        }

        /* Text area styling */
        textarea {
            background-color: #1e1b4b !important;
            border: 1px solid #2d2d3a !important;
            border-radius: 12px !important;
            color: #ffffff !important;
            font-size: 1rem !important;
            height: 44px !important;
            min-height: 44px !important;
            max-height: 44px !important;
            resize: none !important;
            padding: 6px 12px !important;
            line-height: 1.2 !important;
        }

        textarea:focus {
            border-color: #a78bfa !important;
            box-shadow: 0 0 0 1px #a78bfa !important;
        }

        /* Hide default labels */
        .stTextArea label {
            display: none;
        }

        /* Send button styling - match textarea height */
        button[kind="primary"] {
            height: 44px !important;
            min-height: 44px !important;
            padding: 0 !important;
            font-size: 0.9rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        </style>
    """, unsafe_allow_html=True)

    # Display all messages
    messages = get_chat_history()

    if not messages:
        # Empty state
        st.markdown(
            '<div style="text-align: center; padding: 40px; color: #9ca3af;">'
            '<h3 style="color: #a78bfa;">👋 Welcome to F1 Strategy Assistant!</h3>'
            '<p>Ask me anything about Formula 1, telemetry data, or racing strategy.</p>'
            '</div>',
            unsafe_allow_html=True
        )
    else:
        for msg in messages:
            render_chat_message(msg["role"], msg["type"], msg["content"])


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

    TODO: Implement streaming response from backend

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

    # TODO: Implement streaming response
    # For now, show placeholder response
    st.session_state.chat_streaming = True

    # Placeholder response
    placeholder_response = (
        "This is a placeholder response. "
        "The actual LLM integration will be implemented when the backend is ready. "
        f"You asked: '{text}' with model '{DEFAULT_MODEL}' at temperature {DEFAULT_TEMPERATURE}."
    )

    # Add assistant response
    add_message("assistant", "text", placeholder_response)

    st.session_state.chat_streaming = False

    # Increment input key to clear the input field
    st.session_state.chat_input_key += 1

    # Save current chat
    save_current_chat()


def check_lm_studio_connection():
    """
    Check if LM Studio is accessible.

    TODO: Implement when chat_service is created

    Returns:
        bool: True if connected, False otherwise
    """
    # TODO: Replace with actual health check
    # return check_lm_studio_health()

    # Placeholder - assume connected
    return True


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
    # TODO: Uncomment when service is implemented
    # if not check_lm_studio_connection():
    #     st.error("⚠️ Cannot connect to LM Studio. Please ensure:")
    #     st.markdown("""
    #     1. LM Studio is running
    #     2. Local server is started (http://localhost:1234)
    #     3. A vision-capable model is loaded
    #     """)
    #     st.stop()

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
