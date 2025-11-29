"""
Report Storage Utility

Manages the storage and retrieval of exported reports in session state.
"""

import streamlit as st
from datetime import datetime
from typing import Optional, Dict, Any, List


def initialize_reports_storage():
    """Initialize the reports storage in session state if not exists."""
    if 'exported_reports' not in st.session_state:
        st.session_state['exported_reports'] = []


def save_report(
    content: str,
    filename: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Save a generated report to the session state.

    Args:
        content: Report content in Markdown format
        filename: Filename for the report
        context: Optional F1 session context (year, GP, session, drivers)

    Returns:
        The saved report dictionary
    """
    initialize_reports_storage()

    # Create report metadata
    report = {
        'id': f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        'filename': filename,
        'content': content,
        'timestamp': datetime.now(),
        'size_kb': round(len(content) / 1024, 2),
        'chat_name': st.session_state.get('current_chat_name', 'Unnamed Chat'),
        'context': context or {}
    }

    # Add to reports list
    st.session_state['exported_reports'].append(report)

    # Limit to last 20 reports to avoid memory issues
    if len(st.session_state['exported_reports']) > 20:
        st.session_state['exported_reports'] = st.session_state['exported_reports'][-20:]

    return report


def get_all_reports() -> List[Dict[str, Any]]:
    """
    Get all exported reports.

    Returns:
        List of report dictionaries
    """
    initialize_reports_storage()
    return st.session_state['exported_reports']


def delete_report(report_id: str) -> bool:
    """
    Delete a report by ID.

    Args:
        report_id: The ID of the report to delete

    Returns:
        True if deleted, False if not found
    """
    initialize_reports_storage()
    reports = st.session_state['exported_reports']

    for i, report in enumerate(reports):
        if report['id'] == report_id:
            del st.session_state['exported_reports'][i]
            return True

    return False


def clear_all_reports():
    """Clear all exported reports."""
    st.session_state['exported_reports'] = []


def get_report_count() -> int:
    """
    Get the count of exported reports.

    Returns:
        Number of reports
    """
    initialize_reports_storage()
    return len(st.session_state['exported_reports'])
