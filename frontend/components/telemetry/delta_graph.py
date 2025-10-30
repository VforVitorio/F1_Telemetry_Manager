"""
Delta Graph Component

This component renders the Time Difference (Delta) graph between drivers.

Purpose:
    Display the accumulated time difference relative to the fastest driver at each
    point on the circuit. It helps identify where a driver gains or loses time.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'time'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Line chart with filled area (go.Scatter with fill)
    - X axis: Distance on the circuit (meters)
    - Y axis: Time delta (seconds, relative to the fastest driver)
    - Negative values indicate faster than the reference
    - Positive values indicate slower than the reference

Public function:
    - render_delta_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _calculate_deltas(data, drivers) -> pd.DataFrame
    - _create_delta_figure(data, drivers, colors) -> go.Figure
"""
