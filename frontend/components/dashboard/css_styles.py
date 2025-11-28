"""
CSS styling utilities for dashboard components.
"""

import streamlit as st
from components.common.driver_colors import get_driver_color


def render_custom_css():
    """
    Apply custom CSS for multiselect driver pills (transparent background, no borders).
    """
    css_content = """
        <style>
        /* Aggressively remove ALL backgrounds from multiselect pills */
        span[data-baseweb="tag"],
        span[data-baseweb="tag"] > span,
        span[data-baseweb="tag"] > span > span,
        span[data-baseweb="tag"] * {
            background-color: transparent !important;
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 2px 3px !important;
            margin-right: 6px !important;
        }

        /* Target div tags as well */
        div[data-baseweb="tag"],
        div[data-baseweb="tag"] > span,
        div[data-baseweb="tag"] * {
            background-color: transparent !important;
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
        }

        /* Hide the close/X button on pills */
        span[data-baseweb="tag"] svg,
        div[data-baseweb="tag"] svg {
            display: none !important;
        }

        /* Make driver codes bold and slightly larger */
        span[data-baseweb="tag"] span,
        div[data-baseweb="tag"] span {
            font-weight: 700 !important;
            font-size: 14px !important;
        }

        /* Style dropdown options */
        div[data-baseweb="select"] li[role="option"] {
            font-weight: 600 !important;
        }
        </style>
    """

    st.markdown(css_content, unsafe_allow_html=True)


def apply_driver_pill_colors(selected_drivers):
    """
    Apply team colors to driver pills based on selection order using nth-of-type.

    Args:
        selected_drivers (list): List of selected driver codes in order
    """
    if not selected_drivers:
        return

    css = "<style>"
    for i, driver_code in enumerate(selected_drivers, start=1):
        color = get_driver_color(driver_code)
        css += f"""
        span[data-baseweb="tag"]:nth-of-type({i}) span,
        div[data-baseweb="tag"]:nth-of-type({i}) span {{
            color: {color} !important;
        }}
        """
    css += "</style>"

    st.markdown(css, unsafe_allow_html=True)
