import streamlit as st
import requests
# from config impor BACKEND_URL

st.set_page_config(
    page_title="F1 Telemetry Manager",
    page_icon="🏎️",
    layout="wide"
)

st.title("🏎️ F1 Telemetry Manager")
st.write("Welcome! The setup is working.")

# try backend connection
if st.button("Test Backend Connection"):
    try:
        # NOTE: need to change this when config file is made
        # response = requests.get(f"{BACKEND_URL}")
        response = requests.get("http://localhost:8000")
        if response.status_code == 200:
            st.success(
                f"✅ Connected! Backend says: {response.json()['message']}")
        else:
            st.error(f"❌ Error: {response.status_code}")
    except Exception as e:
        st.error(f"❌ Cannot reach backend: {str(e)}")
