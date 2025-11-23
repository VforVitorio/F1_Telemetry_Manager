"""
Ask About This Button Component

Reusable button component for "Ask AI about this" functionality.
Captures charts/graphs as images and navigates to chat with predefined prompts.
"""

import streamlit as st
import plotly.graph_objects as go
from typing import Optional, Dict, Any
from utils.chat_navigation import (
    open_chat_with_image,
    plotly_fig_to_base64,
    build_context_from_session
)


def render_ask_about_button(
    chart_fig: go.Figure,
    chart_type: str,
    prompt_template: str,
    button_label: str = "🤖 Ask AI about this",
    context: Optional[Dict[str, Any]] = None,
    auto_send: bool = True,
    new_chat: bool = False,
    compact: bool = False,
    tooltip: Optional[str] = None
):
    """
    Render an "Ask AI about this" button for a chart.

    When clicked, captures the chart as an image, formats a prompt with context,
    and navigates to the chat page with the image and prompt pre-loaded.

    Args:
        chart_fig: Plotly figure object to capture
        chart_type: Type of chart (e.g., 'speed_graph', 'comparison', 'delta')
        prompt_template: Template string for the prompt (supports {variable} placeholders)
        button_label: Text to display on the button (ignored if compact=True)
        context: Optional context dictionary with F1 session info (year, GP, drivers, etc.)
        auto_send: If True, automatically send the message when chat opens
        new_chat: If True, create a new chat; if False, append to current chat
        compact: If True, render as small icon button (just emoji)
        tooltip: Tooltip text on hover (defaults to "Ask AI about this chart" if compact)

    Example:
        ```python
        # Compact mode (recommended for charts)
        render_ask_about_button(
            chart_fig=speed_fig,
            chart_type="speed_graph",
            prompt_template="Analyze this speed graph for {driver} at {gp}",
            context={"driver": "VER", "gp": "Spanish Grand Prix"},
            compact=True
        )

        # Full button mode
        render_ask_about_button(
            chart_fig=speed_fig,
            chart_type="speed_graph",
            prompt_template="Analyze this speed graph for {driver} at {gp}",
            button_label="🤖 Ask AI about speed data"
        )
        ```
    """
    # Inject CSS for compact button styling
    if compact:
        st.markdown("""
            <style>
            /* Compact AI button styling */
            button[data-testid*="baseButton-secondary"][kind="secondary"] {
                min-height: 32px !important;
                height: 32px !important;
                padding: 4px 8px !important;
                font-size: 1.2rem !important;
            }
            </style>
        """, unsafe_allow_html=True)

        # Use minimal label and tooltip for compact mode
        display_label = "🤖"
        help_text = tooltip or "Ask AI about this chart"
        button_type = "secondary"
    else:
        display_label = button_label
        help_text = tooltip
        button_type = "primary"

    if st.button(
        display_label,
        key=f"ask_ai_{chart_type}",
        help=help_text,
        type=button_type
    ):
        # Convert chart to base64 image
        image_b64 = plotly_fig_to_base64(chart_fig)

        if not image_b64:
            st.error("Failed to capture chart image")
            return

        # Build context if not provided
        if context is None:
            context = build_context_from_session(chart_type)

        # Format prompt with context variables
        try:
            formatted_prompt = prompt_template.format(**context)
        except KeyError as e:
            st.warning(f"Missing context variable: {e}")
            formatted_prompt = prompt_template

        # Navigate to chat with image and prompt
        open_chat_with_image(
            image=image_b64,
            prompt=formatted_prompt,
            chart_type=chart_type,
            context=context,
            auto_send=auto_send,
            new_chat=new_chat
        )


# Predefined prompt templates for common chart types
SPEED_GRAPH_TEMPLATE = """Analyze this speed graph showing {driver_name}'s performance during {session_type} at the {gp_name} ({year}).

Key details:
- Driver: {driver_name} ({team_name})
- Lap: {lap_number}
- Compound: {tyre_compound}

Please analyze:
1. Speed patterns throughout the lap
2. Key braking zones and acceleration points
3. Potential areas for improvement
"""

COMPARISON_TEMPLATE = """Compare the performance of {driver1_name} and {driver2_name} in this telemetry comparison from {session_type} at {gp_name} ({year}).

Drivers:
- {driver1_name}: {driver1_team} - {driver1_lap_time}
- {driver2_name}: {driver2_team} - {driver2_lap_time}
- Delta: {time_delta}

Please analyze:
1. Where each driver gains/loses time
2. Different driving styles or approaches
3. Technical or strategic differences
"""

DELTA_GRAPH_TEMPLATE = """Analyze the delta time graph between {driver1_name} and {driver2_name} at {gp_name} ({year}).

The graph shows the time difference throughout the lap.

Please explain:
1. Which sections each driver dominates
2. The cumulative effect throughout the lap
3. Critical moments where the gap changes significantly
4. Strategic implications of these differences
"""

SECTOR_ANALYSIS_TEMPLATE = """Analyze the sector performance shown in this chart from {session_type} at {gp_name} ({year}).

Please provide:
1. Fastest driver in each sector and why
2. Consistent vs. inconsistent performers
3. Potential setup or strategy differences
4. Overall lap construction analysis
"""

# Circuit domination template
CIRCUIT_DOMINATION_TEMPLATE = """Analyze this circuit domination visualization from {session_type} at {gp_name} ({year}).

The circuit is divided into microsectors, each colored by the driver who was fastest in that section.

Drivers:
{drivers_list}

Please analyze:
1. Which driver dominates which parts of the circuit
2. Strategic or setup implications of these patterns
3. Where each driver gains or loses time relative to others
4. Overall strengths and weaknesses of each driver on this circuit
"""

# Generic telemetry template for throttle, brake, RPM, gear, DRS graphs
TELEMETRY_TEMPLATE = """Analyze this {graph_type} telemetry data for {driver_name} during {session_type} at {gp_name} ({year}).

Key details:
- Driver: {driver_name}
- Lap: {lap_number}
- Session: {session_type}

Please analyze:
1. Key patterns and characteristics in the data
2. Notable sections or zones of interest
3. Potential areas for improvement or optimization
4. How this relates to overall lap performance
"""
