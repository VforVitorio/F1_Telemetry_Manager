"""
RPM Graph Component

This component renders the Engine RPM graph for selected drivers.

Purpose:
    Show each driver's engine revolutions per minute across the circuit. It helps
    identify areas where RPM peaks occur, gear changes, and engine management techniques.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'rpm'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart (go.Scatter)
    - X axis: Distance on the circuit (meters)
    - Y axis: RPM (revolutions per minute)
    - Typically between 10,000 - 15,000 RPM for modern F1 engines
    - Sharp drops usually indicate gear changes

Public function:
    - render_rpm_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_rpm_figure(data, drivers, colors) -> go.Figure
"""
