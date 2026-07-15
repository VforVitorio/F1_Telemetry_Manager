// ECharts theme built from the F1 StratLab brand tokens. Registered once when
// the first chart mounts (issue #34): `echarts.registerTheme(F1_THEME, ...)`.
// Kept as plain objects so #32 does not pull the heavy echarts dep into the
// bundle; #34 imports echarts and this together.
//
// Design: transparent background (charts sit on solid --bg cards), hairline
// grid, blue data ramp + purple accent, JetBrains Mono axis labels, tabular
// figures. Colors are the resolved token hex (a build-time JS module cannot
// read CSS vars); keep them in sync with styles/tokens.css.
//
// Light theme (app-chrome-round2.md item 1(e)): a build-time module can't
// react to the `data-theme` attribute the way CSS vars do, so instead of one
// static theme object we build the theme per mode from two hardcoded
// palettes (dark/light) that mirror tokens.css's `--fg-2/3`, `--divider`,
// `--hairline` swap. The categorical series palette and tyre colors are
// identity colors — unchanged across modes.

export const F1_THEME = 'f1'
export const F1_LIGHT_THEME = 'f1-light'

const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"
const DISPLAY = "'Space Grotesk Variable', system-ui, sans-serif"

// Categorical palette: blue (data) first, then purple accent, then
// compound-ish greens/ambers. Identity colors — same in both themes.
const SERIES_COLORS = ['#3385ff', '#6c5ce7', '#2dd47a', '#ffbd33', '#ff5733', '#60a5fa', '#a29bfe']

interface ThemePalette {
  /** Body/legend text (mirrors tokens.css `--fg-2`). */
  fg2: string
  /** Axis label text (mirrors `--fg-3`). */
  fg3: string
  /** Axis line/tick color (mirrors `--divider`). */
  line: string
  /** Split-line / grid border color (mirrors `--hairline`). */
  hairline: string
  titleColor: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

const DARK_PALETTE: ThemePalette = {
  fg2: 'rgba(255,255,255,0.72)',
  fg3: 'rgba(255,255,255,0.52)',
  line: 'rgba(255,255,255,0.18)',
  hairline: 'rgba(255,255,255,0.06)',
  titleColor: '#ffffff',
  tooltipBg: '#17192b',
  tooltipBorder: 'rgba(255,255,255,0.10)',
  tooltipText: '#ffffff',
}

const LIGHT_PALETTE: ThemePalette = {
  fg2: 'rgba(20,18,31,0.75)',
  fg3: 'rgba(20,18,31,0.58)',
  line: 'rgba(20,18,31,0.18)',
  hairline: 'rgba(20,18,31,0.06)',
  titleColor: '#14121f',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(20,18,31,0.10)',
  tooltipText: '#14121f',
}

/** Shared axis look (category/value/time/log all render the same way here)
 *  for one palette — hairline line/tick, faint split line, mono labels. */
function buildAxisStyle(palette: ThemePalette) {
  return {
    axisLine: { lineStyle: { color: palette.line } },
    axisTick: { lineStyle: { color: palette.line } },
    axisLabel: { color: palette.fg3, fontFamily: MONO },
    splitLine: { lineStyle: { color: palette.hairline } },
  }
}

/** Builds the full ECharts theme object for one app theme mode. A build-time
 *  JS module can't read the `data-theme` CSS variable swap, so this is
 *  called once per mode up front and both results are registered
 *  (`registerEcharts.ts`) — the chart picks one by name via `useChartTheme()`. */
export function buildEchartsTheme(mode: 'dark' | 'light') {
  const palette = mode === 'light' ? LIGHT_PALETTE : DARK_PALETTE
  const axis = buildAxisStyle(palette)
  return {
    color: SERIES_COLORS,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: MONO, color: palette.fg2 },
    title: { textStyle: { color: palette.titleColor, fontFamily: DISPLAY, fontWeight: 600 } },
    legend: { textStyle: { color: palette.fg2, fontFamily: MONO } },
    grid: { borderColor: palette.hairline, containLabel: true },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
    tooltip: {
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText, fontFamily: MONO },
    },
  }
}

// F1 tyre-compound colors for series that encode compound (from tokens).
// Identity colors — unchanged across themes.
export const tireColors: Record<string, string> = {
  SOFT: '#ff2d3a',
  MEDIUM: '#ffcf2d',
  HARD: '#e6e6e6',
  INTERMEDIATE: '#2dd47a',
  WET: '#2d8fff',
}
