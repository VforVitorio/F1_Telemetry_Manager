/**
 * Dev-only screenshot tool for visual verification (not part of the app build).
 * Usage: node scripts/shot.mjs [url] [out.png]
 * Needs Playwright + a chromium build available (global install or ms-playwright
 * cache). Run against `vite preview` (built dist) or the dev server.
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4173/'
const out = process.argv[3] ?? 'shot.png'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500) // let self-hosted fonts settle
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log('shot ->', out)
