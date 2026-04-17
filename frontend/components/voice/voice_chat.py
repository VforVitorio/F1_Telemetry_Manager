"""
Voice Chat Component

Main voice chat interface component.
Handles voice chat flow: recording \u2192 transcription \u2192 LLM \u2192 TTS \u2192 playback.
"""

import streamlit as st
from typing import Optional, Dict, Any
import time


# Azure Neural voices exposed to the user. The backend accepts any valid Azure
# voice ID via the /voice-chat ``voice`` form field; we surface a curated set
# that sounds natural for F1 strategy chatter and stays English-first.
VOICE_CATALOG: Dict[str, str] = {
    "en-US-AriaNeural":  "Aria \u2014 US female, conversational",
    "en-US-GuyNeural":   "Guy \u2014 US male, newscast",
    "en-GB-RyanNeural":  "Ryan \u2014 UK male, engineer tone",
    "en-GB-SoniaNeural": "Sonia \u2014 UK female, calm",
}
DEFAULT_VOICE_ID = "en-US-AriaNeural"

from services.voice_api import (
    voice_chat as api_voice_chat,
    decode_audio_base64,
    check_voice_health
)
from services.chat_service import generate_report
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

    if 'is_playing' not in st.session_state:
        st.session_state.is_playing = False

    if 'play_start_time' not in st.session_state:
        st.session_state.play_start_time = None

    if 'selected_voice' not in st.session_state:
        st.session_state.selected_voice = DEFAULT_VOICE_ID


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
    Render a single voice exchange in the chat with modern bubble design.

    Args:
        exchange: Voice exchange dictionary
        index: Exchange index in history
    """
    # User bubble (right side, light purple)
    st.markdown(f"""
        <div style='display: flex; justify-content: flex-end; margin-bottom: 10px;'>
            <div style='
                background: linear-gradient(135deg, #e8d5f2 0%, #d4b5e8 100%);
                border-radius: 18px 18px 4px 18px;
                padding: 12px 16px;
                max-width: 70%;
                box-shadow: 0 2px 8px rgba(142, 68, 173, 0.15);
            '>
                <div style='font-size: 11px; color: #6b4684; margin-bottom: 6px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;'>
                    YOU
                </div>
                <div style='color: #2d1b3d; line-height: 1.5;'>
                    {exchange['transcript']}
                </div>
            </div>
        </div>
    """, unsafe_allow_html=True)

    # User audio is intentionally not rendered: the transcript in the bubble
    # is the canonical record and showing a second full-width WAV player per
    # turn made the history feel macizo. If listeners ever need the raw audio
    # again, expose it behind a disclosure.

    # AI bubble (left side, dark purple)
    st.markdown(f"""
        <div style='display: flex; justify-content: flex-start; margin-bottom: 10px; margin-top: 15px;'>
            <div style='
                background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%);
                border-radius: 18px 18px 18px 4px;
                padding: 12px 16px;
                max-width: 70%;
                box-shadow: 0 2px 8px rgba(142, 68, 173, 0.3);
            '>
                <div style='font-size: 11px; color: #e8d5f2; margin-bottom: 6px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;'>
                    AI ASSISTANT
                </div>
                <div style='color: white; line-height: 1.5;'>
                    {exchange['response_text']}
                </div>
            </div>
        </div>
    """, unsafe_allow_html=True)

    # AI audio player \u2014 MP3 now that the backend uses Edge-TTS. The last
    # exchange autoplays; older ones sit silent so revisits do not burst into
    # audio on rerun.
    if exchange.get('response_audio'):
        is_latest = index == len(st.session_state.voice_history) - 1
        should_autoplay = bool(
            is_latest and st.session_state.get("is_playing")
        )
        col_a, col_b = st.columns([2, 1])
        with col_a:
            st.audio(
                exchange['response_audio'],
                format="audio/mp3",
                autoplay=should_autoplay,
            )

    # Spacing between exchanges
    st.markdown("<div style='margin-bottom: 24px;'></div>", unsafe_allow_html=True)


def render_voice_history():
    """Render the complete voice chat history."""
    if not st.session_state.voice_history:
        return

    # Subtle separator and section title
    st.markdown(
        "<div style='border-top: 1px solid #2d2d3a; margin: 40px 0 20px 0;'></div>",
        unsafe_allow_html=True,
    )
    st.subheader(":material/chat: Conversation")

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

    # Clear any previous playback flag so the SPEAKING badge goes idle while
    # we transcribe + wait for the LLM; it will flip back on once the new
    # reply lands at the end of this function.
    st.session_state.is_playing = False

    # Set processing state
    st.session_state.voice_processing = True
    st.session_state.voice_status = "transcribing"

    try:
        # Call voice chat API with the selected voice (if any).
        result = api_voice_chat(
            audio_bytes,
            filename,
            voice=st.session_state.get("selected_voice", DEFAULT_VOICE_ID),
        )

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

        # Set playing state and start playback timer
        st.session_state.is_playing = True
        st.session_state.play_start_time = time.time()

        st.success("Voice message processed")

    except Exception as e:
        st.session_state.voice_status = "error"
        st.error(f"Error processing voice message: {e}")

    finally:
        st.session_state.voice_processing = False


def _is_health_ready(health: dict) -> bool:
    """Return True only when both STT and TTS report ready via a healthy status."""
    return (
        health.get("status") == "healthy"
        and health.get("stt_ready", False)
        and health.get("tts_ready", False)
    )


def check_voice_services(poll_timeout_s: int = 60, poll_interval_s: float = 2.0) -> bool:
    """
    Check if voice services are available, polling during cold starts.

    The first time a user opens the voice chat the backend still has to
    download the Whisper weights (~240 MB) and initialise Edge-TTS, which
    can take between 30 and 60 seconds depending on HF Hub throughput. A
    single health request with a short timeout was surfacing a misleading
    "voice services not available" banner every cold start. This version
    caches the first ``healthy`` reply in ``st.session_state`` and, while
    it has not seen one yet, polls the health endpoint with a visible
    spinner so the user understands the service is warming up instead of
    broken.
    """
    if st.session_state.get("voice_services_ready"):
        return True

    import time

    health = check_voice_health()
    if _is_health_ready(health):
        st.session_state.voice_services_ready = True
        return True

    with st.spinner("Warming up voice services \u2014 this takes up to a minute on first launch..."):
        deadline = time.time() + poll_timeout_s
        while time.time() < deadline:
            time.sleep(poll_interval_s)
            health = check_voice_health()
            if _is_health_ready(health):
                st.session_state.voice_services_ready = True
                return True

    return False


def render_voice_selector():
    """Render the Azure voice dropdown that controls the TTS reply voice.

    The selector is centred under the orb and narrow so it does not compete
    with the microphone button. The chosen voice is stored in
    ``st.session_state.selected_voice`` and forwarded to the backend on every
    ``voice_chat`` call via the ``voice`` form field added to the endpoint.
    """
    col_l, col_c, col_r = st.columns([2, 2, 2])
    with col_c:
        voice_ids = list(VOICE_CATALOG.keys())
        current = st.session_state.get("selected_voice", DEFAULT_VOICE_ID)
        index = voice_ids.index(current) if current in voice_ids else 0
        chosen = st.selectbox(
            "Assistant voice",
            options=voice_ids,
            index=index,
            format_func=lambda vid: VOICE_CATALOG.get(vid, vid),
            key="voice_selector",
            label_visibility="collapsed",
        )
        st.session_state.selected_voice = chosen


def render_voice_report_button():
    """Render the report download button for voice chat."""
    voice_history = st.session_state.get('voice_history', [])

    # Only show if there's voice history with at least 1 exchange
    if len(voice_history) >= 1:
        col1, col2, col3 = st.columns([2, 1, 2])
        with col2:
            if st.button(":material/download: Download report", use_container_width=True, type="secondary", key="voice_report_btn"):
                with st.spinner("Generating report..."):
                    # Convert voice history to chat history format for report generation
                    chat_history = []
                    for exchange in voice_history:
                        # Add user message
                        chat_history.append({
                            "role": "user",
                            "type": "text",
                            "content": exchange.get('transcript', '')
                        })
                        # Add assistant message
                        chat_history.append({
                            "role": "assistant",
                            "type": "text",
                            "content": exchange.get('response_text', '')
                        })

                    # Get context if available (though voice chat might not have it)
                    context = st.session_state.get('chat_context', {})

                    # Generate report
                    report_content = generate_report(
                        chat_history=chat_history,
                        context=context
                    )

                    if report_content:
                        # Prepare filename
                        from datetime import datetime
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        filename = f"f1_voice_chat_report_{timestamp}.md"

                        # Show download button
                        st.download_button(
                            label=":material/download: Download markdown",
                            data=report_content,
                            file_name=filename,
                            mime="text/markdown",
                            use_container_width=True,
                            key=f"voice_download_{timestamp}"
                        )
                        st.success("Report generated successfully")


def render_voice_chat():
    """
    Main voice chat rendering function.
    Orchestrates voice input, processing, and history display.
    """
    # Initialize state
    initialize_voice_state()

    # Check voice services
    if not check_voice_services():
        st.error("Voice services are not available. Please ensure:")
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

    # Page-level CSS nukes. Streamlit custom-component iframes carry their own
    # dark backgrounds and cannot be styled from inside the sandbox, so the
    # only reliable path is to override them from the host page. Previous
    # attempts used specific ``title`` and ``data-testid`` selectors that did
    # not match in this Streamlit build; this version goes blanket \u2014 every
    # iframe and its standard Streamlit wrappers are made transparent.
    st.markdown(
        """
        <style>
        /* Every iframe on this page blends with the background. */
        iframe {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            color-scheme: normal !important;
        }

        /* Streamlit's standard custom-component wrappers. Class names are
           emotion-hashed per build, so we cast a wide net with attribute
           substrings + :has() to catch any div that actually holds an iframe. */
        [data-testid="stIFrame"],
        [data-testid="stCustomComponentV1"],
        [class*="stIFrame"],
        div.element-container:has(iframe),
        div.stVerticalBlock > div > div:has(> iframe) {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
        }

        /* audio_recorder_streamlit used to render a sandboxed iframe whose
           internal body carried a dark background we could not reach from
           the host page. We switched to st.audio_input (native Streamlit)
           so the widget now honours the page theme and no iframe clip is
           needed. Selectors kept only for the orb iframe above. */
        </style>
        """,
        unsafe_allow_html=True,
    )

    # Header
    st.markdown(
        "<h1 style='text-align: center; color: #ffffff; font-weight: 600; "
        "margin-bottom: 8px;'>Voice Chat</h1>",
        unsafe_allow_html=True,
    )

    # Tagline
    st.markdown(
        "<p style='text-align: center; color: #d1d5db; font-size: 0.9rem; "
        "margin-bottom: 28px;'>"
        "Conversational strategy analysis and F1 insights"
        "</p>",
        unsafe_allow_html=True,
    )

    # Audio Orb Visualization (auto-plays when response is ready)
    with st.container():
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            # Determine orb state
            is_recording = st.session_state.get('is_recording', False)
            is_processing = st.session_state.get('voice_processing', False)
            is_playing = st.session_state.get('is_playing', False)

            # Get audio blob for visualization
            # When playing: use response audio for audio-reactive animation
            # When recording: use current recording audio
            audio_blob = None
            if is_playing and st.session_state.voice_history:
                latest_exchange = st.session_state.voice_history[-1]
                audio_blob = latest_exchange.get('response_audio')
            elif is_recording:
                audio_blob = st.session_state.get('current_audio')

            # Show orb and detect when audio ends
            orb_result = audio_orb(
                audio_blob=audio_blob,
                is_recording=is_recording,
                is_processing=is_processing,
                is_playing=is_playing,
                theme="dark",  # Force dark theme to match UI
                key="voice_orb"
            )

            # The orb's internal audio element used to emit ``audio_ended``
            # which we'd mirror back into ``is_playing = False``. That fired
            # earlier than the st.audio widget's own playback in some
            # browsers and made the SPEAKING badge flicker off mid-reply. We
            # now ignore it and reset ``is_playing`` only at the start of the
            # next recording (see handle_voice_message) \u2014 the badge stays up
            # cleanly while Caronte is talking.

    # Voice selector (choose the TTS reply voice)
    render_voice_selector()

    # Note: the dedicated "Latest response" audio block is gone. Autoplay
    # now lives on the last exchange's AI audio inside render_voice_exchange
    # (st.audio(autoplay=True) \u2014 Streamlit 1.31+ native, no JS hack).

    # Voice input section
    with st.container():
        audio_bytes = render_voice_input()

        if audio_bytes:
            st.session_state.current_audio = audio_bytes
            st.session_state.last_processed_audio = audio_bytes

            # Process with spinner
            with st.spinner("Processing audio..."):
                handle_voice_message(audio_bytes)

            st.session_state.is_recording = False
            st.rerun()

    # Status indicator
    if st.session_state.voice_processing:
        render_voice_status(st.session_state.voice_status)

    # Chat history
    st.markdown("<div style='margin-top: 30px;'></div>",
                unsafe_allow_html=True)
    render_voice_history()

    # Footer \u2014 Download report + Clear, both secondary, right-aligned so
    # they do not compete with the orb for attention.
    if st.session_state.voice_history:
        render_voice_report_button()
        st.markdown("<div style='height: 12px;'></div>", unsafe_allow_html=True)
        footer_spacer, footer_clear = st.columns([4, 1])
        with footer_clear:
            if st.button(
                ":material/delete: Clear",
                use_container_width=True,
                type="secondary",
                key="voice_clear_history_btn",
            ):
                st.session_state.voice_history = []
                st.rerun()
