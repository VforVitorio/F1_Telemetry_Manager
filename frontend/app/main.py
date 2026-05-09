# IMPORTANT: This import MUST be first to configure sys.path
# The comments below prevent linters from reordering it
import setup_path  # noqa: F401, E402  # isort: skip  # type: ignore

# Standard library imports
import os
import sys

import streamlit as st
from components.layout.navbar import render_navbar
from pages.chat import render_chat_page
from pages.comparison import render_comparison_page

# Project imports (now work because setup_path configured sys.path)
from pages.dashboard import render_dashboard
from pages.model_lab import render_model_lab_page
from pages.race_analysis import render_race_analysis_page
from pages.strategy import render_strategy_page
from styles import GLOBAL_CSS

# Page configuration - MUST be first Streamlit command
st.set_page_config(
    page_title="F1 StratLab",
    page_icon="🏎️",
    layout="wide"
)

# Apply global styles
st.markdown(GLOBAL_CSS, unsafe_allow_html=True)

# Import dashboard after page config
pages_dir = os.path.join(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))), 'pages')
if pages_dir not in sys.path:
    sys.path.insert(0, pages_dir)


# Initialize current page
if 'current_page' not in st.session_state:
    st.session_state['current_page'] = 'dashboard'

# Render fixed navbar
render_navbar()

# Multi-page navigation logic
current_page = st.session_state.get('current_page', 'dashboard')

if current_page == 'comparison':
    render_comparison_page()
elif current_page == 'chat':
    render_chat_page()
elif current_page == 'strategy':
    render_strategy_page()
elif current_page == 'race_analysis':
    render_race_analysis_page()
elif current_page == 'model_lab':
    render_model_lab_page()
else:
    # Default to dashboard
    render_dashboard()
