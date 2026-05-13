"""
Chat Message Component

Renders individual chat messages with proper styling for user and assistant messages.
Supports both text and image messages.
"""

import streamlit as st
import base64
import html as _html
from typing import Any

try:
    import markdown as _md  # python-markdown — converts **bold**, lists, code, etc.
    _MARKDOWN_AVAILABLE = True
except ImportError:  # graceful fallback if the dep isn't installed yet
    _MARKDOWN_AVAILABLE = False


def _content_to_html(content: str) -> str:
    """Convert message content to safe HTML.

    Assistant replies often arrive in Markdown (`**bold**`, lists, code).
    Without conversion the raw asterisks leak into the bubble.  We render
    Markdown when the python-markdown dep is available, and fall back to
    HTML-escaped text + line breaks otherwise so the user still gets
    something readable.
    """
    text = str(content)
    if _MARKDOWN_AVAILABLE:
        return _md.markdown(
            text,
            extensions=["fenced_code", "tables", "nl2br", "sane_lists"],
        )
    escaped = _html.escape(text)
    return escaped.replace("\n", "<br>")


def render_chat_message(role: str, msg_type: str, content: Any):
    """
    Render a single chat message.

    Args:
        role: 'user' or 'assistant'
        msg_type: 'text' or 'image'
        content: Message content (str for text, bytes/base64 for image)
    """
    if msg_type == "text":
        body_html = _content_to_html(content)
        if role == "user":
            bubble_class = "chat-message user-message"
            avatar_style = "background:#a78bfa;"
            avatar_label = "You"
        else:
            bubble_class = "chat-message assistant-message"
            avatar_style = "background:linear-gradient(135deg,#6366f1,#a78bfa);"
            avatar_label = "F1"
        st.markdown(
            f'<div class="{bubble_class}">'
            f'<div class="message-avatar" style="{avatar_style}">{avatar_label}</div>'
            f'<div class="message-content">{body_html}</div>'
            f'</div>',
            unsafe_allow_html=True,
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
