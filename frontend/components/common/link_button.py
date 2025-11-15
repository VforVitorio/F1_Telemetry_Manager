"""
Link Button Component

This module provides a reusable link-button component for navigation between pages.
"""

import streamlit as st


def render_link_button(text: str, target_page: str, button_text: str = "Click here") -> None:
    """
    Renders a beautiful purple link-button that navigates to a different page.

    This component displays an informative message with a stylish button underneath
    that redirects users to another page within the application when clicked.

    Args:
        text: The message to display above the button
        target_page: The page identifier to navigate to (e.g., 'comparison', 'dashboard')
        button_text: The text to display inside the button (default: "Click here")

    Usage:
        from components.common.link_button import render_link_button

        render_link_button(
            text="If you want to compare the lap progress between your 2 selected drivers, click here",
            target_page="comparison",
            button_text="⚖️ GO TO COMPARISON"
        )
    """
    # Create centered container
    col1, col2, col3 = st.columns([1, 2, 1])

    with col2:
        # Render the styled container with text and button
        st.markdown(
            f"""
            <div class="link-button-container">
                <p class="link-button-text">{text}</p>
            </div>
            <style>
            .link-button-container {{
                width: 100%;
                padding: 30px;
                background: linear-gradient(135deg, rgba(167, 139, 250, 0.1) 0%, rgba(162, 89, 247, 0.1) 100%);
                border: 2px solid #a78bfa;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
                text-align: center;
                margin: 20px 0;
                transition: all 0.3s ease;
            }}
            .link-button-container:hover {{
                box-shadow: 0 6px 16px rgba(167, 139, 250, 0.5);
                border-color: #A259F7;
            }}
            .link-button-text {{
                color: #d1d5db;
                font-family: 'Inter', sans-serif;
                font-size: 16px;
                font-weight: 400;
                margin: 0 0 20px 0;
                letter-spacing: 0.3px;
                line-height: 1.6;
            }}
            </style>
            """,
            unsafe_allow_html=True
        )

        # Render the actual clickable button
        if st.button(button_text, use_container_width=True, type="primary", key=f"link_btn_{target_page}"):
            st.session_state['current_page'] = target_page
            st.rerun()
