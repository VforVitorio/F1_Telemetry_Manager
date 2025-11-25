"""
Voice Input Component

Renders the voice input interface with microphone recording.
Allows users to record audio for voice chat.
"""

import streamlit as st
from typing import Optional
from audio_recorder_streamlit import audio_recorder


def render_voice_input() -> Optional[bytes]:
    """
    Render voice input component with microphone recording.
    Auto-sends when recording is complete.

    Returns:
        audio_bytes: Recorded audio as bytes (None if no recording)
    """
    st.markdown("### 🎤 Voice Input")

    # Instructions
    st.info("🎙️ Click the microphone to start recording. Click again to stop and send automatically.")

    # Audio recorder component
    audio_bytes = audio_recorder(
        text="Click to record",
        recording_color="#e74c3c",
        neutral_color="#3498db",
        icon_name="microphone",
        icon_size="2x",
        key="voice_recorder"
    )

    # Return audio if recorded (auto-send)
    if audio_bytes:
        # Check if this is new audio (not already processed)
        last_audio = st.session_state.get('last_processed_audio')
        if last_audio != audio_bytes:
            st.success(f"✅ Recorded {len(audio_bytes)} bytes - Processing...")
            return audio_bytes

    return None


def render_voice_status(status: str):
    """
    Render voice processing status indicator.

    Args:
        status: Status message to display
    """
    status_messages = {
        "listening": "🎤 Listening...",
        "transcribing": "🔄 Transcribing audio...",
        "thinking": "🤖 AI is thinking...",
        "speaking": "🔊 Generating speech...",
        "error": "❌ Error occurred",
        "ready": "✅ Ready"
    }

    message = status_messages.get(status, status)

    if status == "error":
        st.error(message)
    elif status in ["listening", "transcribing", "thinking", "speaking"]:
        st.info(message)
    elif status == "ready":
        st.success(message)
    else:
        st.write(message)


def render_voice_controls(
    on_record_start=None,
    on_record_stop=None,
    on_clear=None
):
    """
    Render voice chat control buttons.

    Args:
        on_record_start: Callback for record start
        on_record_stop: Callback for record stop
        on_clear: Callback for clear
    """
    col1, col2, col3 = st.columns([1, 1, 1])

    with col1:
        if st.button("🎤 Record", key="voice_record_btn", use_container_width=True):
            if on_record_start:
                on_record_start()

    with col2:
        if st.button("⏹️ Stop", key="voice_stop_btn", use_container_width=True):
            if on_record_stop:
                on_record_stop()

    with col3:
        if st.button("🗑️ Clear", key="voice_clear_btn", use_container_width=True):
            if on_clear:
                on_clear()
