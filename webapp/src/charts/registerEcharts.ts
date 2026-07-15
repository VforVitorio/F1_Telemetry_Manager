import * as echarts from 'echarts'
import { useUiStore } from '@/stores/ui'
import { buildEchartsTheme, F1_LIGHT_THEME, F1_THEME } from './echartsTheme'

let registered = false

/** Register both F1 ECharts themes once (idempotent) — dark (`F1_THEME`) and
 *  light (`F1_LIGHT_THEME`). Call before mounting the first chart so every
 *  chart can pick either theme by name (see `useChartTheme`). */
export function registerF1Theme(): void {
  if (registered) return
  echarts.registerTheme(F1_THEME, buildEchartsTheme('dark'))
  echarts.registerTheme(F1_LIGHT_THEME, buildEchartsTheme('light'))
  registered = true
}

/** The registered ECharts theme name matching the app's current light/dark
 *  theme (`stores/ui.ts`), so every chart follows the header toggle. Callers
 *  key their `<ReactECharts>` on this value to force a remount on toggle —
 *  ECharts doesn't hot-swap a theme on an already-mounted instance. */
export function useChartTheme(): string {
  const theme = useUiStore((state) => state.theme)
  return theme === 'light' ? F1_LIGHT_THEME : F1_THEME
}
