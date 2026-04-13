"""
Chat Message Component

Renders individual chat messages with proper styling for user and assistant messages.
Supports both text and image messages.
"""

import streamlit as st
import base64
from typing import Any


def render_chat_message(role: str, msg_type: str, content: Any):
    """
    Render a single chat message.

    Args:
        role: 'user' or 'assistant'
        msg_type: 'text' or 'image'
        content: Message content (str for text, bytes/base64 for image)
    """
    if msg_type == "text":
        if role == "user":
            st.markdown(
                f'<div class="chat-message user-message">'
                f'<div class="message-avatar" style="background:#a78bfa;">You</div>'
                f'<div class="message-content">{content}</div>'
                f'</div>',
                unsafe_allow_html=True
            )
        else:
            st.markdown(
                f'<div class="chat-message assistant-message">'
                f'<div class="message-avatar" style="background:linear-gradient(135deg,#6366f1,#a78bfa);">F1</div>'
                f'<div class="message-content">{content}</div>'
                f'</div>',
                unsafe_allow_html=True
            )
    elif msg_type == "tool_result":
        # Structured tool result — render rich card/metrics inside assistant bubble
        from components.chatbot.tool_result_renderer import render_tool_result

        tool_data = content if isinstance(content, dict) else _safe_json_parse(content)
        if tool_data:
            render_tool_result(tool_data)
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


def _safe_json_parse(content: Any) -> dict | None:
    """Try to parse content as JSON, return None on failure."""
    if isinstance(content, dict):
        return content
    try:
        import json
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
