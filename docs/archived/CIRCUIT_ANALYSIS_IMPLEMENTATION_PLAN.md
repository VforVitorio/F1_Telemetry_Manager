# Circuit Domination + Telemetry Graphs Implementation Plan

## Objective
Implement 8 telemetry visualizations:
1. **CIRCUIT DOMINATION** (microsector visualization)
2. **SPEED** (velocity)
3. **DELTA(s)** (time difference)
4. **Throttle(%)** (accelerator)
5. **Brake** (braking)
6. **RPM** (revolutions)
7. **Gear** (transmission)
8. **DRS** (DRS activation status)

---

## Implementation Status

**Status**: ✅ Complete (v1.0 - November 2024)

All 8 visualizations have been implemented and are functional in the dashboard.

---

## File Structure

```
frontend/components/telemetry/
├── circuit_analysis.py          ✅ IMPLEMENTED (microsector domination)
├── speed_graph.py               ✅ IMPLEMENTED
├── delta_graph.py               ✅ IMPLEMENTED
├── throttle_graph.py            ✅ IMPLEMENTED
├── brake_graph.py               ✅ IMPLEMENTED
├── rpm_graph.py                 ✅ IMPLEMENTED
├── gear_graph.py                ✅ IMPLEMENTED
├── drs_graph.py                 ✅ IMPLEMENTED
└── __init__.py                  ✅ UPDATED (exports all functions)
```

---

## Component Pattern

Each graph file follows this standard pattern:

```python
# Example: speed_graph.py

import streamlit as st
import plotly.graph_objects as go
from app.styles import Color, TextColor, Font, FontSize

# 1. PUBLIC FUNCTION (called from dashboard)
def render_speed_graph(telemetry_data, selected_drivers, color_palette):
    """Renders the speed graph"""
    _render_section_title()
    fig = _create_speed_figure(telemetry_data, selected_drivers, color_palette)
    st.plotly_chart(fig, use_container_width=True)

# 2. PRIVATE FUNCTION: Title
def _render_section_title() -> None:
    st.markdown("<h3 style='text-align: center;'>SPEED</h3>",
                unsafe_allow_html=True)

# 3. PRIVATE FUNCTION: Create Plotly figure
def _create_speed_figure(data, drivers, colors):
    fig = go.Figure()

    # Add line for each driver
    for idx, driver in enumerate(drivers):
        driver_data = data[data['driver'] == driver]
        fig.add_trace(go.Scatter(
            x=driver_data['distance'],  # Track distance
            y=driver_data['speed'],     # Speed
            name=driver,
            line=dict(color=colors[idx], width=2)
        ))

    # Layout configuration (dark theme)
    fig.update_layout(
        template="plotly_dark",
        xaxis_title="Distance (m)",
        yaxis_title="Speed (km/h)",
        height=400,
        margin=dict(l=40, r=40, t=40, b=40),
        plot_bgcolor=Color.PRIMARY_BG,
        paper_bgcolor=Color.PRIMARY_BG
    )

    return fig
```

---

## Dashboard Integration

Updated `frontend/pages/dashboard.py`:

```python
# IMPORTS
from components.telemetry.circuit_analysis import render_circuit_analysis_section
from components.telemetry.speed_graph import render_speed_graph
from components.telemetry.delta_graph import render_delta_graph
from components.telemetry.throttle_graph import render_throttle_graph
from components.telemetry.brake_graph import render_brake_graph
from components.telemetry.rpm_graph import render_rpm_graph
from components.telemetry.gear_graph import render_gear_graph
from components.telemetry.drs_graph import render_drs_graph

# WITHIN render_dashboard():
def render_dashboard():
    render_header()

    # Data selectors
    year, gp, session, drivers, colors = render_data_selectors()

    # Fetch telemetry data from backend
    telemetry_data = fetch_telemetry_data(year, gp, session, drivers)

    # Lap graph (already implemented)
    render_lap_graph(drivers, colors)

    # CIRCUIT DOMINATION
    render_circuit_analysis_section(telemetry_data, drivers, colors)

    # OTHER GRAPHS (7 graphs in 2 columns)
    col1, col2 = st.columns(2)
    with col1:
        render_speed_graph(telemetry_data, drivers, colors)
        render_throttle_graph(telemetry_data, drivers, colors)
        render_rpm_graph(telemetry_data, drivers, colors)
        render_drs_graph(telemetry_data, drivers, colors)

    with col2:
        render_delta_graph(telemetry_data, drivers, colors)
        render_brake_graph(telemetry_data, drivers, colors)
        render_gear_graph(telemetry_data, drivers, colors)
```

---

## Telemetry Data Structure

All graphs receive the same 3 parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `telemetry_data` | `pd.DataFrame` | Telemetry data (from FastF1 via backend) |
| `selected_drivers` | `List[str]` | List of driver codes e.g. `['VER', 'HAM']` |
| `color_palette` | `List[str]` | Colors for each driver e.g. `['#A259F7', '#00B4D8']` |

**DataFrame `telemetry_data` structure:**
```python
{
    'driver': str,           # 'VER', 'HAM', etc.
    'lap': int,             # Lap number
    'distance': float,      # Distance in meters (0 to ~5000)
    'speed': float,         # Speed in km/h
    'throttle': float,      # Throttle 0-100%
    'brake': float,         # Brake 0-100%
    'rpm': int,             # Engine RPM
    'gear': int,            # Gear 1-8
    'drs': int,             # DRS: 0=closed, >0=open
    'time': float,          # Time in seconds from lap start
    'x': float,             # Circuit X coordinate
    'y': float              # Circuit Y coordinate
}
```

---

## Graph Specifications

### 1. CIRCUIT DOMINATION (circuit_analysis.py)
- **Type**: 2D circuit visualization with microsector coloring
- **X Axis**: Circuit X coordinate
- **Y Axis**: Circuit Y coordinate
- **Visual**: Circuit segments colored by fastest driver in each microsector
- **Status**: ✅ Implemented (v1.0)
- **Note**: Animated orb visualization planned for v2.0

### 2. SPEED (speed_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: Speed (km/h)
- **Type**: Lines (go.Scatter)
- **Status**: ✅ Implemented (v1.0)

### 3. DELTA(s) (delta_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: Time delta (seconds, relative to fastest driver)
- **Type**: Lines with filled area (go.Scatter with fill)
- **Status**: ✅ Implemented (v1.0)

### 4. Throttle(%) (throttle_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: Throttle (0-100%)
- **Type**: Filled area (go.Scatter with fill='tozeroy')
- **Status**: ✅ Implemented (v1.0)

### 5. Brake (brake_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: Brake (0-100% or boolean)
- **Type**: Filled area (similar to throttle)
- **Status**: ✅ Implemented (v1.0)

### 6. RPM (rpm_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: RPM (revolutions)
- **Type**: Lines
- **Status**: ✅ Implemented (v1.0)

### 7. Gear (gear_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: Gear (1-8)
- **Type**: Step plot (stepped lines)
- **Status**: ✅ Implemented (v1.0)

### 8. DRS (drs_graph.py)
- **X Axis**: Distance (meters)
- **Y Axis**: DRS status (0 or 1)
- **Type**: Horizontal bars or filled area where DRS is active
- **Status**: ✅ Implemented (v1.0)

---

## Integration Flow

```
1. User selects data
   └── render_data_selectors() in dashboard.py
       └── Returns: year, gp, session, drivers, colors

2. Backend fetches telemetry
   └── fetch_telemetry_data(year, gp, session, drivers)
       └── Returns: DataFrame with all data

3. Components are called in sequence
   ├── render_circuit_analysis_section(data, drivers, colors)
   ├── render_speed_graph(data, drivers, colors)
   ├── render_delta_graph(data, drivers, colors)
   ├── render_throttle_graph(data, drivers, colors)
   ├── render_brake_graph(data, drivers, colors)
   ├── render_rpm_graph(data, drivers, colors)
   ├── render_gear_graph(data, drivers, colors)
   └── render_drs_graph(data, drivers, colors)

4. Each component:
   ├── Creates its Plotly figure
   ├── Styles with dark theme
   └── Renders with st.plotly_chart()
```

---

## Project Architecture

### General Structure
```
F1_Telemetry_Manager/
├── backend/
│   ├── api/v1/endpoints/        # API route handlers
│   ├── core/                    # Config, security, database
│   ├── models/                  # Pydantic DTOs (request/response)
│   ├── schemas/                 # Database schemas
│   ├── services/                # Business logic (feature-based)
│   ├── repositories/            # Data access layer
│   └── utils/                   # Helpers
├── frontend/
│   ├── app/                     # Entry point (main.py, styles.py)
│   ├── pages/                   # Streamlit pages (dashboard.py)
│   ├── components/              # Reusable UI components (feature-based)
│   │   ├── auth/
│   │   ├── chatbot/
│   │   ├── common/
│   │   ├── comparison/
│   │   ├── layout/              # navbar.py
│   │   └── telemetry/           # circuit_analysis.py + 7 graphs
│   ├── services/                # API clients for backend
│   └── utils/                   # Frontend helpers
├── shared/                      # Constants, types shared between frontend/backend
├── data/                        # Sample scripts (get_session_info.py)
├── docs/                        # Documentation
└── tests/                       # Unit and integration tests
```

### Component Pattern

All components follow this pattern:

1. **Public main function** - `render_<name>()`
   - Called from pages
   - Orchestrates subfunctions
   - Returns `None` (side effects with Streamlit)

2. **Private functions** - `_render_<part>()`
   - Prefix `_` for internal use
   - Each handles a specific element
   - Clear separation of responsibilities

3. **Consistent styling**
   - Import from `app.styles` (Color, TextColor, Font, FontSize)
   - Dark theme with `plotly_dark`
   - Custom CSS via `st.markdown(..., unsafe_allow_html=True)`

### Color System

```python
# Global (styles.py)
Color.ACCENT = "#a78bfa"           # Purple (primary brand)
Color.PRIMARY_BG = "#121127"       # Dark background
Color.SECONDARY_BG = "#1e1b4b"     # Lighter
Color.CONTENT_BG = "#181633"       # Content boxes

# Per driver (color_palette)
['#A259F7', '#00B4D8', '#43FF64']  # Purple, Blue, Green
```

### Key Dependencies

**Frontend:**
- `plotly==5.18.0` - Visualizations
- `streamlit>=1.31.0` - UI framework
- `pandas==2.1.0` - Data manipulation

**Backend:**
- `fastapi==0.109.0` - API
- `fastf1` - F1 telemetry
- `supabase==2.10.0` - Database

---

## Implementation Summary

| Step | Action | Status |
|------|--------|--------|
| 1 | Create 7 new graph files | ✅ Complete |
| 2 | Update circuit_analysis.py | ✅ Complete |
| 3 | Update dashboard.py imports and calls | ✅ Complete |
| 4 | Export functions in __init__.py | ✅ Complete |
| 5 | Implement telemetry endpoint | ✅ Complete |
| 6 | Add telemetry service | ✅ Complete |
| 7 | Test and adjust styles | ✅ Complete |

---

## v2.0 Planned Features

The following features are planned for future releases:

- **Animated Circuit Visualization**: Orb-style animation showing car position in real-time
- **Interactive Controls**: Play/pause, speed control for circuit animation
- **Enhanced Data Export**: Additional export formats (Excel, Parquet)
- **Multi-driver Comparison**: Support for 3+ drivers simultaneously
- **Custom Chart Templates**: User-defined visualization templates

---

**Developed for**: F1 Telemetry Manager
**Version**: 1.0
**Status**: Complete (November 2024)
