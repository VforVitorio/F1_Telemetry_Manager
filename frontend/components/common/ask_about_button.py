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
    new_chat: bool = False
):
    """
    Render an "Ask AI about this" button for a chart.

    When clicked, captures the chart as an image, formats a prompt with context,
    and navigates to the chat page with the image and prompt pre-loaded.

    Args:
        chart_fig: Plotly figure object to capture
        chart_type: Type of chart (e.g., 'speed_graph', 'comparison', 'delta')
        prompt_template: Template string for the prompt (supports {variable} placeholders)
        button_label: Text to display on the button
        context: Optional context dictionary with F1 session info (year, GP, drivers, etc.)
        auto_send: If True, automatically send the message when chat opens
        new_chat: If True, create a new chat; if False, append to current chat

    Example:
        ```python
        render_ask_about_button(
            chart_fig=speed_fig,
            chart_type="speed_graph",
            prompt_template="Analyze this speed graph for {driver} at {gp}",
            context={"driver": "VER", "gp": "Spanish Grand Prix"}
        )
        ```
    """
    if st.button(button_label, key=f"ask_ai_{chart_type}"):
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
