"""
Throttle Graph Component

This component renders the Throttle graph for selected drivers.

Purpose:
    Show the throttle percentage applied by each driver along the circuit. It allows
    analyzing full-throttle zones, partial-throttle zones, and coasting sections.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'throttle'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Filled area chart (go.Scatter with fill='tozeroy')
    - X axis: Distance on the circuit (meters)
    - Y axis: Throttle (0-100%)
    - 100% = full throttle
    - 0% = no throttle
    - Filled area from 0 up to the throttle value

Public function:
    - render_throttle_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _create_throttle_figure(data, drivers, colors) -> go.Figure

TODO: Backend integration
    - FastF1 method: session.laps.pick_driver(driver).get_telemetry()
    - Required column: 'Throttle' (0-100%)
"""
