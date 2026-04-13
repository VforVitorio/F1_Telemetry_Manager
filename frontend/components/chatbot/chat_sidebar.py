"""
Chat Sidebar — Modern, polished chat management panel.

Clean header, prominent New Chat button, scrollable chat history with
active highlight, reports collapsed, Material Icons throughout.
"""

import streamlit as st
from utils.chat_state import (
    create_new_chat,
    delete_current_chat,
    load_chat,
    get_saved_chat_names,
)
from utils.report_storage import (
    get_all_reports,
    get_report_count,
    delete_report,
    clear_all_reports,
)


def render_chat_sidebar() -> None:
    """Render the full modern chat sidebar."""
    _inject_sidebar_css()
    _render_mode_toggle()
    st.divider()
    _render_new_chat_button()
    _render_chat_list()
    st.divider()
    _render_reports_section()


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

def _render_mode_toggle() -> None:
    """Text / Voice mode toggle at top of sidebar."""
    c1, c2 = st.columns(2)
    with c1:
        if st.button(
            ":material/chat: Text",
            use_container_width=True,
            type="primary" if st.session_state.get("chat_mode", "text") == "text" else "secondary",
            key="sidebar_mode_text",
        ):
            st.session_state.chat_mode = "text"
            st.rerun()
    with c2:
        if st.button(
            ":material/mic: Voice",
            use_container_width=True,
            type="primary" if st.session_state.get("chat_mode", "text") == "voice" else "secondary",
            key="sidebar_mode_voice",
        ):
            st.session_state.chat_mode = "voice"
            st.rerun()


def _render_new_chat_button() -> None:
    """Prominent New Chat button at top."""
    if st.button(
        ":material/add: New Chat",
        key="sidebar_new_chat",
        use_container_width=True,
        type="primary",
    ):
        create_new_chat()
        st.rerun()
    st.caption("")  # small spacer


def _render_chat_list() -> None:
    """Scrollable chat history with active highlight."""
    chat_names = get_saved_chat_names()

    if not chat_names:
        st.caption("No chats yet — start a conversation.")
        return

    st.markdown(
        f'<div class="sidebar-section-header">'
        f'<span>History</span>'
        f'<span class="sidebar-count">{len(chat_names)}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

    current = st.session_state.get("current_chat_name")
    for idx, name in enumerate(chat_names):
        display = name if len(name) <= 35 else name[:32] + "..."

        if name == current:
            st.markdown(
                f'<div class="sidebar-chat-active" title="{name}">'
                f'{display}</div>',
                unsafe_allow_html=True,
            )
        else:
            if st.button(display, key=f"load_{idx}_{name}", use_container_width=True):
                load_chat(name)
                st.rerun()

    # Delete button at the bottom of chat list (subtle)
    st.caption("")
    if st.button(
        ":material/delete_outline: Delete current",
        key="sidebar_delete_chat",
        use_container_width=True,
    ):
        delete_current_chat()
        st.rerun()


def _render_reports_section() -> None:
    """Reports in a collapsed expander."""
    count = get_report_count()

    with st.expander(f":material/description: Reports ({count})", expanded=False):
        if count == 0:
            st.caption("No reports yet.")
            return

        if st.button(":material/delete_sweep: Clear all", key="sidebar_clear_reports", use_container_width=True):
            clear_all_reports()
            st.rerun()

        for i, report in enumerate(reversed(get_all_reports())):
            ts = report["timestamp"].strftime("%m/%d %H:%M")
            chat = report.get("chat_name", "")
            c1, c2 = st.columns([4, 1])
            with c1:
                st.download_button(
                    f"{ts} — {chat}",
                    data=report["content"],
                    file_name=report["filename"],
                    mime="text/markdown",
                    key=f"dl_{i}_{report['id']}",
                    use_container_width=True,
                )
            with c2:
                if st.button(":material/close:", key=f"del_{i}_{report['id']}"):
                    delete_report(report["id"])
                    st.rerun()


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

def _inject_sidebar_css() -> None:
    """Sidebar-specific CSS for modern look."""
    st.markdown("""
    <style>
    /* Sidebar background */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #1e1b4b 0%, #16132f 100%) !important;
        border-right: 1px solid #2d2d3a !important;
    }
    [data-testid="stSidebar"] > div:first-child {
        background: transparent !important;
    }

    /* Section header */
    .sidebar-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 4px;
        margin-bottom: 8px;
        color: #9ca3af;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .sidebar-count {
        background: rgba(167, 139, 250, 0.2);
        color: #a78bfa;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 10px;
    }

    /* Active chat item */
    .sidebar-chat-active {
        padding: 10px 12px;
        border-radius: 8px;
        border-left: 3px solid #a78bfa;
        background: rgba(167, 139, 250, 0.1);
        color: #ffffff;
        font-weight: 600;
        font-size: 0.88rem;
        margin: 4px 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Sidebar button hover */
    [data-testid="stSidebar"] button {
        transition: all 0.2s ease !important;
        border-radius: 8px !important;
    }
    [data-testid="stSidebar"] button:hover {
        background-color: rgba(167, 139, 250, 0.1) !important;
    }
    </style>
    """, unsafe_allow_html=True)
