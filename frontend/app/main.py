# IMPORTANT: This import MUST be first to configure sys.path
# The comments below prevent linters from reordering it
import setup_path  # noqa: F401, E402  # isort: skip  # type: ignore

# Standard library imports
import requests

import streamlit as st

# Project imports (now work because setup_path configured sys.path)
from components.auth.auth_form import render_auth_form
from config import BACKEND_URL
from styles import GLOBAL_CSS

st.set_page_config(
    page_title="F1 Telemetry Manager",
    page_icon="🏎️",
    layout="wide"
)

# Apply global styles
st.markdown(GLOBAL_CSS, unsafe_allow_html=True)

if 'authenticated' not in st.session_state:
    st.session_state['authenticated'] = False

if not st.session_state['authenticated']:
    render_auth_form()
else:
    st.title("🏎️ F1 Telemetry Manager")
    st.success(f"Welcome {st.session_state.get('email', 'User')}!")

    col1, col2 = st.columns([3, 1])
    with col1:
        st.write("Dashboard is ready.")
    with col2:
        if st.button("Logout"):
            st.session_state['authenticated'] = False
            st.rerun()

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
