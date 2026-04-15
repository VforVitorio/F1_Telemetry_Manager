"""
Voice Input Component

Renders the voice input interface with microphone recording.
Uses Streamlit's native ``st.audio_input`` widget (added in 1.37), which
sidesteps the sandboxed-iframe background issues that the previous
``audio_recorder_streamlit`` third-party component carried.
"""

import streamlit as st
from typing import Optional


def render_voice_input() -> Optional[bytes]:
    """
    Render voice input component with microphone recording.

    Auto-sends the first time a new recording is produced. Uses
    ``st.audio_input`` for a clean, theme-consistent widget without the
    black-iframe artefact of ``audio_recorder_streamlit``. The user records
    via the built-in button, can re-listen and delete before submitting,
    and this function returns the raw bytes once a fresh recording is
    detected (tracked against ``last_processed_audio`` in session state to
    avoid re-sending on every rerun).

    Returns:
        audio_bytes: Recorded audio as bytes (None if no new recording).
    """
    is_recording = st.session_state.get("is_recording", False)

    # Centre the widget in a narrow-ish column so the native widget does not
    # stretch edge-to-edge \u2014 st.audio_input respects this layout and stays
    # compact without any CSS hack.
    col_l, col_c, col_r = st.columns([2, 3, 2])
    with col_c:
        audio_value = st.audio_input(
            "Record a voice message",
            label_visibility="collapsed",
            key="voice_recorder",
        )

    # Idle hint \u2014 sits below the widget so the recording button stays clear.
    if not is_recording:
        st.markdown(
            "<div style='text-align: center; color: #9ca3af; font-size: 12px; margin-top: 4px;'>"
            "Click the mic to record, then hit the send button"
            "</div>",
            unsafe_allow_html=True,
        )

    if audio_value is None:
        return None

    # ``audio_value`` is an ``UploadedFile``-like object; ``.getvalue()``
    # returns the bytes. Compare against the last-processed payload so the
    # caller only receives a fresh recording once \u2014 Streamlit keeps the
    # widget value across reruns, so otherwise every rerun would re-submit.
    audio_bytes = audio_value.getvalue()
    if not audio_bytes:
        return None

    last_audio = st.session_state.get("last_processed_audio")
    if last_audio == audio_bytes:
        return None
    return audio_bytes


def render_voice_status(status: str):
    """
    Render voice processing status indicator.

    Args:
        status: Status message to display
    """
    status_messages = {
        "listening":    ("Listening for your message",        ":material/mic:"),
        "transcribing": ("Transcribing audio",                ":material/sync:"),
        "thinking":     ("Thinking...",                       ":material/psychology:"),
        "speaking":     ("Generating speech",                 ":material/volume_up:"),
        "error":        ("An error occurred",                 ":material/error:"),
        "ready":        ("Ready",                             ":material/check_circle:"),
    }

    message, icon = status_messages.get(status, (status, None))

    if status == "error":
        st.error(message, icon=icon)
    elif status in ("listening", "transcribing", "thinking", "speaking"):
        st.info(message, icon=icon)
    elif status == "ready":
        st.success(message, icon=icon)
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
        if st.button(":material/mic: Record", key="voice_record_btn", use_container_width=True):
            if on_record_start:
                on_record_start()

    with col2:
        if st.button(":material/stop: Stop", key="voice_stop_btn", use_container_width=True):
            if on_record_stop:
                on_record_stop()

    with col3:
        if st.button(":material/delete: Clear", key="voice_clear_btn", use_container_width=True):
            if on_clear:
                on_clear()
