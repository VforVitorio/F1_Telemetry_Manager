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

        .message-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.7rem;
            color: white;
            flex-shrink: 0;
            margin-top: 2px;
        }

        .message-content {
            flex: 1;
            word-wrap: break-word;
            line-height: 1.6;
        }

        .user-message {
            background-color: #23234a;
            border-left: 2px solid #a78bfa;
            border-radius: 12px;
        }

        .assistant-message {
            background-color: #1e2030;
            border-left: 2px solid #3b82f6;
            border-radius: 12px;
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

        /* st.chat_input — fixed bottom bar: force app gradient background */
        [data-testid="stBottom"],
        .stBottom {
            background: linear-gradient(135deg, #121127 0%, #1e1b4b 100%) !important;
        }
        [data-testid="stBottomBlockContainer"],
        .stBottomBlockContainer {
            background: linear-gradient(135deg, #121127 0%, #1e1b4b 100%) !important;
        }
        [data-testid="stChatInput"],
        .stChatInput {
            background-color: transparent !important;
            border-top: 1px solid rgba(167, 139, 250, 0.2) !important;
        }
        [data-testid="stChatInput"] textarea {
            background-color: #1e1b4b !important;
            border: 1px solid #2d2d3a !important;
            border-radius: 12px !important;
            color: #ffffff !important;
            height: auto !important;
            min-height: 44px !important;
            max-height: 120px !important;
        }
        [data-testid="stChatInput"] textarea:focus {
            border-color: #a78bfa !important;
            box-shadow: 0 0 0 1px #a78bfa !important;
        }
        [data-testid="stChatInput"] button {
            background-color: #a78bfa !important;
            color: white !important;
        }

        /* File uploader — compact, inline with chat area */
        [data-testid="stFileUploader"] {
            border: 1px dashed #2d2d3a !important;
            background-color: transparent !important;
            margin-bottom: 8px !important;
        }
        </style>
    """, unsafe_allow_html=True)

    # Display all messages
    messages = get_chat_history()

    if not messages:
        # Welcome state with interactive prompt cards
        st.markdown(
            '<div style="text-align: center; padding: 24px 0 8px; color: #9ca3af;">'
            '<h3 style="color: #a78bfa; margin-bottom: 4px;">F1 Strategy Assistant</h3>'
            '<p style="font-size: 0.9rem;">I have direct access to ML strategy tools. '
            'Mention a <b>driver</b>, <b>GP</b>, and <b>lap</b> to trigger an analysis.</p>'
            '</div>',
            unsafe_allow_html=True,
        )

        # Example prompt cards
        _render_example_prompts()
    else:
        for msg in messages:
            render_chat_message(msg["role"], msg["type"], msg["content"])


_EXAMPLE_PROMPTS = [
    (":material/tire_repair:", "Tyre status", "Tyre status for VER at lap 30 in Bahrain"),
    (":material/speed:", "Pace prediction", "Predict pace for LEC lap 25 Monaco"),
    (":material/gavel:", "FIA regulation", "What does article 48.12 say about safety car?"),
    (":material/strategy:", "Full strategy", "Full strategy for NOR lap 40 Australia risk 0.7"),
]


def _render_example_prompts() -> None:
    """Render clickable example prompt cards in 2x2 grid."""
    c1, c2 = st.columns(2)
    for i, (icon, label, prompt) in enumerate(_EXAMPLE_PROMPTS):
        col = c1 if i % 2 == 0 else c2
        with col:
            if st.button(
                f"{icon} {label}",
                key=f"example_prompt_{i}",
                use_container_width=True,
                help=prompt,
            ):
                st.session_state["chat_pending_text"] = prompt
                st.rerun()
