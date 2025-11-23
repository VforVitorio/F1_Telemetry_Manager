"""
Chat Sidebar Component

Renders the chat sidebar with chat management functionality.
Allows users to create new chats, load existing chats, and delete the current chat.
"""

import streamlit as st
from utils.chat_state import (
    create_new_chat,
    delete_current_chat,
    load_chat,
    get_saved_chat_names
)


def render_chat_sidebar():
    """
    Render the chat sidebar with chat management (NO model parameters).

    Displays:
    - New chat button
    - List of saved chats with load buttons
    - Current chat highlighting
    - Delete current chat button
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
