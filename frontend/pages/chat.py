"""
AI Chat Page

Interactive chat interface for F1 telemetry analysis using LLM.
Supports text and multimodal interactions, chat history management,
and context-aware responses.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

# Standard library imports
import threading
import uuid
import streamlit as st
from typing import Any, Optional

try:
    # Streamlit ≥ 1.30 exposes the script-run context helper here.  We use it
    # so a background thread can keep updating an st.status label without
    # tripping the "Thread missing ScriptRunContext" warning.
    from streamlit.runtime.scriptrunner import add_script_run_ctx
except ImportError:  # pragma: no cover — older Streamlit fallback
    def add_script_run_ctx(thread):  # type: ignore[misc]
        return thread

# Friendly labels for the backend stages emitted by /chat/status.  The map
# keeps Streamlit's spinner in lock-step with what the backend is actually
# doing — model loading, tool execution, LLM summary — instead of rotating
# through fake placeholders.
_STAGE_LABELS = {
    "extracting_intent": "Reading the message and detecting intent...",
    "classifying_query": "Classifying the type of question...",
    "loading_models": "Loading ML models (first run can take a moment)...",
    "calling_predict_pace": "Calling the pace prediction model...",
    "calling_predict_tire": "Calling the tyre degradation model...",
    "calling_predict_pit": "Calling the pit-stop strategy model...",
    "calling_predict_situation": "Calling the race situation model...",
    "calling_recommend_strategy": "Running the full strategy orchestrator (5 agents + LLM)...",
    "calling_query_regulations": "Searching the FIA regulations index...",
    "calling_compare_drivers": "Fetching telemetry and computing the head-to-head...",
    "calling_get_telemetry": "Fetching the telemetry trace from FastF1...",
    "calling_get_lap_times": "Fetching lap times from FastF1...",
    "calling_get_race_data": "Fetching the race overview from FastF1...",
    "calling_analyze_radio": "Running NLP on the team radio...",
    "calling_list_gps": "Listing available Grand Prix...",
    "calling_list_drivers": "Listing drivers for that GP...",
    "calling_get_lap_range": "Looking up the lap range...",
    "summarizing_with_llm": "Composing the response with the LLM...",
}


def _humanize_stage(stage: str) -> str:
    """Map a backend stage key to a human-friendly spinner label.

    Falls back to a sentence-cased version of unknown keys so new stages
    surface readably without crashing the UI.
    """
    if not stage:
        return "Working on your request..."
    if stage in _STAGE_LABELS:
        return _STAGE_LABELS[stage]
    return stage.replace("_", " ").capitalize() + "..."


def _set_chat_stop_flag() -> None:
    """Stop button callback — sets the abort flag the stream consumer polls.

    Lives at module scope so Streamlit can pin it to the button via
    ``on_click`` (callbacks defined inside other functions get re-created
    every rerun and lose their click registration).
    """
    st.session_state["chat_should_stop"] = True


def _render_stop_button(request_id: str) -> None:
    """Render the Stop button inside the live status block.

    The button writes ``chat_should_stop=True`` into session state via its
    ``on_click`` callback; the stream consumer checks that flag between
    SSE events and breaks out of the loop, persisting whatever text it
    already received with a ``[stopped]`` marker.  In Streamlit a click
    only takes effect when the script yields control to the event loop —
    every ``placeholder.markdown`` update during streaming is one such
    yield, so the button is best-effort but works in practice for any
    response longer than a couple of chunks.
    """
    st.button(
        "⏹ Stop",
        key=f"chat_stop_btn_{request_id}",
        on_click=_set_chat_stop_flag,
        type="secondary",
        help="Interrupt the model and keep the partial response so far.",
    )


def _start_status_poller(status, request_id: str, stop_event: threading.Event) -> threading.Thread:
    """Spawn a daemon thread that mirrors the backend stage in *status*.

    Polls ``/chat/status`` once per second; whenever the backend reports
    a new stage we humanise it and push it as the spinner label.  Stops
    cleanly when *stop_event* is set by the main thread once the request
    finishes.  Errors are swallowed so a transient network blip cannot
    crash the page.
    """
    from services.chat_service import get_chat_status

    def _poll_loop():
        last_stage = None
        while not stop_event.wait(1.0):
            try:
                stage = get_chat_status(request_id)
            except Exception:
                continue
            if not stage or stage == last_stage:
                continue
            last_stage = stage
            try:
                status.update(label=_humanize_stage(stage))
            except Exception:
                break

    thread = threading.Thread(target=_poll_loop, daemon=True)
    add_script_run_ctx(thread)
    thread.start()
    return thread

# Local imports
from utils.chat_state import (
    initialize_chat_state,
    add_message,
    get_chat_history,
    save_current_chat,
    create_new_chat,
)
from utils.chat_navigation import clear_pending_message
from utils.report_storage import save_report

# Component imports
from components.chatbot.chat_sidebar import render_chat_sidebar
from components.chatbot.chat_history import render_chat_history
from components.chatbot.chat_input import render_chat_input
from components.voice.voice_chat import render_voice_chat
from components.layout.titles import render_centered_title

# Service imports
from services.chat_service import check_lm_studio_health, generate_report

# Default model configuration (hidden from user)
DEFAULT_MODEL = "llama3.2-vision"
DEFAULT_TEMPERATURE = 0.1  # Low temperature for high confidence in F1 domain


def initialize_chat_mode():
    """Initialize chat mode (text or voice)."""
    if 'chat_mode' not in st.session_state:
        st.session_state.chat_mode = "text"  # Default to text mode


def render_header():
    """Display page header — mode toggle moved to sidebar."""
    render_centered_title("F1 Strategy Chat", margin_bottom="0")


def handle_pending_message():
    """
    Check for and process pending messages from other pages.
    This happens when user clicks "Ask AI about this" from dashboard/comparison.

    Note: This function does NOT send messages synchronously during page load
    to avoid freezing the UI. Instead, it prepares the message and sets a flag
    for deferred sending after the UI renders.
    """
    if 'chat_pending_message' not in st.session_state:
        return

    pending = st.session_state['chat_pending_message']

    # Create new chat if requested
    if pending.get('new_chat', False):
        create_new_chat(context=pending.get('context'))

    # Prepare message text and image
    message_text = pending.get('prompt') or pending.get('text', '')
    image_base64 = pending.get('image')

    # If auto-send is requested, set a flag for deferred sending
    # This avoids blocking the page load with a synchronous LLM call
    if pending.get('auto_send', False):
        # Convert base64 image to bytes if present
        import base64
        image_bytes = None
        if image_base64:
            try:
                # Remove data URI prefix if present before decoding
                if image_base64.startswith('data:image'):
                    image_base64 = image_base64.split(',', 1)[1]
                image_bytes = base64.b64decode(image_base64)
            except Exception as e:
                st.error(f"Error decoding image: {e}")

        # Clear pending message before sending (to avoid loops)
        clear_pending_message()

        # Send the message automatically with processing indicator
        with st.spinner("🔄 Processing chart analysis request..."):
            handle_send_message(message_text, image_bytes)
        return  # Don't rerun here, handle_send_message will do it

    # If not auto-sending, just add to history for display
    if image_base64:
        add_message("user", "image", image_base64)

    if message_text:
        add_message("user", "text", message_text)

    # Clear the pending message
    clear_pending_message()

    # Rerun to show the new messages
    st.rerun()


def handle_send_message(text: str, image: Optional[str]):
    """
    Handle sending a message to the LLM.

    Args:
        text: User message text
        image: Optional image in base64 data URI format (string)
    """
    # Validate input
    if not text.strip() and image is None:
        st.warning("⚠️ Please enter a message or upload an image.")
        return

    # Store image to send (before adding to history)
    image_to_send = image

    # Add user messages to history
    if text.strip():
        add_message("user", "text", text)
    if image is not None:
        # Convert bytes to base64 for storage in history
        import base64
        if isinstance(image, bytes):
            image_b64 = base64.b64encode(image).decode('utf-8')
            add_message("user", "image", image_b64)
        else:
            add_message("user", "image", image)

    # Set streaming state
    st.session_state.chat_streaming = True

    try:
        history, context = _prepare_send_context(text, image)
        if image_to_send is None:
            image_to_send = _last_user_image(history)

        request_id = st.session_state.get("chat_current_request_id") or str(uuid.uuid4())
        stream_placeholder = st.session_state.pop("chat_stream_placeholder", None)
        _consume_stream_into_history(
            text=text,
            image=image_to_send,
            history=history,
            context=context,
            request_id=request_id,
            placeholder=stream_placeholder,
        )

    except Exception as e:
        st.error(f"Error communicating with LM Studio: {e}")
        add_message("assistant", "text", f"Error: {str(e)}")

    finally:
        st.session_state.chat_streaming = False
        st.session_state.chat_input_key += 1
        save_current_chat()


def _prepare_send_context(text: str, image: Optional[Any]):
    """Build the (history, context) tuple to send with the message.

    Excludes the user message(s) we just appended so the backend does not
    receive its own input duplicated, and pulls F1 context from session
    state when available.
    """
    num_messages_added = (1 if text.strip() else 0) + (1 if image else 0)
    full_history = get_chat_history()
    history = full_history[:-num_messages_added] if num_messages_added > 0 else full_history
    context = getattr(st.session_state, "chat_context", {}) or {}
    return history, context


def _last_user_image(history) -> Optional[Any]:
    """Return the most recent user image in *history*, or None.

    Lets the LLM keep "seeing" a previously uploaded screenshot when the
    user follows up with text-only messages about it.
    """
    for msg in reversed(history):
        if msg.get("role") == "user" and msg.get("type") == "image":
            return msg.get("content")
    return None


def _consume_stream_into_history(text, image, history, context, request_id, placeholder):
    """Stream the tool-aware response into *placeholder* and persist final state.

    Live tokens land in the placeholder so the user sees the reply
    materialise in real time (Claude / ChatGPT feel), then the finalised
    text and any structured tool_result are pushed into the chat history
    so they render properly on the next Streamlit rerun.

    Honours ``st.session_state.chat_should_stop`` between events: when the
    user clicks the Stop button the flag is set, we break out of the loop,
    persist whatever text we already received, and tag it with a brief
    ``[stopped]`` marker so the chat history reflects that the response
    was interrupted on purpose rather than by an error.
    """
    from services.chat_service import stream_tool_message

    accumulated = ""
    tool_result = None
    stopped = False
    for event_type, payload in stream_tool_message(
        text=text,
        request_id=request_id,
        image=image,
        chat_history=history,
        context=context,
        model=DEFAULT_MODEL,
        temperature=DEFAULT_TEMPERATURE,
    ):
        if st.session_state.get("chat_should_stop"):
            stopped = True
            break
        if event_type == "token":
            accumulated += payload.get("token", "")
            if placeholder is not None:
                placeholder.markdown(accumulated)
        elif event_type == "tool_result":
            tool_result = payload.get("tool_result")
        elif event_type == "done":
            break

    if stopped:
        accumulated = (accumulated or "").rstrip() + "\n\n_[Response stopped by user]_"

    # Defensive: if the backend produced neither text nor a structured
    # tool result we still need to put SOMETHING in the chat so the user
    # is not left staring at a blank bubble after a 200 OK.  This covers
    # silent SSE parsing failures, empty LLM summaries that slipped past
    # the backend fallback, and any other "everything worked but nothing
    # showed" edge case.
    if not accumulated and not tool_result:
        accumulated = (
            "_(No response received from the backend. Check the docker logs "
            "for the chat container — the request returned 200 but the SSE "
            "stream was empty.)_"
        )

    if accumulated:
        add_message("assistant", "text", accumulated)
    if tool_result:
        add_message("assistant", "tool_result", tool_result)
    st.session_state["chat_should_stop"] = False


def check_lm_studio_connection():
    """
    Check if LM Studio is accessible.

    Returns:
        bool: True if connected, False otherwise
    """
    return check_lm_studio_health()


def render_report_button():
    """Render the report download button."""
    chat_history = get_chat_history()

    # Only show if there's chat history with at least 2 messages (user + assistant)
    if len(chat_history) >= 2:
        col1, col2, col3 = st.columns([2, 1, 2])
        with col2:
            if st.button("📄 Download Report", use_container_width=True, type="secondary"):
                with st.spinner("Generating report..."):
                    # Get context if available
                    context = st.session_state.get('chat_context', {})

                    # Generate report
                    report_content = generate_report(
                        chat_history=chat_history,
                        context=context
                    )

                    if report_content:
                        # Prepare filename
                        from datetime import datetime
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        filename = f"f1_chat_report_{timestamp}.md"

                        # Save report to storage for sidebar access
                        save_report(
                            content=report_content,
                            filename=filename,
                            context=context
                        )

                        # Show download button
                        st.download_button(
                            label="⬇️ Download Markdown Report",
                            data=report_content,
                            file_name=filename,
                            mime="text/markdown",
                            use_container_width=True,
                            key=f"download_{timestamp}"
                        )
                        st.success("✅ Report generated successfully!")


def render_chat_page():
    """
    Main chat page rendering function.
    Orchestrates all chat components and handles user interactions.
    """
    # Initialize chat mode
    initialize_chat_mode()

    # Initialize chat state
    initialize_chat_state()

    # Check for pending messages from other pages
    handle_pending_message()

    # Render header with mode toggle
    render_header()

    # Check current mode and render accordingly
    if st.session_state.chat_mode == "voice":
        # Voice Chat Mode
        render_voice_chat()
    else:
        # Text Chat Mode (original functionality)
        # Check LLM connection (LM Studio or OpenAI depending on backend config)
        if not check_lm_studio_connection():
            st.warning(
                ":material/warning: LLM service not reachable. "
                "Chat may not work until the backend connects to LM Studio or OpenAI. "
                "Check backend logs for details."
            )

        # Sidebar with chat management (NO model parameters)
        with st.sidebar:
            render_chat_sidebar()

        # Main content area
        # Report download button (appears when there's chat history)
        render_report_button()

        # Chat history (scrollable area)
        render_chat_history()

        # Input area (fixed at bottom visually)
        st.markdown("<div style='margin-top: 8px;'></div>",
                    unsafe_allow_html=True)
        # Check for pending text from example prompt clicks
        pending = st.session_state.pop("chat_pending_text", None)
        if pending:
            with st.spinner("Running analysis..."):
                handle_send_message(pending, None)
            st.rerun()

        text, image, send_clicked = render_chat_input()

        if send_clicked:
            # Smart spinner + live token streaming + Stop button.  We mint a
            # request_id the backend echoes via /chat/status, a daemon
            # thread polls that endpoint every second and pushes the real
            # backend stage as the spinner label, the assistant's response
            # materialises in `stream_placeholder` token-by-token, and the
            # Stop button toggles a session-state flag the stream consumer
            # checks between SSE events to abort early.
            st.session_state["chat_should_stop"] = False
            request_id = str(uuid.uuid4())
            st.session_state.chat_current_request_id = request_id
            with st.status("Reading the message...", expanded=True) as status:
                _render_stop_button(request_id)
                stream_placeholder = st.empty()
                st.session_state.chat_stream_placeholder = stream_placeholder
                stop_event = threading.Event()

                poller = _start_status_poller(status, request_id, stop_event)
                try:
                    handle_send_message(text, image)
                finally:
                    stop_event.set()
                    poller.join(timeout=0.5)
                    st.session_state.pop("chat_current_request_id", None)
                final_label = "Stopped" if st.session_state.get("chat_should_stop") else "Done"
                status.update(label=final_label, state="complete")
            st.rerun()

        # Show streaming indicator if active
        if st.session_state.get('chat_streaming', False):
            with st.spinner("🤖 Assistant is generating response..."):
                st.empty()  # Placeholder to keep spinner visible

        # Handle deferred auto-send (after UI is rendered)
        # This is triggered when user clicks "Ask AI" button from other pages
        if st.session_state.get('pending_auto_send'):
            auto_send_data = st.session_state.pending_auto_send
            del st.session_state.pending_auto_send  # Clear flag

            # Show info message
            st.info("🤖 Analyzing the chart with vision model...")

            # Send the message now that UI is rendered
            handle_send_message(
                text=auto_send_data.get('text', ''),
                image=auto_send_data.get('image')
            )
            st.rerun()


# Entry point
if __name__ == "__main__":
    render_chat_page()
