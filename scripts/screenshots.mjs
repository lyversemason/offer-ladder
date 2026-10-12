// Regenerates the README screenshots from a running preview server.
//   npm run build && npm run preview &
//   npm run screenshots
// Uses the system Chromium (set CHROMIUM_PATH to override).

import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:10004/'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--mute-audio'] })

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

async function manager(name, tab, before, opts = {}) {
  const m = await open(opts.width ?? 1360, opts.height ?? 900, 'manager')
  await m.waitForSelector('.report table', { timeout: 20000 })
  if (tab) await m.getByRole('button', { name: tab, exact: true }).click()
  if (before) await before(m)
  await m.waitForTimeout(250)
  await m.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false })
  await m.context().close()
}

await manager('5-reports', null, async (m) => m.getByRole('button', { name: /Tier mix/ }).click())
await manager('6-show-sql', null, async (m) => m.getByRole('button', { name: 'Show the SQL' }).click())
await manager('7-import', 'Catalog import', async (m) => m.getByRole('button', { name: 'Use the sample sheet' }).click(), { height: 1500 })
await manager('8-rules', 'Rules', async (m) => {
  const top = m.getByLabel('Top rate')
  await top.fill('13')
  await top.press('Enter')
  await m.evaluate(() => window.scrollTo(0, 0))
})
await manager('9-query-lab', 'Query lab', async (m) => m.getByRole('button', { name: 'Best-selling mattresses' }).click(), { height: 820 })

await browser.close()
console.log('screenshots written to', OUT)
