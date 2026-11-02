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
  if (opts.before) await opts.before(p)
  if (tab) await p.getByRole('navigation', { name: 'Rep screens' }).getByRole('button', { name: tab }).click()
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false })
  await p.context().close()
}

// Two offers already made: free delivery and financing, then 15% off the base.
async function twoOffers(p) {
  const delivery = p.getByLabel('Delivery price')
  await delivery.fill('0')
  await delivery.press('Enter')
  await p.locator('.tfoot select').first().selectOption('6')
  await p.getByLabel('Add a discount reason').selectOption('Financing')
  await p.getByRole('button', { name: 'I offered this price' }).click()
  await p.getByRole('button', { name: 'Percent off Cambria Gentle Drift Base' }).click()
  const pct = p.getByLabel('Percent off Cambria Gentle Drift Base')
  await pct.fill('15')
  await pct.press('Enter')
  await p.getByLabel('Add a discount reason').selectOption('Google review')
  await p.getByRole('button', { name: 'I offered this price' }).click()
}

await rep('1-deal', null, { height: 1180, before: twoOffers })
await rep('2-discount', null, {
  height: 1300,
  full: true,
  before: async (p) => {
    await p.getByRole('button', { name: 'Percent off Georgia Golden Prairie Firm Hybrid' }).click()
    const pct = p.getByLabel('Percent off Georgia Golden Prairie Firm Hybrid')
    await pct.fill('10')
    await pct.press('Enter')
    const total = p.getByLabel('New pre-tax total')
    await total.fill('1200')
    await total.press('Enter')
  },
})
await rep('3-iteration', null, {
  height: 900,
  before: async (p) => {
    await twoOffers(p)
    await p.locator('.iteration summary').first().click()
  },
})
await rep('4-phone', null, { width: 400, height: 860 })
await rep('10-gm', 'GM calculator', { height: 760 })
await rep('11-inventory', 'Inventory', { height: 900 })

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
await manager('12-usage', 'Usage', async (m) => m.getByRole('button', { name: /Coverage by rep and month/ }).click(), { height: 980 })
await manager('13-patterns', 'Deal patterns', async (m) => m.getByRole('button', { name: /Offers accepted by base discount/ }).click(), { height: 760 })
await manager('14-accounts', 'Accounts', async (m) => {
  await m.getByLabel('Name').fill('Jordan Reyes')
  await m.getByLabel('Work email').fill('jordan@lanternlane.test')
  await m.getByLabel('Invite as').selectOption('rep')
  await m.getByLabel('At store').selectOption('hillcrest')
  await m.getByRole('button', { name: 'Send invitation' }).click()
  await m.waitForTimeout(300)
}, { height: 1150 })
await manager('15-audit', 'Audit log', async (m) => {
  // A rule change and an account change first, so the log shows today's entries too.
  await m.getByRole('button', { name: 'Accounts', exact: true }).click()
  const kevin = m.locator('tr', { hasText: 'kevin@lanternlane.test' })
  await kevin.getByRole('button', { name: 'Turn off access' }).click()
  await kevin.getByRole('button', { name: 'Click again to turn off' }).click()
  await m.waitForTimeout(300)
  await m.getByRole('button', { name: 'Audit log', exact: true }).click()
  await m.waitForTimeout(300)
}, { height: 760 })
await manager('9-query-lab', 'Query lab', async (m) => m.getByRole('button', { name: 'Best-selling mattresses' }).click(), { height: 820 })

await browser.close()
console.log('screenshots written to', OUT)
