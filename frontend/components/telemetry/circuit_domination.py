"""
Circuit Domination Component

This module provides the Circuit Domination section for the dashboard,
displaying the circuit visualization.
"""

import streamlit as st


def render_circuit_domination_section() -> None:
    """
    Render the Circuit Domination section with the circuit visualization.

    This function displays:
    - A horizontal separator
    - A centered title "CIRCUIT DOMINATION"
    - A box for the circuit visualization
    """
    # Horizontal separator
    st.markdown("---")

    # Render the section title
    _render_section_title()

    # Render circuit visualization box
    _render_circuit_box()


def _render_section_title() -> None:
    """
    Render the centered section title.
    """
    st.markdown(
        "<h2 style='text-align: center;'>CIRCUIT DOMINATION</h2>",
        unsafe_allow_html=True
    )


def _render_circuit_box() -> None:
    """
    Render the box for the circuit visualization.

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
