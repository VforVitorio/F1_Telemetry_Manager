# Circuit Comparison Page - Implementation Plan

## Overview

### Objective
Create a Streamlit page rendering an F1 circuit with 2-driver comparison visualization showing:
1. **Main Circuit** with static display (animated orb visualization planned for v2.0)
2. **Time Delta Graph** - Time difference between drivers throughout the lap
3. **Speed Graph** - Speed comparison
4. **Brake Graph** - Brake pressure comparison
5. **Throttle Graph** - Throttle comparison

### Difference from Circuit Domination
- **Circuit Domination**: Shows microsectors colored by fastest driver in each segment (static visualization)
- **Circuit Comparison**: Shows circuit visualization for 2-driver detailed comparison (v1.0: static, v2.0: animated with orb)

## Implementation Status

**Status**: ✅ Complete (v1.0 - November 2024)

The comparison page is functional with static circuit visualization and 4 comparison graphs. Animated orb visualization is planned for v2.0.

---

## Architecture

### High-Level Flow

```
User selects data
    ↓
[Data Selectors] → Year, GP, Session, Driver 1, Driver 2
    ↓
[Backend API] → GET /api/v1/comparison
    ↓
[FastF1 Data Processing] → Optimize coordinates, synchronize telemetry
    ↓
[Frontend Rendering] → Circuit + 4 graphs
    ↓
[Visualization] → Static display (v1.0)
```

---

## File Structure

### Backend Files (Complete - v1.0)

1. **`backend/api/v1/endpoints/comparison.py`** ✅
   - REST endpoint for comparison data
   - Validates parameters
   - Returns JSON with telemetry for both drivers

2. **`backend/services/comparison_service.py`** ✅
   - Business logic for comparison
   - FastF1 data loading
   - Coordinate optimization functions
   - Telemetry synchronization

### Frontend Files (Complete - v1.0)

1. **`frontend/pages/comparison.py`** ✅
   - Main comparison page
   - Data selectors
   - Component orchestration

2. **`frontend/components/comparison/circuit_comparison.py`** ✅
   - Renders circuit visualization
   - v1.0: Static circuit display
   - v2.0 Planned: Animated orb with trails

3. **`frontend/components/comparison/delta_time_graph.py`** ✅
   - Time delta visualization
   - Shows performance gap throughout lap

4. **`frontend/components/comparison/speed_comparison_graph.py`** ✅
   - Speed comparison chart

5. **`frontend/components/comparison/brake_comparison_graph.py`** ✅
   - Brake pressure comparison

6. **`frontend/components/comparison/throttle_comparison_graph.py`** ✅
   - Throttle application comparison

7. **`frontend/services/telemetry_service.py`** ✅ (Modified)
   - Added `get_comparison_telemetry()` method

---

## API Design

### Endpoint: GET `/api/v1/comparison`

**Request Parameters**:
```
year: int (2018-2024)
gp: str (Grand Prix name)
session: str (FP1, FP2, FP3, Q, R)
driver1: str (3-letter code)
driver2: str (3-letter code)
```

**Response Structure**:
```json
{
  "pilot1": {
    "name": "VER",
    "full_name": "Max Verstappen",
    "team": "Red Bull Racing",
    "color": "#0600EF",
    "lap_time": "1:28.456",
    "x": [0.0, 1.2, 2.5, ...],
    "y": [0.0, 0.5, 1.1, ...],
    "speed": [120.5, 145.2, 167.8, ...],
    "throttle": [0.85, 1.0, 1.0, ...],
    "brake": [0.0, 0.0, 0.0, ...],
    "distance": [0, 5, 10, ...],
    "time": [0.0, 0.12, 0.25, ...]
  },
  "pilot2": { /* same structure */ },
  "circuit": {
    "name": "Suzuka International Racing Course",
    "country": "Japan",
    "length": 5807
  },
  "metadata": {
    "year": 2024,
    "gp": "Japan",
    "session": "Q",
    "optimized_rotation": 45,
    "aspect_ratio": 1.85
  }
}
```

---

## Backend Implementation

### Coordinate Optimization Functions

The following functions optimize circuit layout for better visualization:

**`center_coordinates(x, y)`**
- Centers coordinates around origin (0, 0)
- Subtracts mean from each coordinate

**`rotate_coordinates(x, y, angle_rad)`**
- Applies 2D rotation transformation
- Uses standard rotation matrix

**`calculate_aspect_ratio(x, y)`**
- Calculates width-to-height ratio
- Used to find optimal orientation

**`optimize_track_layout(x, y)`**
- Tests rotations from 0° to 180° in 10° steps
- Finds rotation that maximizes aspect ratio
- Returns optimized coordinates

### Data Processing

1. Load session data from FastF1
2. Get fastest lap for each driver
3. Extract telemetry data
4. Optimize circuit coordinates
5. Synchronize telemetry (ensure same sampling points)
6. Format and return JSON response

---

## Frontend Implementation

### 1. Circuit Comparison Component

**v1.0 Implementation (Current)**:
- Static circuit visualization
- Circuit displayed in neutral color
- Driver names in legend with team colors
- Clean layout with Plotly dark theme

**v2.0 Planned**:
- Animated visualization with orb markers
- Real-time position tracking
- Trail effect showing recent path
- Manual play/pause controls

### 2. Delta Time Graph

Calculates and displays time difference between drivers:

```python
# Calculation
delta = time_driver2 - time_driver1
# Positive: Driver 2 slower (Driver 1 winning)
# Negative: Driver 1 slower (Driver 2 winning)
```

Features:
- Filled area chart
- Horizontal line at y=0 (no difference)
- Color coding based on who's ahead
- Distance on X-axis, delta time on Y-axis

### 3. Speed/Brake/Throttle Comparison Graphs

All follow the same pattern:
- Two lines (one per driver) with team colors
- Distance on X-axis
- Metric value on Y-axis
- Legend showing driver names
- Dark theme matching app design

---

## Technical Details

### FastF1 Sector Times

FastF1 provides sector times directly:
- `Sector1Time`: Sector 1 time (pandas.Timedelta)
- `Sector2Time`: Sector 2 time (pandas.Timedelta)
- `Sector3Time`: Sector 3 time (pandas.Timedelta)
- `LapTime`: Total lap time (pandas.Timedelta)

Example usage:
```python
laps = session.laps.pick_driver('VER')
fastest = laps.pick_fastest()
s1_seconds = fastest['Sector1Time'].total_seconds()
```

### Data Synchronization

Both drivers' telemetry must have matching distance points:
- Use interpolation for alignment
- Typically resample to 1000 points per lap
- Ensures accurate delta calculations

### Performance Optimization

- Cache FastF1 data
- Minimize frontend rerenders
- Use appropriate data resolution (not all telemetry points needed)
- Efficient Plotly configurations

---

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API endpoint | ✅ Complete | `/api/v1/comparison` |
| Coordinate optimization | ✅ Complete | Imported from original analysis |
| Frontend comparison page | ✅ Complete | Full 2-driver comparison |
| Circuit visualization | ✅ Complete | v1.0: Static display |
| Delta time graph | ✅ Complete | Time gap analysis |
| Speed comparison | ✅ Complete | Speed vs distance |
| Brake comparison | ✅ Complete | Brake pressure analysis |
| Throttle comparison | ✅ Complete | Throttle application |
| Data synchronization | ✅ Complete | Interpolated alignment |

---

## v2.0 Planned Features

The following features are planned for future releases:

### Animated Circuit Visualization
- **Animated markers**: Two colored markers (one per driver) moving along circuit
- **Trail effect**: Recent path visualization following each marker
- **Manual controls**: Play/pause buttons, progress slider
- **Frame-by-frame animation**: Using Plotly frames
- **Color coding**: Team colors for each driver's marker and trail

### Implementation Options (v2.0)
1. **Plotly Frames**: Built-in animation support
2. **Custom Streamlit Component**: React-based with enhanced interactivity
3. **Three.js Integration**: 3D circuit visualization (advanced)

### Additional v2.0 Features
- Multi-driver comparison (3+ drivers)
- Custom metric selection
- Sector-by-sector detailed breakdown
- Export comparison reports
- Video export of animated circuit

---

## Data Flow

```
1. User Selection
   └── comparison.py: Year, GP, Session, Driver1, Driver2

2. API Call
   └── telemetry_service.get_comparison_telemetry()
       └── GET /api/v1/comparison

3. Backend Processing
   ├── Load FastF1 session data
   ├── Get fastest laps for both drivers
   ├── Extract telemetry
   ├── Optimize coordinates (center, rotate, scale)
   └── Synchronize data points

4. Frontend Rendering
   ├── circuit_comparison.py (static circuit)
   ├── delta_time_graph.py (time gap)
   ├── speed_comparison_graph.py (speed)
   ├── brake_comparison_graph.py (braking)
   └── throttle_comparison_graph.py (throttle)
```

---

**Developed for**: F1 Telemetry Manager
**Version**: 1.0
**Status**: Complete (November 2024)
**v2.0 Planned**: Animated circuit visualization with orb markers and trails
