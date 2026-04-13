"""
Chat Input Component

Renders st.chat_input (Enter to send) plus an optional image uploader
hidden behind an expander to keep the layout clean.
"""

import streamlit as st
from typing import Optional, Tuple


def render_chat_input() -> Tuple[str, Optional[bytes], bool]:
    """Render the chat input area.

    Returns:
        (text, image_bytes, send_clicked)
    """
    # Image uploader — collapsed by default so it doesn't break the layout
    image_bytes = None
    with st.expander(":material/attach_file: Attach image", expanded=False):
        user_image = st.file_uploader(
            label="Upload",
            type=["png", "jpg", "jpeg"],
            key=f"user_image_uploader_{st.session_state.chat_input_key}",
            label_visibility="collapsed",
        )
        if user_image is not None:
            image_bytes = user_image.read()

    # st.chat_input — fixed at bottom, Enter to send
    user_text = st.chat_input(
        placeholder="Ask me anything about F1...",
        key=f"user_chat_input_{st.session_state.chat_input_key}",
    )

    send_clicked = user_text is not None and user_text.strip() != ""
    return user_text or "", image_bytes, send_clicked
