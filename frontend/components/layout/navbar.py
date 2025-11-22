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
        # TextColor.SECONDARY (Light gray for inactive)
        'txc_inactive': '#d1d5db',
        'menu_background': '#121127',    # Color.PRIMARY_BG (Dark blue-black)
        'txc_active': '#ffffff',         # TextColor.PRIMARY (White for active)
        # Color.SECONDARY_BG (Dark indigo for hover)
        'option_active': '#1e1b4b',
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

    # Render navbar with hydralit_components (menu items between Home and Logout)
    menu_id = hc.nav_bar(
        menu_definition=[
            {'id': 'Comparison', 'icon': "fa fa-balance-scale", 'label': "Comparison"},
            {'id': 'AI Chat', 'icon': "fa fa-comments", 'label': "AI Chat"}
        ],
        override_theme=override_theme,
        home_name='Home',
        login_name='Logout',  # This creates the logout button
        sticky_nav=True,  # Makes navbar sticky
        sticky_mode='pinned',  # Pinned mode (no jumping)
        hide_streamlit_markers=False
    )

    # Track menu clicks to avoid re-triggering navigation on re-renders
    last_menu_id = st.session_state.get('last_navbar_menu_id', None)

    # Only navigate if the menu_id actually changed (new click)
    if menu_id != last_menu_id:
        st.session_state['last_navbar_menu_id'] = menu_id

        # Handle logout action
        if menu_id == 'Logout':
            st.session_state['authenticated'] = False
            st.session_state['welcome_shown'] = False
            st.session_state['current_page'] = 'dashboard'
            st.rerun()

        # Handle home navigation
        elif menu_id == 'Home':
            if st.session_state.get('current_page') != 'dashboard':
                st.session_state['current_page'] = 'dashboard'
                st.rerun()

        # Handle comparison navigation
        elif menu_id == 'Comparison':
            if st.session_state.get('current_page') != 'comparison':
                st.session_state['current_page'] = 'comparison'
                st.rerun()

        # Handle AI chat navigation
        elif menu_id == 'AI Chat':
            if st.session_state.get('current_page') != 'chat':
                st.session_state['current_page'] = 'chat'
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


def show_error_toast(message):
    """
    Shows a custom error toast notification with animation.
    Appears top-right and fades out after 4 seconds.
    Similar to welcome toast but in red with X icon.

    Args:
        message (str): Error message to display in the toast
    """
    toast_html = f"""
        <style>
        /* Toast container for error */
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

        .custom-error-toast {{
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
            z-index: 10000;
            font-weight: 600;
            font-size: 1rem;
            animation: slideInRight 0.5s ease-out, slideOutRight 0.5s ease-in 3.5s;
            animation-fill-mode: forwards;
            max-width: 400px;
        }}

        .custom-error-toast-icon {{
            font-size: 1.5rem;
            margin-right: 0.5rem;
        }}
        </style>

        <div class="custom-error-toast">
            <span class="custom-error-toast-icon">❌</span>
            {message}
        </div>

        <script>
        setTimeout(function() {{
            const toast = document.querySelector('.custom-error-toast');
            if (toast) {{
                toast.style.animation = 'slideOutRight 0.5s ease-in';
                setTimeout(() => toast.remove(), 500);
            }}
        }}, 4000);
        </script>
    """

    # Render error toast
    st.markdown(toast_html, unsafe_allow_html=True)


def show_warning_toast(message="⏳ Loading animation... This may take a moment to render"):
    """
    Shows a custom info toast notification with animation.
    Appears top-right and fades out after 5 seconds.
    Purple gradient matching app theme with hourglass icon.

    Args:
        message (str): Info message to display in the toast
    """
    toast_html = f"""
        <style>
        /* Toast container for info */
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

        .custom-warning-toast {{
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(167, 139, 250, 0.4);
            z-index: 10000;
            font-weight: 600;
            font-size: 1rem;
            animation: slideInRight 0.5s ease-out, slideOutRight 0.5s ease-in 4.5s;
            animation-fill-mode: forwards;
            max-width: 400px;
        }}

        .custom-warning-toast-icon {{
            font-size: 1.5rem;
            margin-right: 0.5rem;
        }}
        </style>

        <div class="custom-warning-toast">
            {message}
        </div>

        <script>
        setTimeout(function() {{
            const toast = document.querySelector('.custom-warning-toast');
            if (toast) {{
                toast.style.animation = 'slideOutRight 0.5s ease-in';
                setTimeout(() => toast.remove(), 500);
            }}
        }}, 5000);
        </script>
    """

    # Render info toast
    st.markdown(toast_html, unsafe_allow_html=True)
