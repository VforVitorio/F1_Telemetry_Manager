"""
Chat State Management

This module handles all chat state operations including:
- Initializing chat state
- Creating, loading, and deleting chats
- Managing chat history and messages
"""

import streamlit as st
import datetime
from typing import Optional, List, Dict, Any


def initialize_chat_state() -> None:
    """
    Initialize chat-related session state variables.
    Called at the start of the chat page render.
    """
    # Current chat message history
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    # System prompt (built from F1 context)
    if "chat_system_prompt" not in st.session_state:
        st.session_state.chat_system_prompt = ""

    # Saved chats (multiple conversations)
    if "chat_saved_chats" not in st.session_state:
        st.session_state.chat_saved_chats = {}

    # Current chat name (None if unsaved/new)
    if "current_chat_name" not in st.session_state:
        st.session_state.current_chat_name = None

    # F1 context for system prompt
    if "chat_f1_context" not in st.session_state:
        st.session_state.chat_f1_context = {}

    # UI state - input key for clearing input after send
    if "chat_input_key" not in st.session_state:
        st.session_state.chat_input_key = 0

    # Streaming state
    if "chat_streaming" not in st.session_state:
        st.session_state.chat_streaming = False


def create_new_chat(context: Optional[Dict[str, Any]] = None) -> None:
    """
    Create a new chat, saving the current one if it has content.

    Args:
        context: Optional F1 context for the new chat
    """
    # Save current chat if it has messages and no name yet
    if st.session_state.chat_history and st.session_state.current_chat_name is None:
        # Generate name from first user message
        user_msg = next(
            (msg["content"] for msg in st.session_state.chat_history
             if msg["role"] == "user" and msg["type"] == "text"),
            None
        )
        chat_name = generate_chat_name(context, user_message=user_msg)

        # Save to saved chats
        st.session_state.chat_saved_chats[chat_name] = list(
            st.session_state.chat_history
        )
        st.session_state.current_chat_name = chat_name

    # Create new empty chat
    st.session_state.chat_history = []
    st.session_state.chat_system_prompt = ""
    st.session_state.current_chat_name = None

    # Set context if provided
    if context:
        st.session_state.chat_f1_context = context


def delete_current_chat() -> None:
    """
    Delete the current chat.
    If it's a saved chat, remove it from saved chats.
    """
    if st.session_state.current_chat_name:
        # Remove from saved chats if it exists
        if st.session_state.current_chat_name in st.session_state.chat_saved_chats:
            del st.session_state.chat_saved_chats[st.session_state.current_chat_name]

    # Clear current chat
    st.session_state.chat_history = []
    st.session_state.chat_system_prompt = ""
    st.session_state.current_chat_name = None
    st.session_state.chat_f1_context = {}


def load_chat(chat_name: str) -> None:
    """
    Load a saved chat by name.

    Args:
        chat_name: Name of the chat to load
    """
    if chat_name not in st.session_state.chat_saved_chats:
        st.error(f"Chat '{chat_name}' not found")
        return

    # Save current chat if needed (and it's different from the one being loaded)
    current_chat_name = st.session_state.current_chat_name
    if current_chat_name != chat_name and st.session_state.chat_history:
        if current_chat_name is None:
            # Auto-save current unnamed chat
            new_name = generate_chat_name()
            st.session_state.chat_saved_chats[new_name] = list(
                st.session_state.chat_history
            )
        else:
            # Update existing chat
            st.session_state.chat_saved_chats[current_chat_name] = list(
                st.session_state.chat_history
            )

    # Load the selected chat
    st.session_state.chat_history = list(
        st.session_state.chat_saved_chats[chat_name]
    )
    st.session_state.current_chat_name = chat_name


def save_current_chat() -> None:
    """
    Save the current chat to saved chats.
    If chat already has a name, update it.
    If not, generate a name and save.
    """
    if not st.session_state.chat_history:
        return  # Nothing to save

    chat_name = st.session_state.current_chat_name

    if chat_name is None:
        # Generate name from first user message
        user_msg = next(
            (msg["content"] for msg in st.session_state.chat_history
             if msg["role"] == "user" and msg["type"] == "text"),
            None
        )
        chat_name = generate_chat_name(user_message=user_msg)
        st.session_state.current_chat_name = chat_name

    # Save/update the chat
    st.session_state.chat_saved_chats[chat_name] = list(
        st.session_state.chat_history
    )


def generate_chat_name(
    context: Optional[Dict[str, Any]] = None,
    user_message: Optional[str] = None
) -> str:
    """
    Generate a name for the chat based on context or user message.

    Args:
        context: F1 context dictionary
        user_message: First user message in the chat

    Returns:
        Generated chat name
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if user_message:
        # Use first 30 characters of user message
        title = user_message[:30]
        if len(user_message) > 30:
            title += "..."
        return title

    if context:
        # Generate name from context
        parts = []
        if "gp" in context:
            parts.append(context["gp"])
        if "session" in context:
            parts.append(context["session"])
        if "drivers" in context and isinstance(context["drivers"], list):
            parts.append(" vs ".join(context["drivers"][:2]))

        if parts:
            return " - ".join(parts)

        return f"Chat_{timestamp}"

    return f"Chat_{timestamp}"


def add_message(role: str, msg_type: str, content: Any) -> None:
    """
    Add a message to the current chat history.

    Args:
        role: 'user' or 'assistant'
        msg_type: 'text' or 'image'
        content: Message content (str for text, bytes for image)
    """
    message = {
        "role": role,
        "type": msg_type,
        "content": content,
        "timestamp": datetime.datetime.now().isoformat()
    }

    st.session_state.chat_history.append(message)

    # Auto-save if chat has a name
    if st.session_state.current_chat_name:
        st.session_state.chat_saved_chats[st.session_state.current_chat_name] = list(
            st.session_state.chat_history
        )


def get_chat_history() -> List[Dict[str, Any]]:
    """
    Get the current chat message history.

    Returns:
        List of message dictionaries
    """
    return st.session_state.get("chat_history", [])


def clear_chat_history() -> None:
    """
    Clear the current chat history without deleting the chat.
    """
    st.session_state.chat_history = []

    # Update saved chat if it has a name
    if st.session_state.current_chat_name:
        st.session_state.chat_saved_chats[st.session_state.current_chat_name] = []


def get_saved_chat_names() -> List[str]:
    """
    Get list of all saved chat names.

    Returns:
        List of chat names
    """
    return list(st.session_state.get("chat_saved_chats", {}).keys())


def update_chat_context(context: Dict[str, Any]) -> None:
    """
    Update the F1 context for the current chat.

    Args:
        context: F1 context dictionary
    """
    st.session_state.chat_f1_context = context
