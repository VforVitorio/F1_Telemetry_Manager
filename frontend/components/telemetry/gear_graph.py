"""
Gear Graph Component

This component renders the Gear graph for selected drivers.

Purpose:
    Show the gear used by each driver at each point on the circuit. It allows
    comparing gear selection between drivers and identifying differences in driving technique.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'gear'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Step/stairstep chart (go.Scatter with line_shape='hv' or 'vh')
    - X axis: Distance on the circuit (meters)
    - Y axis: Gear number (1-8)
    - Discrete values: 1, 2, 3, 4, 5, 6, 7, 8
    - Horizontal lines with vertical transitions (step plot)

Public function:
    - render_gear_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_gear_figure(data, drivers, colors) -> go.Figure
"""
