# frontend/components/auth/auth_form.py
import streamlit as st
import streamlit_shadcn_ui as ui


def render_auth_form():
    """
    Renders authentication form with login and register tabs
    """
    st.markdown("""
        <style>
        .auth-container {
            max-width: 400px;
            margin: 0 auto;
            padding: 2rem;
        }
        </style>
    """, unsafe_allow_html=True)

    with st.container():
        st.markdown("<div class='auth-container'>", unsafe_allow_html=True)

        # Header
        st.markdown("### 🏎️ F1 Telemetry Manager")
        ui.badges(
            badge_list=[("Secure", "default"), ("Fast", "secondary")],
            class_name="flex gap-2",
            key="auth_badges"
        )
        st.markdown("---")

        # Tabs
        tab_selection = ui.tabs(
            options=['Login', 'Register'],
            default_value='Login',
            key="auth_tabs"
        )

        if tab_selection == 'Login':
            render_login_tab()
        else:
            render_register_tab()

        st.markdown("</div>", unsafe_allow_html=True)


def render_login_tab():
    """
    Renders login form
    """
    with st.form("login_form", clear_on_submit=False):
        st.markdown("#### 🔐 Login to your account")

        email = st.text_input(
            "Email",
            placeholder="hamilton@f1.com",
            key="login_email"
        )

        password = st.text_input(
            "Password",
            type="password",
            placeholder="••••••••",
            key="login_password"
        )

        col1, col2 = st.columns([3, 1])
        with col1:
            remember = st.checkbox("Remember me")
        with col2:
            st.markdown("[Forgot?](#)", unsafe_allow_html=True)

        submit = st.form_submit_button(
            "🏁 Login",
            use_container_width=True,
            type="primary"
        )

        if submit:
            if email and password:
                with st.spinner("Authenticating..."):
                    # TODO: Call backend
                    st.success("✅ Login successful!")
                    st.session_state['authenticated'] = True
                    st.session_state['email'] = email
                    st.rerun()
            else:
                st.error("❌ Please fill all fields")


def render_register_tab():
    """
    Renders registration form
    """
    with st.form("register_form", clear_on_submit=True):
        st.markdown("#### ✨ Create new account")

        full_name = st.text_input(
            "Full Name",
            placeholder="Lewis Hamilton",
            key="reg_name"
        )

        email = st.text_input(
            "Email",
            placeholder="hamilton@f1.com",
            key="reg_email"
        )

        col1, col2 = st.columns(2)
        with col1:
            password = st.text_input(
                "Password",
                type="password",
                placeholder="••••••••",
                help="Min. 8 characters",
                key="reg_password"
            )
        with col2:
            confirm = st.text_input(
                "Confirm Password",
                type="password",
                placeholder="••••••••",
                key="reg_confirm"
            )

        terms = st.checkbox(
            "I agree to Terms & Conditions",
            key="reg_terms"
        )

        submit = st.form_submit_button(
            "🎯 Create Account",
            use_container_width=True,
            type="primary"
        )

        if submit:
            if not all([full_name, email, password, confirm]):
                st.error("❌ Please fill all fields")
            elif password != confirm:
                st.error("❌ Passwords don't match")
            elif len(password) < 8:
                st.error("❌ Password must be at least 8 characters")
            elif not terms:
                st.error("❌ Please accept terms")
            else:
                with st.spinner("Creating account..."):
                    # TODO: Call backend
                    st.success("✅ Account created! Please login.")
