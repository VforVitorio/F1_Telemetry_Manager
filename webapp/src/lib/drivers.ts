// Year-aware driver → team colour palette, ported 1:1 from the Streamlit
// original (`frontend/components/common/driver_colors.py`) so the migrated
// charts keep IDENTICAL colours. Each driver gets their team's colour for that
// season (2023-2025 lineups). Keep in sync with the Python source if lineups
// change.
//
// Lives in `src/lib/` (not a feature folder) because two features consume it:
// Dashboard (chart line colours) and Strategy (team-coloured driver / rival
// names). Shared → app-level, so features stay decoupled siblings.

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

// --- Legibility floor ---------------------------------------------------------
// Some real team colours are near-black on the dark UI (Williams #041E42, the
// Red Bull #2 #1B3D8E): fine as a thick chart line, invisible as text or a thin
// swatch. `getDriverTextColor` brightens only those below a luminance threshold,
// so driver NAMES stay team-coloured AND readable. This deviates from strict
// Streamlit parity on purpose (a designed improvement).

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function mixToward([r, g, b]: [number, number, number], target: number, amount: number): string {
  const mix = (c: number) => Math.round(c + (target - c) * amount)
  const toHex = (c: number) => mix(c).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Below this luminance a colour is too dark to read as text on the dark UI.
const TEXT_LUMINANCE_FLOOR = 0.16

/** Team colour for a driver, brightened toward white when too dark to read as text. */
export function getDriverTextColor(code: string, year?: number): string {
  const base = getDriverColor(code, year)
  const rgb = hexToRgb(base)
  if (relativeLuminance(rgb) >= TEXT_LUMINANCE_FLOOR) return base
  return mixToward(rgb, 255, 0.5)
}

// --- Chart/canvas identity colour, theme-aware ------------------------------
// A pilot's raw team colour is used as a thick CHART LINE / canvas dot, not text.
// Some team colours vanish on one theme: Red Bull's dark blue recedes on the dark
// cards (~2.2:1), Mercedes' cyan washes out on the light ones. `resolvePilotColor`
// lifts a too-dark colour toward white on dark, and deepens a too-light colour
// toward ink on light, so BOTH drivers carry equal visual weight in every chart
// (broadcast graphics do the same; the hue identity survives). One helper shared
// by channelOptions.ts and trackDraw.ts so the two never drift.

/** Below this luminance a colour recedes on the dark data cards. */
const CHART_DARK_FLOOR = 0.22
/** Above this luminance a colour washes out on the light data cards. */
const CHART_LIGHT_CEIL = 0.5

/** A pilot's identity colour adjusted for legibility on the given theme's data
 *  surface. Returns the original hex when it already carries enough contrast. */
export function resolvePilotColor(hex: string, theme: 'dark' | 'light'): string {
  const rgb = hexToRgb(hex)
  const lum = relativeLuminance(rgb)
  if (theme === 'dark' && lum < CHART_DARK_FLOOR) return mixToward(rgb, 255, 0.45)
  if (theme === 'light' && lum > CHART_LIGHT_CEIL) return mixToward(rgb, 20, 0.4)
  return hex
}

/** Build a `{ driver: colour }` map for the selected drivers. */
export function driverColorMap(drivers: string[], year?: number): Record<string, string> {
  const map: Record<string, string> = {}
  for (const code of drivers) map[code] = getDriverColor(code, year)
  return map
}
