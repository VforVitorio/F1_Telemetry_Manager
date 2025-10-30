"""
Brake Graph Component

This component renders the Brake graph for selected drivers.

Purpose:
    Show each driver's braking zones across the circuit. It helps identify
    brake points, braking intensity, and compare braking techniques between drivers.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'brake'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Filled area chart (go.Scatter with fill='tozeroy')
    - X axis: Distance on the circuit (meters)
    - Y axis: Brake (0-100% or boolean 0/1 depending on FastF1 data)
    - Filled area indicates zones where brakes are applied
    - Height indicates braking intensity

Public function:
    - render_brake_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_brake_figure(data, drivers, colors) -> go.Figure
"""
