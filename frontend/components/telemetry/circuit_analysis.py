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
    - Centered text and play button
    - A placeholder box for the circuit visualization
    """
    # Horizontal separator
    st.markdown("---")

    # Render the section title
    _render_section_title()

    # Render text and play button
    _render_play_text()
    _render_play_button()

    # Render empty placeholder box
    _render_circuit_placeholder()


def _render_section_title() -> None:
    """
    Render the centered section title.
    """
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT ANALYSIS</h2>",
        unsafe_allow_html=True
    )


def _render_play_text() -> None:
    """
    Render the centered play text message.
    """
    st.markdown(
        """
        <p style="
            text-align: center;
            font-size: 25px;
            color: #d1d5db;
            font-family: 'Inter', sans-serif;
            margin: 20px 0;
        ">Want to see it in action? Hit play</p>
        """,
        unsafe_allow_html=True
    )


def _render_play_button() -> None:
    """
    Render a centered play button using Streamlit's native button.
    """
    col1, col2, col3 = st.columns([2, 1, 2])

    with col2:
        st.button("▶", key="circuit_play_button",
                  use_container_width=True)


def _render_circuit_placeholder() -> None:
    """
    Render the empty placeholder box for the circuit visualization.

    The box is narrower and taller to accommodate the circuit drawing.
    """
    # Create columns to center and narrow the container
    left_spacing, center_container, right_spacing = st.columns([1, 3, 1])

    with center_container:
        st.markdown(
            """
            <div style="
                border: 2px solid #a78bfa;
                border-radius: 12px;
                padding: 40px;
                text-align: center;
                background-color: #181633;
                margin: 20px 0;
                box-shadow: 0 4px 12px rgba(167, 139, 250, 0.2);
                min-height: 600px;
            ">
            </div>
            """,
            unsafe_allow_html=True
        )
