"""
Circuit Analysis Component

This module provides the Circuit Analysis section for the dashboard,
displaying a placeholder for the animated circuit visualization.
"""

import streamlit as st


def render_circuit_analysis_section() -> None:
    """
    Render the Circuit Analysis section with a placeholder box.

    This function displays:
    - A horizontal separator
    - A centered title "CIRCUIT ANALYSIS"
    - A placeholder box for the circuit visualization
    - A "hit play" message with play icon
    """
    # Horizontal separator
    st.markdown("---")

    # Render the section title and content
    _render_section_title()
    _render_circuit_placeholder()


def _render_section_title() -> None:
    """
    Render the centered section title.
    """
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT ANALYSIS</h2>",
        unsafe_allow_html=True
    )


def _render_circuit_placeholder() -> None:
    """
    Render the placeholder box for the circuit visualization.

    This includes:
    - A large container box with border styling matching the app theme
    - Centered placeholder text
    """
    # Simplified HTML with just the text
    st.markdown(
        """
        <div style="
            border: 2px solid #a78bfa;
            border-radius: 12px;
            padding: 60px 40px;
            text-align: center;
            background-color: #181633;
            margin: 20px 0;
            box-shadow: 0 4px 12px rgba(167, 139, 250, 0.2);
            min-height: 400px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        ">
            <p style="
                font-size: 18px;
                color: #d1d5db;
                font-family: 'Inter', sans-serif;
            ">Want to see it in action? hit play</p>
        </div>
        """,
        unsafe_allow_html=True
    )


def _render_play_button() -> None:
    """
    Render a centered play button icon.
    NOTE: This function is not used anymore as button is now in HTML.
    Kept for backwards compatibility.
    """
    pass
