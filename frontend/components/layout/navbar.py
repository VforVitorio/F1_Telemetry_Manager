"""
Navbar component - Fixed top navigation bar with logout button using hydralit_components.
"""

import streamlit as st
import hydralit_components as hc


def render_navbar():
    """
    Renders a fixed navigation bar at the top with logout button using hydralit_components.
    The navbar stays pinned to the top when scrolling.
    Returns the selected menu item or logout action.
    """
    # Theme customization matching styles.py color scheme
    override_theme = {
        'txc_inactive': '#d1d5db',      # TextColor.SECONDARY (Light gray for inactive)
        'menu_background': '#121127',    # Color.PRIMARY_BG (Dark blue-black)
        'txc_active': '#ffffff',         # TextColor.PRIMARY (White for active)
        'option_active': '#1e1b4b',      # Color.SECONDARY_BG (Dark indigo for hover)
        'txc_hover': '#a78bfa'           # Color.ACCENT (Purple for hover text)
    }

    # Additional CSS to ensure navbar stays fixed at top
    st.markdown("""
        <style>
        /* Force navbar container to be fixed at top */
        iframe[title="hydralit_components.NAV_BAR.nav_bar"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 999999 !important;
            width: 100% !important;
        }

        /* Add padding to main content to prevent navbar overlap */
        .main .block-container {
            padding-top: 80px !important;
        }

        /* Ensure the navbar component iframe has proper height */
        div[data-testid="stVerticalBlock"] > div:has(iframe[title="hydralit_components.NAV_BAR.nav_bar"]) {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 999999 !important;
            width: 100% !important;
        }
        </style>
    """, unsafe_allow_html=True)

    # Render navbar with hydralit_components (no menu items, just Home and Logout)
    menu_id = hc.nav_bar(
        menu_definition=[],  # Empty menu - only Home and Logout buttons
        override_theme=override_theme,
        home_name='Home',
        login_name='Logout',  # This creates the logout button
        sticky_nav=True,  # Makes navbar sticky
        sticky_mode='pinned',  # Pinned mode (no jumping)
        hide_streamlit_markers=False
    )

    # Handle logout action
    if menu_id == 'Logout':
        st.session_state['authenticated'] = False
        st.session_state['welcome_shown'] = False
        st.rerun()

    return menu_id


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
