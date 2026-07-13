import * as echarts from 'echarts'
import { echartsTheme, F1_THEME } from './echartsTheme'

let registered = false

/** Register the F1 ECharts theme once (idempotent). Call before mounting the
 *  first chart so every chart inherits the token theme. */
export function registerF1Theme(): void {
  if (registered) return
  echarts.registerTheme(F1_THEME, echartsTheme)
  registered = true
}
