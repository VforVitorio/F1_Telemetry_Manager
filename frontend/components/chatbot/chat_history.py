"""
Chat History Component

Renders the full chat history with all messages and custom CSS styling.
Displays empty state when no messages exist.
"""

import streamlit as st
from utils.chat_state import get_chat_history
from components.chatbot.chat_message import render_chat_message


def render_chat_history():
    """
    Render the full chat history.

    Applies custom CSS for ChatGPT-style message bubbles and displays all messages.
    Shows a welcome message when chat is empty.
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
