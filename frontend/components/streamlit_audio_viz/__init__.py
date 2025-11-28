"""
Audio Orb Visualization Component

Custom Streamlit component for visualizing audio with an animated orb.
Uses React Audio Visualizers for real-time audio visualization.
"""

import os
import streamlit.components.v1 as components
from typing import Optional

# Determine if we're in development or production
_RELEASE = True  # Set to False during development

if not _RELEASE:
    # Development: use dev server
    _component_func = components.declare_component(
        "audio_orb",
        url="http://localhost:3001",
    )
else:
    # Production: use built files
    parent_dir = os.path.dirname(os.path.abspath(__file__))
    build_dir = os.path.join(parent_dir, "frontend/build")
    _component_func = components.declare_component(
        "audio_orb",
        path=build_dir
    )


def audio_orb(
    audio_blob: Optional[bytes] = None,
    is_recording: bool = False,
    is_processing: bool = False,
    is_playing: bool = False,
    theme: str = "dark",
    key: Optional[str] = None
):
    """
    Display an animated audio orb visualization.

    The orb has four states:
    - Idle: Gradient orb with floating animation
    - Recording: Real-time audio visualization with microphone input
    - Processing: Pulsing animation while transcribing/thinking
    - Playing: Audio-reactive animation during TTS playback

    Args:
        audio_blob: Raw audio bytes for visualization (optional)
        is_recording: True if currently recording audio
        is_processing: True if processing (transcription/LLM/synthesis)
        is_playing: True if playing back TTS audio
        theme: Color theme ('light' or 'dark')
        key: Unique key for the component

    Returns:
        Dict with 'audio_ended': True when playback finishes, None otherwise

    Example:
        ```python
        from components.streamlit_audio_viz import audio_orb

        # Show idle orb
        audio_orb()

        # Show recording orb with audio visualization
        audio_orb(
            audio_blob=audio_bytes,
            is_recording=True
        )

        # Show processing orb
        audio_orb(is_processing=True, theme="dark")

        # Show playing orb
        audio_orb(is_playing=True, theme="dark")
        ```
    """
    return _component_func(
        audioBlob=audio_blob,
        isRecording=is_recording,
        isProcessing=is_processing,
        isPlaying=is_playing,
        theme=theme,
        key=key,
        default=None
    )


__all__ = ["audio_orb"]
