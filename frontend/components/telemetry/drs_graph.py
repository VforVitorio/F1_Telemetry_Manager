"""
DRS Graph Component

This component renders the DRS (Drag Reduction System) graph for selected drivers.

Purpose:
    Show the areas where each driver activates DRS (reducing aerodynamic drag). It
    helps identify circuit DRS zones and compare DRS usage between drivers.

Required data:
    - telemetry_data: DataFrame with columns 'driver', 'distance', 'drs'
    - selected_drivers: List of driver codes (e.g., ['VER', 'HAM', 'LEC'])
    - color_palette: List of colors for each driver

Visualization:
    - Type: Area chart or horizontal bars (go.Scatter with fill or go.Bar)
    - X axis: Distance on the circuit (meters)
    - Y axis: DRS state (0 = closed, >0 or 1 = open)
    - FastF1 values:
      * 0-7: DRS closed
      * 8-14: DRS open
    - Can be binarized: 0 = closed, 1 = open
    - Filled area indicates zones with active DRS

Public function:
    - render_drs_graph(telemetry_data, selected_drivers, color_palette) -> None

Private functions:
    - _render_section_title() -> None
    - _process_drs_data(data) -> pd.DataFrame
    - _create_drs_figure(data, drivers, colors) -> go.Figure
"""
