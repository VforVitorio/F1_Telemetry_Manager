// ECharts theme built from the F1 StratLab brand tokens. Registered once when
// the first chart mounts (issue #34): `echarts.registerTheme(F1_THEME, echartsTheme)`.
// Kept as a plain object so #32 does not pull the heavy echarts dep into the
// bundle; #34 imports echarts and this together.
//
// Design: transparent background (charts sit on solid --bg cards), hairline
// grid, blue data ramp + purple accent, JetBrains Mono axis labels, tabular
// figures. Colors are the resolved token hex (a build-time JS module cannot read
// CSS vars); keep them in sync with styles/tokens.css.

export const F1_THEME = 'f1'

const FG_2 = 'rgba(255,255,255,0.72)'
const FG_3 = 'rgba(255,255,255,0.52)'
const LINE = 'rgba(255,255,255,0.18)'
const HAIRLINE = 'rgba(255,255,255,0.06)'
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace"
const DISPLAY = "'Space Grotesk Variable', system-ui, sans-serif"

const axis = {
  axisLine: { lineStyle: { color: LINE } },
  axisTick: { lineStyle: { color: LINE } },
  axisLabel: { color: FG_3, fontFamily: MONO },
  splitLine: { lineStyle: { color: HAIRLINE } },
}

export const echartsTheme = {
  // Categorical palette: blue (data) first, then purple accent, then compound-ish greens/ambers.
  color: ['#3385ff', '#6c5ce7', '#2dd47a', '#ffbd33', '#ff5733', '#60a5fa', '#a29bfe'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: MONO, color: FG_2 },
  title: { textStyle: { color: '#ffffff', fontFamily: DISPLAY, fontWeight: 600 } },
  legend: { textStyle: { color: FG_2, fontFamily: MONO } },
  grid: { borderColor: HAIRLINE, containLabel: true },
  categoryAxis: axis,
  valueAxis: axis,
  timeAxis: axis,
  logAxis: axis,
  tooltip: {
    backgroundColor: '#17192b',
    borderColor: 'rgba(255,255,255,0.10)',
    textStyle: { color: '#ffffff', fontFamily: MONO },
  },
}

// F1 tyre-compound colors for series that encode compound (from tokens).
export const tireColors: Record<string, string> = {
  SOFT: '#ff2d3a',
  MEDIUM: '#ffcf2d',
  HARD: '#e6e6e6',
  INTERMEDIATE: '#2dd47a',
  WET: '#2d8fff',
}
