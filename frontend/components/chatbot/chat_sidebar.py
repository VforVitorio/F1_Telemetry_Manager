"""
Chat Sidebar — Compact chat management panel.

Tight layout: new chat + delete as icon row, chat history as a scrollable
list with active highlight, reports in a collapsed expander.
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
    """Render the full chat sidebar."""
    _render_action_row()
    _render_chat_list()
    st.divider()
    _render_reports_section()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _render_action_row() -> None:
    """New chat + delete current in a compact row."""
    c1, c2 = st.columns(2)
    with c1:
        if st.button(
            ":material/add: New",
            key="new_chat_btn",
            use_container_width=True,
        ):
            create_new_chat()
            st.rerun()
    with c2:
        if st.button(
            ":material/delete: Delete",
            key="delete_chat_btn",
            use_container_width=True,
        ):
            delete_current_chat()
            st.rerun()


def _render_chat_list() -> None:
    """Scrollable list of saved chats with active highlight."""
    chat_names = get_saved_chat_names()
    if not chat_names:
        st.caption("No saved chats yet.")
        return

    st.caption(f"History ({len(chat_names)})")

    current = st.session_state.get("current_chat_name")
    for name in chat_names:
        if name == current:
            st.markdown(
                f'<div style="background:#23234a; padding:8px 12px; border-radius:6px; '
                f'border-left:3px solid #a78bfa; margin:4px 0; font-size:0.85rem; '
                f'font-weight:600; color:#a78bfa;">{name}</div>',
                unsafe_allow_html=True,
            )
        else:
            if st.button(name, key=f"load_{name}", use_container_width=True):
                load_chat(name)
                st.rerun()


def _render_reports_section() -> None:
    """Exported reports in a collapsed expander."""
    report_count = get_report_count()

    with st.expander(
        f":material/description: Reports ({report_count})",
        expanded=False,
    ):
        if report_count == 0:
            st.caption("No reports yet.")
            return

        if st.button(":material/delete_sweep: Clear all", key="clear_all_reports", use_container_width=True):
            clear_all_reports()
            st.rerun()

        reports = get_all_reports()
        for report in reversed(reports):
            _render_report_item(report)


def _render_report_item(report: dict) -> None:
    """Single report row: timestamp + download + delete."""
    ts = report["timestamp"].strftime("%d/%m %H:%M")
    chat = report.get("chat_name", "")

    c1, c2 = st.columns([4, 1])
    with c1:
        st.download_button(
            label=f"{ts} — {chat}",
            data=report["content"],
            file_name=report["filename"],
            mime="text/markdown",
            key=f"dl_{report['id']}",
            use_container_width=True,
        )
    with c2:
        if st.button(":material/close:", key=f"del_{report['id']}", help="Delete"):
            delete_report(report["id"])
            st.rerun()
