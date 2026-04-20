"""
Centered title helper for Streamlit pages.

Replaces the repeated ``st.markdown("<h1 style='text-align: center;'>…</h1>",
unsafe_allow_html=True)`` pattern that every page header copied into its
own ``render_header()`` function. Keeps the ``unsafe_allow_html`` flag
contained here so reviewers only have to audit one place when the
styling changes.
"""

from __future__ import annotations

import streamlit as st


def render_centered_title(
    text: str,
    *,
    level: int = 1,
    margin_bottom: str | None = None,
) -> None:
    """Render a centered heading with the project's default style.

    ``text`` is HTML-escaped by Streamlit's markdown renderer as long as
    the caller passes a plain string (no HTML entities). ``level``
    chooses the heading tag (``h1`` through ``h6``). ``margin_bottom``
    passes through to the inline style when the caller needs a tighter
    layout under the title (e.g., the chat page stacks a subtitle
    immediately below)."""
    tag = f"h{max(1, min(level, 6))}"
    style = "text-align: center;"
    if margin_bottom is not None:
        style += f" margin-bottom: {margin_bottom};"
    st.markdown(
        f"<{tag} style='{style}'>{text}</{tag}>",
        unsafe_allow_html=True,
    )
