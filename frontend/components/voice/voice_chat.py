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
                <div style='font-size: 12px; color: #6b4684; margin-bottom: 4px; font-weight: 600;'>
                    👤 You
                </div>
                <div style='color: #2d1b3d; line-height: 1.5;'>
                    {exchange['transcript']}
                </div>
            </div>
        </div>
    """, unsafe_allow_html=True)

    # User audio player (small, inline)
    if exchange.get('user_audio'):
        col1, col2 = st.columns([1, 2])
        with col2:
            st.audio(exchange['user_audio'], format="audio/wav")

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
                <div style='font-size: 12px; color: #e8d5f2; margin-bottom: 4px; font-weight: 600;'>
                    🤖 Caronte
                </div>
                <div style='color: white; line-height: 1.5;'>
                    {exchange['response_text']}
                </div>
                <div style='font-size: 11px; color: rgba(255, 255, 255, 0.7); margin-top: 8px;'>
                    ⏱️ {exchange['processing_time']:.2f}s
                </div>
            </div>
        </div>
    """, unsafe_allow_html=True)

    # AI audio player (small, inline)
    if exchange.get('response_audio'):
        col1, col2 = st.columns([2, 1])
        with col1:
            st.audio(exchange['response_audio'], format="audio/wav")

    # Spacing between exchanges
    st.markdown("<div style='margin-bottom: 20px;'></div>", unsafe_allow_html=True)


def render_voice_history():
    """Render the complete voice chat history."""
    if not st.session_state.voice_history:
        return

    # Separator and title
    st.markdown("---")
    st.markdown("### 💬 Chat History")

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

        # Set playing state and start playback timer
        st.session_state.is_playing = True
        st.session_state.play_start_time = time.time()

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


def render_voice_report_button():
    """Render the report download button for voice chat."""
    voice_history = st.session_state.get('voice_history', [])

    # Only show if there's voice history with at least 1 exchange
    if len(voice_history) >= 1:
        col1, col2, col3 = st.columns([2, 1, 2])
        with col2:
            if st.button("📄 Download Report", use_container_width=True, type="secondary", key="voice_report_btn"):
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
                            label="⬇️ Download Markdown Report",
                            data=report_content,
                            file_name=filename,
                            mime="text/markdown",
                            use_container_width=True,
                            key=f"voice_download_{timestamp}"
                        )
                        st.success("✅ Report generated successfully!")


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

    # Description
    st.markdown(
        """
        <p style='text-align: center; color: #a78bfa; font-size: 14px; margin-top: -10px; margin-bottom: 20px;'>
        Have a casual, conversational discussion about F1 strategies, race analysis, and telemetry insights with our AI assistant.
        </p>
        """,
        unsafe_allow_html=True
    )

    st.markdown("---")

    # Report download button (appears when there's voice history)
    render_voice_report_button()

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

            # Auto-stop playing when audio ends (without rerun to avoid page reload)
            if orb_result and orb_result.get('audio_ended') and is_playing:
                st.session_state.is_playing = False
                # Don't rerun - let natural refresh handle it

    # Latest response audio playback
    if st.session_state.voice_history and st.session_state.is_playing:
        latest_exchange = st.session_state.voice_history[-1]
        if latest_exchange.get('response_audio'):
            with st.container():
                col1, col2, col3 = st.columns([1, 2, 1])
                with col2:
                    st.markdown("### 🔊 Playing Response")
                    st.audio(
                        latest_exchange['response_audio'], format="audio/wav")

                    # Inject JavaScript to attempt autoplay
                    st.markdown("""
                        <script>
                        // Attempt to autoplay the audio element
                        setTimeout(function() {
                            const audioElements = document.querySelectorAll('audio');
                            if (audioElements.length > 0) {
                                const lastAudio = audioElements[audioElements.length - 1];
                                lastAudio.play().catch(e => {
                                    console.log('Autoplay blocked by browser:', e);
                                    // If blocked, user can click play manually
                                });
                            }
                        }, 100);
                        </script>
                    """, unsafe_allow_html=True)

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

    # Clear history button
    if st.session_state.voice_history:
        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            if st.button("🗑️ Clear Voice History", use_container_width=True):
                st.session_state.voice_history = []
                st.rerun()
