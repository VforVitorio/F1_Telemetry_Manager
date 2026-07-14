// Year-aware driver → team colour palette, ported 1:1 from the Streamlit
// original (`frontend/components/common/driver_colors.py`) so the migrated
// charts keep IDENTICAL colours. Each driver gets their team's colour for that
// season (2023-2025 lineups). Keep in sync with the Python source if lineups
// change.

const RED_BULL = '#3671C6'
const RED_BULL_2 = '#1B3D8E'
const FERRARI = '#E8002D'
const FERRARI_2 = '#A30000'
const MERCEDES = '#27F4D2'
const MERCEDES_2 = '#6CD3BF'
const MCLAREN = '#FF8700'
const MCLAREN_2 = '#FFB347'
const ASTON = '#229971'
const ASTON_2 = '#2BA572'
const ALPINE_PINK = '#FF87BC'
const ALPINE_PINK_2 = '#FFC0E3'
const ALPINE_BLUE = '#0093CC'
const ALPINE_BLUE_2 = '#00B0F0'
const WILLIAMS = '#041E42'
const WILLIAMS_2 = '#64C4FF'
const RB = '#6692FF'
const RB_2 = '#4682B4'
const SAUBER = '#52E252'
const SAUBER_2 = '#00E701'
const HAAS = '#B6BABD'
const HAAS_2 = '#787878'

/** Fallback colour for a driver absent from the season map. */
export const DEFAULT_DRIVER_COLOR = '#A259F7'

const DRIVER_COLORS_BY_YEAR: Record<number, Record<string, string>> = {
  2025: {
    VER: RED_BULL,
    LAW: RED_BULL_2,
    LEC: FERRARI,
    HAM: FERRARI_2,
    RUS: MERCEDES,
    ANT: MERCEDES_2,
    NOR: MCLAREN,
    PIA: MCLAREN_2,
    ALO: ASTON,
    STR: ASTON_2,
    GAS: ALPINE_BLUE,
    DOO: ALPINE_BLUE_2,
    ALB: WILLIAMS_2,
    SAI: WILLIAMS,
    TSU: RB,
    HAD: RB_2,
    HUL: SAUBER,
    BOR: SAUBER_2,
    OCO: HAAS,
    BEA: HAAS_2,
  },
  2024: {
    VER: RED_BULL,
    PER: RED_BULL_2,
    LEC: FERRARI,
    SAI: FERRARI_2,
    HAM: MERCEDES,
    RUS: MERCEDES_2,
    NOR: MCLAREN,
    PIA: MCLAREN_2,
    ALO: ASTON,
    STR: ASTON_2,
    GAS: ALPINE_PINK,
    OCO: ALPINE_PINK_2,
    ALB: WILLIAMS_2,
    SAR: WILLIAMS,
    COL: WILLIAMS,
    TSU: RB,
    RIC: '#F5F5F5',
    LAW: RB_2,
    BOT: SAUBER,
    ZHO: SAUBER_2,
    MAG: HAAS_2,
    HUL: HAAS,
    BEA: HAAS,
  },
  2023: {
    VER: RED_BULL,
    PER: RED_BULL_2,
    LEC: FERRARI,
    SAI: FERRARI_2,
    HAM: MERCEDES,
    RUS: MERCEDES_2,
    NOR: MCLAREN,
    PIA: MCLAREN_2,
    ALO: ASTON,
    STR: ASTON_2,
    GAS: ALPINE_PINK,
    OCO: ALPINE_PINK_2,
    ALB: WILLIAMS_2,
    SAR: WILLIAMS,
    TSU: RB,
    RIC: '#F5F5F5',
    LAW: RB_2,
    BOT: SAUBER,
    ZHO: SAUBER_2,
    MAG: HAAS_2,
    HUL: HAAS,
  },
}

// Flat fallback = 2025 colours (mirrors the Python `DRIVER_COLORS`).
const DRIVER_COLORS_FLAT = DRIVER_COLORS_BY_YEAR[2025]

/**
 * Team colour for a driver in a given season.
 * @param code Three-letter driver code (case-insensitive).
 * @param year Season year; when omitted uses the flat 2025 fallback.
 */
export function getDriverColor(code: string, year?: number): string {
  const key = code.toUpperCase()
  if (year && DRIVER_COLORS_BY_YEAR[year]) {
    return DRIVER_COLORS_BY_YEAR[year][key] ?? DEFAULT_DRIVER_COLOR
  }
  return DRIVER_COLORS_FLAT[key] ?? DEFAULT_DRIVER_COLOR
}

/** Build a `{ driver: colour }` map for the selected drivers. */
export function driverColorMap(drivers: string[], year?: number): Record<string, string> {
  const map: Record<string, string> = {}
  for (const code of drivers) map[code] = getDriverColor(code, year)
  return map
}
