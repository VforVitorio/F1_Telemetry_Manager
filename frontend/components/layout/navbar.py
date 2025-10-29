"""
Navbar component - Fixed top navigation bar with logout button.
"""

import streamlit as st
import streamlit.components.v1 as components


def render_navbar():
    """
    Renders a fixed navigation bar at the top with logout button.
    The navbar stays visible when scrolling.
    """
    # HTML/CSS/JS for fixed navbar with functional logout button
    navbar_html = """
        <style>
        /* Fixed navbar at the top */
        .fixed-navbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            background: linear-gradient(135deg, #121127 0%, #1e1b4b 100%);
            border-bottom: 2px solid #a78bfa;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            padding: 0 2rem;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }
        
        /* Logout button styling */
        .logout-btn {
            background-color: #a78bfa;
            color: white;
            border: none;
            padding: 0.5rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            font-size: 1rem;
            font-family: 'Inter', sans-serif;
        }
        
        .logout-btn:hover {
            opacity: 0.9;
            box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
            transform: translateY(-1px);
        }
        
        .logout-btn:active {
            transform: translateY(0);
        }
        </style>
        
        <div class="fixed-navbar">
            <button class="logout-btn" onclick="handleLogout()">🚪 Logout</button>
        </div>
        
        <script>
        function handleLogout() {
            // Trigger Streamlit button click by simulating click on hidden button
            const streamlitButtons = window.parent.document.querySelectorAll('button[kind="secondary"]');
            const logoutButton = Array.from(streamlitButtons).find(btn => btn.innerText.includes('HIDDEN_LOGOUT'));
            if (logoutButton) {
                logoutButton.click();
            }
        }
        </script>
    """

    # Render HTML navbar
    components.html(navbar_html, height=0)

    # Add padding to main content to avoid navbar overlap
    st.markdown("""
        <style>
        /* Add padding to content to avoid navbar overlap */
        .main .block-container {
            padding-top: 80px !important;
        }
        </style>
    """, unsafe_allow_html=True)

    # Hidden Streamlit button for logout functionality
    if st.button("HIDDEN_LOGOUT", key="hidden_logout_btn", type="secondary"):
        st.session_state['authenticated'] = False
        st.session_state['welcome_shown'] = False
        st.rerun()


def show_welcome_toast(username):
    """
    Shows a custom welcome toast notification with animation.
    Appears top-right and fades out after 3 seconds.

    Args:
        username (str): Username to display in the toast
    """
    # Use f-string and escape JavaScript braces properly
    toast_html = f"""
        <style>
        /* Toast container */
        @keyframes slideInRight {{
            from {{
                transform: translateX(100%);
                opacity: 0;
            }}
            to {{
                transform: translateX(0);
                opacity: 1;
            }}
        }}
        
        @keyframes slideOutRight {{
            from {{
                transform: translateX(0);
                opacity: 1;
            }}
            to {{
                transform: translateX(100%);
                opacity: 0;
            }}
        }}
        
        .custom-toast {{
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
            z-index: 10000;
            font-weight: 600;
            font-size: 1rem;
            animation: slideInRight 0.5s ease-out, slideOutRight 0.5s ease-in 2.5s;
            animation-fill-mode: forwards;
        }}
        
        .custom-toast-icon {{
            font-size: 1.5rem;
            margin-right: 0.5rem;
        }}
        </style>
        
        <div class="custom-toast">
            <span class="custom-toast-icon">🏎️</span>
            ✅ Welcome {username}!
        </div>
        
        <script>
        setTimeout(function() {{
            const toast = document.querySelector('.custom-toast');
            if (toast) {{
                toast.style.animation = 'slideOutRight 0.5s ease-in';
                setTimeout(() => toast.remove(), 500);
            }}
        }}, 3000);
        </script>
    """

    # Render toast
    st.markdown(toast_html, unsafe_allow_html=True)
