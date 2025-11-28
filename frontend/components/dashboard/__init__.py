"""
Dashboard components module.
Contains specialized components for the dashboard page.
"""

from .css_styles import render_custom_css, apply_driver_pill_colors
from .data_selectors import render_data_selectors
from .lap_graph import render_lap_graph, render_control_buttons

__all__ = [
    'render_custom_css',
    'apply_driver_pill_colors',
    'render_data_selectors',
    'render_lap_graph',
    'render_control_buttons',
]
