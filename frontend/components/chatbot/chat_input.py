"""
Chat Input Component

Renders the chat input area with text input, image upload, and send button.
ChatGPT-style compact input with file upload support.
"""

import streamlit as st
from typing import Optional, Tuple


def render_chat_input() -> Tuple[str, Optional[bytes], bool]:
    """
    Render the chat input area with integrated drag-and-drop and send button.
    ChatGPT-style input with file upload support directly in the message box.

    Returns:
        Tuple containing:
        - text: User input text
        - image_bytes: Uploaded image as bytes (None if no image)
        - send_clicked: Boolean indicating if send button was clicked
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
