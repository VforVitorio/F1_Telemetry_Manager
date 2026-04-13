"""
Chart Styling Components

This module provides reusable styling functions for charts and graphs.
"""


def apply_telemetry_chart_styles() -> str:
    """
    Returns CSS to apply purple border styling to Plotly charts.

    This styling matches the CIRCUIT ANALYSIS box design with:
    - Purple border (2px solid #a78bfa)
    - Rounded corners (12px)
    - Dark background (#181633)
    - Purple shadow effect
    - Proper padding and margins

    Usage:
        from components.common.chart_styles import apply_telemetry_chart_styles

        # Apply styles before rendering telemetry charts
        st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

        # Now all Plotly charts will have the styled border
        st.plotly_chart(fig, use_container_width=True)

    Returns:
        str: CSS markup to be rendered with st.markdown()
    """
    return """
    <style>
    /* Hide scrollbar on the parent wrapper without clipping content */
    div.stElementContainer:has(div[data-testid="stPlotlyChart"]) {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
    }
    div.stElementContainer:has(div[data-testid="stPlotlyChart"])::-webkit-scrollbar {
        display: none !important;
    }

    /* outline instead of border — no extra pixels in the layout */
    div[data-testid="stPlotlyChart"] {
        outline: 2px solid #a78bfa !important;
        outline-offset: -2px !important;
        border-radius: 12px !important;
        background-color: #181633 !important;
        margin: 0 !important;
        box-shadow: 0 4px 12px rgba(167, 139, 250, 0.2) !important;
    }

    /* Ensure the inner Plotly elements also respect the background */
    .js-plotly-plot .plotly,
    .js-plotly-plot .plotly .main-svg {
        background-color: transparent !important;
    }
    </style>
    """
