"""
Voice Chat Component

Main voice chat interface component.
Handles voice chat flow: recording → transcription → LLM → TTS → playback.
"""

import streamlit as st
from typing import Optional, Dict, Any
import time

from services.voice_api import (
    voice_chat as api_voice_chat,
    decode_audio_base64,
    check_voice_health
)
from utils.audio_utils import (
    validate_audio_file,
    format_duration
)
from components.voice.voice_input import render_voice_input, render_voice_status
from components.streamlit_audio_viz import audio_orb


def initialize_voice_state():
    """Initialize voice chat session state."""
    if 'voice_history' not in st.session_state:
        st.session_state.voice_history = []

    if 'voice_processing' not in st.session_state:
        st.session_state.voice_processing = False

    if 'voice_status' not in st.session_state:
        st.session_state.voice_status = "ready"

    if 'is_recording' not in st.session_state:
        st.session_state.is_recording = False

    if 'current_audio' not in st.session_state:
        st.session_state.current_audio = None


def add_voice_exchange(
    user_audio: bytes,
    transcript: str,
    response_text: str,
    response_audio: bytes,
    processing_time: float
):
    """
    Add a voice exchange to history.

    Args:
        user_audio: User's audio bytes
        transcript: Transcribed user text
        response_text: AI response text
        response_audio: AI response audio bytes
        processing_time: Processing time in seconds
    """
    exchange = {
        "timestamp": time.time(),
        "user_audio": user_audio,
        "transcript": transcript,
        "response_text": response_text,
        "response_audio": response_audio,
        "processing_time": processing_time
    }

    st.session_state.voice_history.append(exchange)


def render_voice_exchange(exchange: Dict[str, Any], index: int):
    """
    Render a single voice exchange in the chat.

    Args:
        exchange: Voice exchange dictionary
        index: Exchange index in history
    """
    # User section
    with st.container():
        st.markdown("### 👤 You")
        st.markdown(f"**Transcript:** {exchange['transcript']}")

        # User audio player (collapsed in expander)
        if exchange.get('user_audio'):
            with st.expander("🎤 Your recording"):
                st.audio(exchange['user_audio'], format="audio/wav")

    st.markdown("---")

    # Assistant section
    with st.container():
        st.markdown("### 🤖 Caronte")
        st.markdown(exchange['response_text'])

        # Assistant audio player
        if exchange.get('response_audio'):
            st.audio(exchange['response_audio'], format="audio/wav")

        # Processing time
        st.caption(f"⏱️ Processed in {exchange['processing_time']:.2f}s")

    st.markdown("---")


def render_voice_history():
    """Render the complete voice chat history."""
    if not st.session_state.voice_history:
        st.info("💬 No voice messages yet. Record your first question!")
        return

    st.markdown("## 🎙️ Voice Chat History")

    # Render exchanges in order
    for idx, exchange in enumerate(st.session_state.voice_history):
        render_voice_exchange(exchange, idx)


def handle_voice_message(audio_bytes: bytes, filename: str = "recording.wav"):
    """
    Handle a voice message: send to backend and process response.

    Args:
        audio_bytes: Recorded audio bytes
        filename: Audio filename
    """
    # Validate audio
    is_valid, error_msg = validate_audio_file(audio_bytes, filename)
    if not is_valid:
        st.error(f"Invalid audio: {error_msg}")
        return

    # Set processing state
    st.session_state.voice_processing = True
    st.session_state.voice_status = "transcribing"

    try:
        # Call voice chat API
        result = api_voice_chat(audio_bytes, filename)

        if not result:
            st.error("Voice chat failed. Please try again.")
            return

        # Decode response audio
        response_audio = decode_audio_base64(result['audio_base64'])

        # Add to history
        add_voice_exchange(
            user_audio=audio_bytes,
            transcript=result['transcript'],
            response_text=result['response_text'],
            response_audio=response_audio,
            processing_time=result['processing_time']
        )

        st.session_state.voice_status = "ready"
        st.success("✅ Voice message processed!")

    except Exception as e:
        st.session_state.voice_status = "error"
        st.error(f"Error processing voice message: {e}")

    finally:
        st.session_state.voice_processing = False


def check_voice_services():
    """
    Check if voice services are available.

    Returns:
        bool: True if services are ready, False otherwise
    """
    health = check_voice_health()

    if health.get('status') != 'healthy':
        return False

    return health.get('stt_ready', False) and health.get('tts_ready', False)


def render_voice_chat():
    """
    Main voice chat rendering function.
    Orchestrates voice input, processing, and history display.
    """
    # Initialize state
    initialize_voice_state()

    # Check voice services
    if not check_voice_services():
        st.error("⚠️ Voice services are not available. Please ensure:")
        st.markdown("""
        1. Backend server is running (http://localhost:8000)
        2. Voice services are initialized
        3. Whisper model is loaded
        4. TTS engine is ready
        """)

        # Show health status
        health = check_voice_health()
        st.json(health)
        return

    # Header
    st.markdown(
        "<h2 style='text-align: center;'>🎤 Voice Chat Mode</h2>",
        unsafe_allow_html=True
    )
    st.markdown("---")

    # Audio Orb Visualization
    with st.container():
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            # Determine orb state
            is_recording = st.session_state.get('is_recording', False)
            is_processing = st.session_state.get('voice_processing', False)

            # Show orb
            audio_orb(
                audio_blob=st.session_state.get('current_audio'),
                is_recording=is_recording,
                is_processing=is_processing,
                theme="dark",  # Force dark theme to match UI
                key="voice_orb"
            )

    # Voice input section
    with st.container():
        audio_bytes = render_voice_input()

        if audio_bytes:
            st.session_state.current_audio = audio_bytes
            st.session_state.is_recording = False
            st.session_state.last_processed_audio = audio_bytes
            handle_voice_message(audio_bytes)
            st.rerun()

    # Status indicator
    if st.session_state.voice_processing:
        render_voice_status(st.session_state.voice_status)

    # Chat history
    st.markdown("<div style='margin-top: 30px;'></div>", unsafe_allow_html=True)
    render_voice_history()

    # Clear history button
    if st.session_state.voice_history:
        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            if st.button("🗑️ Clear Voice History", use_container_width=True):
                st.session_state.voice_history = []
                st.rerun()
