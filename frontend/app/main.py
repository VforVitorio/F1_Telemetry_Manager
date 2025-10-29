# IMPORTANT: This import MUST be first to configure sys.path
# The comments below prevent linters from reordering it
import setup_path  # noqa: F401, E402  # isort: skip  # type: ignore

# Standard library imports
import sys
import os
import requests
import streamlit as st

# Project imports (now work because setup_path configured sys.path)
from pages.dashboard import render_dashboard
from components.auth.auth_form import render_auth_form
from components.layout.navbar import render_navbar, show_welcome_toast
from config import BACKEND_URL
from styles import GLOBAL_CSS

# Page configuration - MUST be first Streamlit command
st.set_page_config(
    page_title="F1 Telemetry Manager",
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


# Initialize session state
if 'authenticated' not in st.session_state:
    st.session_state['authenticated'] = False

# Check authentication
if not st.session_state['authenticated']:
    render_auth_form()
else:
    # User is authenticated - show dashboard

    # Render fixed navbar with logout button
    render_navbar()

    # Show welcome notification (appears temporarily and fades away)
    if 'welcome_shown' not in st.session_state:
        show_welcome_toast(st.session_state.get('email', 'User'))
        st.session_state['welcome_shown'] = True

    # Render main dashboard
    render_dashboard()

    # Optional: Backend connection test (can be removed later)
    st.markdown("---")
    st.subheader("🔧 Debug Section")
    if st.button("Test Backend Connection"):
        try:
            response = requests.get(f"{BACKEND_URL}")
            if response.status_code == 200:
                st.success(
                    f"✅ Connected! Backend says: {response.json()['message']}")
            else:
                st.error(f"❌ Error: {response.status_code}")
        except Exception as e:
            st.error(f"❌ Cannot reach backend: {str(e)}")
