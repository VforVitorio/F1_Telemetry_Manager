"""
Chat Sidebar Component

Renders the chat sidebar with chat management functionality.
Allows users to create new chats, load existing chats, and delete the current chat.
"""

import streamlit as st
from utils.chat_state import (
    create_new_chat,
    delete_current_chat,
    load_chat,
    get_saved_chat_names
)
from utils.report_storage import (
    get_all_reports,
    get_report_count,
    delete_report,
    clear_all_reports
)


def render_exported_reports_section():
    """
    Render the exported reports section in the sidebar.

    Shows a list of previously generated reports with download buttons.
    """
    st.markdown("### 📊 Exported Reports")

    reports = get_all_reports()
    report_count = get_report_count()

    if report_count == 0:
        st.info("No reports exported yet")
        return

    # Show count
    st.caption(f"{report_count} report(s) available")

    # Clear all button
    if st.button("🗑️ Clear All Reports", use_container_width=True, key="clear_all_reports"):
        clear_all_reports()
        st.rerun()

    # Use expander to save space
    with st.expander("View Reports", expanded=False):
        # Show reports in reverse order (most recent first)
        for report in reversed(reports):
            with st.container():
                # Header with timestamp and size
                col1, col2 = st.columns([3, 1])
                with col1:
                    timestamp_str = report['timestamp'].strftime('%d/%m %H:%M')
                    st.markdown(f"**{timestamp_str}**")
                    st.caption(f"💬 {report['chat_name']}")
                with col2:
                    st.caption(f"{report['size_kb']} KB")

                # Context info if available
                context = report.get('context', {})
                if context:
                    context_parts = []
                    if context.get('grand_prix'):
                        context_parts.append(context['grand_prix'])
                    if context.get('year'):
                        context_parts.append(str(context['year']))
                    if context_parts:
                        st.caption(f"🏁 {' '.join(context_parts)}")

                # Action buttons
                btn_col1, btn_col2 = st.columns([3, 1])
                with btn_col1:
                    # Download button
                    st.download_button(
                        label="⬇️ Download",
                        data=report['content'],
                        file_name=report['filename'],
                        mime="text/markdown",
                        key=f"download_{report['id']}",
                        use_container_width=True
                    )
                with btn_col2:
                    # Delete button
                    if st.button("🗑️", key=f"delete_{report['id']}", help="Delete this report"):
                        delete_report(report['id'])
                        st.rerun()

                st.divider()


def render_chat_sidebar():
    """
    Render the chat sidebar with chat management (NO model parameters).

    Displays:
    - New chat button
    - List of saved chats with load buttons
    - Current chat highlighting
    - Delete current chat button
    """
    st.markdown("### 💬 Strategy Chats")

    # New chat button
    if st.button("➕ New chat", key="new_chat_btn", use_container_width=True):
        create_new_chat()
        st.rerun()

    # Display saved chats
    chat_names = get_saved_chat_names()
    if chat_names:
        st.markdown("#### Chat history")
        for chat_name in chat_names:
            # Only show button for chats that aren't the current one
            if chat_name != st.session_state.get("current_chat_name", None):
                if st.button(chat_name, key=f"load_{chat_name}", use_container_width=True):
                    load_chat(chat_name)
                    st.rerun()
            else:
                # Highlight the current chat
                st.markdown(
                    f'<div style="background-color: #23234a; padding: 10px; border-radius: 8px; '
                    f'border: 1px solid #a78bfa; margin: 6px 0;">'
                    f'<b>➜ {chat_name}</b></div>',
                    unsafe_allow_html=True
                )

    st.markdown("")  # Spacing

    # Delete button
    if st.button("🗑️ Delete current chat", key="delete_chat_btn", use_container_width=True):
        delete_current_chat()
        st.rerun()

    # Separator
    st.markdown("---")

    # Exported reports section
    render_exported_reports_section()
