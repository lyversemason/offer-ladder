// Regenerates the README screenshots from a running preview server.
//   npm run build && npm run preview &
//   npm run screenshots
// Uses the system Chromium (set CHROMIUM_PATH to override).

import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:10004/'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' })

async function open(width = 1360, height = 900, role = 'rep') {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.goto(BASE)
  await p.evaluate((r) => localStorage.setItem('offerladder:prefs:v1', JSON.stringify({ role: r, repId: 'tasha', guide: false })), role)
  await p.reload()
  return p
}

async function rep(name, tab, opts = {}) {
  const p = await open(opts.width, opts.height)
  await p.getByRole('button', { name: 'Load sample deal' }).click()
  if (tab) await p.getByRole('button', { name: tab }).click()
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false })
  await p.context().close()
}

await rep('1-deal', null, { height: 1000 })
await rep('2-ladder', 'Offer ladder', { height: 1080 })
await rep('3-target', 'Target a tier', { height: 1000 })
await rep('4-phone', null, { width: 400, height: 860 })

const m = await open(1360, 900, 'manager')
await m.screenshot({ path: `${OUT}/5-rules.png` })
await m.context().close()

await browser.close()
console.log('screenshots written to', OUT)
