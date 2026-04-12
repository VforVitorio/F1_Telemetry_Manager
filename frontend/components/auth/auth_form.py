# frontend/components/auth/auth_form.py
import streamlit as st


def render_auth_form():
    """
    Renders authentication form with login and register tabs
    """
    # Initialize tab state
    if 'active_tab' not in st.session_state:
        st.session_state.active_tab = 'Login'

    with st.container():
        # Header
        st.markdown(
            "<h1 style='text-align: center;'>F1 Strat Manager</h1>", unsafe_allow_html=True)

        # Custom animated tabs - centered
        _, center_col, _ = st.columns([1, 3, 1])
        with center_col:
            tab_cols = st.columns(2)
            with tab_cols[0]:
                if st.button(":material/login: Login", use_container_width=True,
                             type="primary" if st.session_state.active_tab == 'Login' else "secondary"):
                    st.session_state.active_tab = 'Login'
                    st.rerun()
            with tab_cols[1]:
                if st.button(":material/person_add: Register", use_container_width=True,
                             type="primary" if st.session_state.active_tab == 'Register' else "secondary"):
                    st.session_state.active_tab = 'Register'
                    st.rerun()

        if st.session_state.active_tab == 'Login':
            render_login_tab()
        else:
            render_register_tab()


def render_login_tab():
    """
    Renders login form
    """
    with st.form("login_form", clear_on_submit=False):
        st.markdown("#### :material/lock: Login to your account")

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

        submit = st.form_submit_button(
            ":material/login: Login",
            use_container_width=True,
            type="primary"
        )

        if submit:
            if email and password:
                with st.spinner("Authenticating..."):
                    # TODO: Call backend
                    st.success("Login successful!")
                    st.session_state['authenticated'] = True
                    st.session_state['email'] = email
                    st.rerun()
            else:
                st.error("Please fill all fields")


def render_register_tab():
    """
    Renders registration form
    """
    # Initialize session state for form values (passwords NOT stored for security)
    if 'reg_full_name' not in st.session_state:
        st.session_state.reg_full_name = ""
    if 'reg_email_value' not in st.session_state:
        st.session_state.reg_email_value = ""
    if 'reg_terms_value' not in st.session_state:
        st.session_state.reg_terms_value = False

    with st.form("register_form", clear_on_submit=True):
        st.markdown("#### :material/person_add: Create new account")

        full_name = st.text_input(
            "Full Name",
            placeholder="Lewis Hamilton",
            value=st.session_state.reg_full_name,
            key="reg_name"
        )

        email = st.text_input(
            "Email",
            placeholder="hamilton@f1.com",
            value=st.session_state.reg_email_value,
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
            value=st.session_state.reg_terms_value,
            key="reg_terms"
        )

        submit = st.form_submit_button(
            ":material/check: Create account",
            use_container_width=True,
            type="primary"
        )

        if submit:
            if not all([full_name, email, password, confirm]):
                st.error("Please fill all fields")
                st.session_state.reg_full_name = full_name
                st.session_state.reg_email_value = email
                st.session_state.reg_terms_value = terms
            elif password != confirm:
                st.error("Passwords don't match")
                st.session_state.reg_full_name = full_name
                st.session_state.reg_email_value = email
                st.session_state.reg_terms_value = terms
            elif len(password) < 8:
                st.error("Password must be at least 8 characters")
                st.session_state.reg_full_name = full_name
                st.session_state.reg_email_value = email
                st.session_state.reg_terms_value = terms
            elif not terms:
                st.error("Please accept terms")
                st.session_state.reg_full_name = full_name
                st.session_state.reg_email_value = email
                st.session_state.reg_terms_value = False
            else:
                with st.spinner("Creating account..."):
                    pass  # TODO: Call backend

                st.success("Account created! Redirecting to login...")
                st.session_state.reg_full_name = ""
                st.session_state.reg_email_value = ""
                st.session_state.reg_terms_value = False
                st.session_state.active_tab = 'Login'
                st.rerun()
