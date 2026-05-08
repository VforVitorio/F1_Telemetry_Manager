"""
Navbar component - Fixed top navigation bar using hydralit_components.
"""

import hydralit_components as hc
import streamlit as st


def render_navbar():
    """
    Renders a fixed navigation bar at the top using hydralit_components.
    The navbar stays pinned to the top when scrolling.
    Returns the selected menu item.
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

    # Render navbar with hydralit_components
    menu_id = hc.nav_bar(
        menu_definition=[
            {'id': 'Strategy', 'icon': "fa fa-chess", 'label': "Strategy"},
            {'id': 'Race Analysis', 'icon': "fa fa-chart-line", 'label': "Race Analysis"},
            {'id': 'Model Lab', 'icon': "fa fa-flask", 'label': "Model Lab"},
            {'id': 'Comparison', 'icon': "fa fa-balance-scale", 'label': "Comparison"},
            {'id': 'AI Chat', 'icon': "fa fa-comments", 'label': "AI Chat"}
        ],
        override_theme=override_theme,
        home_name='Home',
        sticky_nav=True,  # Makes navbar sticky
        sticky_mode='pinned',  # Pinned mode (no jumping)
        hide_streamlit_markers=False
    )

    # Track menu clicks to avoid re-triggering navigation on re-renders
    last_menu_id = st.session_state.get('last_navbar_menu_id', None)

    # Only navigate if the menu_id actually changed (new click)
    if menu_id != last_menu_id:
        st.session_state['last_navbar_menu_id'] = menu_id

        # Handle home navigation
        if menu_id == 'Home':
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

        # Handle strategy navigation
        elif menu_id == 'Strategy':
            if st.session_state.get('current_page') != 'strategy':
                st.session_state['current_page'] = 'strategy'
                st.rerun()

        # Handle race analysis navigation
        elif menu_id == 'Race Analysis':
            if st.session_state.get('current_page') != 'race_analysis':
                st.session_state['current_page'] = 'race_analysis'
                st.rerun()

        # Handle model lab navigation
        elif menu_id == 'Model Lab':
            if st.session_state.get('current_page') != 'model_lab':
                st.session_state['current_page'] = 'model_lab'
                st.rerun()

    return menu_id


def _show_toast(message: str, color_start: str, color_end: str,
                duration_ms: int = 3000, css_id: str = "toast") -> None:
    """Render a slide-in / auto-dismiss toast notification."""
    fade_start = duration_ms - 500
    shadow_r, shadow_g, shadow_b = (
        int(color_start[1:3], 16),
        int(color_start[3:5], 16),
        int(color_start[5:7], 16),
    )
    toast_html = f"""
        <style>
        @keyframes toastIn  {{ from {{ transform:translateX(100%); opacity:0 }} to {{ transform:translateX(0); opacity:1 }} }}
        @keyframes toastOut {{ from {{ transform:translateX(0); opacity:1 }} to {{ transform:translateX(100%); opacity:0 }} }}
        .ct-{css_id} {{
            position:fixed; top:80px; right:20px; max-width:400px;
            background:linear-gradient(135deg,{color_start} 0%,{color_end} 100%);
            color:#fff; padding:1rem 1.5rem; border-radius:12px;
            box-shadow:0 4px 20px rgba({shadow_r},{shadow_g},{shadow_b},0.4);
            z-index:10000; font-weight:600; font-size:1rem;
            animation:toastIn .5s ease-out, toastOut .5s ease-in {fade_start}ms;
            animation-fill-mode:forwards;
        }}
        </style>
        <div class="ct-{css_id}">{message}</div>
        <script>
        setTimeout(function(){{
            var t=document.querySelector('.ct-{css_id}');
            if(t){{ t.style.animation='toastOut .5s ease-in'; setTimeout(()=>t.remove(),500); }}
        }},{duration_ms});
        </script>
    """
    st.markdown(toast_html, unsafe_allow_html=True)


def show_error_toast(message: str) -> None:
    """Error toast — red, 4 s."""
    _show_toast(message, "#ef4444", "#dc2626", 4000, "error")


def show_warning_toast(message: str = "Loading animation... This may take a moment to render") -> None:
    """Info/warning toast — purple, 5 s."""
    _show_toast(message, "#a78bfa", "#8b5cf6", 5000, "warning")
