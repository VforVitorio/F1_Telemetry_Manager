"""
Speed Graph Component

This component renders the Speed graph for selected drivers.

Purpose:
    Show each driver's speed along the circuit, allowing comparison of
    where each driver reaches higher speeds and in which sections they lose speed.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'speed'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart (go.Scatter)
    - X axis: Distance on the circuit (meters)
    - Y axis: Speed (km/h)
    - One colored line per selected driver

Public function:
    - render_speed_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_speed_figure(data, drivers, colors) -> go.Figure
"""
