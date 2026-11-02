// Screenshots of live mode for the README: the sign-in screen, an invitation email,
// a store manager's reports (only their store) and "No access". Signs in for real,
// with codes read from the local email catcher (Mailpit). Needs the database and
// live mode running:
//   npm run db:start && npm run db:reset && npm run dev:live &
//   npm run screenshots:live
//   npm run db:reset        (it invites someone; this puts the demo back)
import { chromium } from 'playwright-core'

const BASE = process.env.LIVE_URL ?? 'http://127.0.0.1:10014/'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55324'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--mute-audio'] })

const newest = async (to) => (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()).messages[0]?.ID
async function mail(to, notId) {
  for (let i = 0; i < 40; i++) {
    const id = await newest(to)
    if (id && id !== notId) return { id, code: (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).HTML.match(/<strong>(\d{6})<\/strong>/)[1] }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email for ${to}`)
}
async function page(width = 1360, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.goto(BASE)
  return p
}
async function signIn(email, opts) {
  const p = await page(opts?.width, opts?.height)
  const before = await newest(email)
  await p.getByLabel('Work email').fill(email)
  await p.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await p.getByLabel('Code').fill((await mail(email, before)).code)
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(2500)
  return p
}

// The sign-in screen, with the code step showing.
{
  const p = await page(1000, 640)
  await p.getByLabel('Work email').fill('lena@lanternlane.test')
  await p.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await p.getByLabel('Code').waitFor()
  await p.screenshot({ path: `${OUT}/live-1-signin.png` })
  await p.context().close()
}

// Lena's scorecard: Riverside only. (Supabase sends one email per person per second.)
await new Promise((r) => setTimeout(r, 1200))
const lena = await signIn('lena@lanternlane.test', { height: 760 })
await lena.waitForSelector('table.data')
await lena.screenshot({ path: `${OUT}/live-2-manager.png` })

// Lena invites a rep; the invitation email as it arrives.
await lena.getByRole('navigation', { name: 'Manager screens' }).getByRole('button', { name: 'Accounts' }).click()
await lena.getByLabel('Name').fill('Jordan Reyes')
await lena.getByLabel('Work email').fill('jordan@lanternlane.test')
await lena.getByRole('button', { name: 'Send invitation' }).click()
const invite = await mail('jordan@lanternlane.test')
{
  const p = await page(820, 520)
  await p.goto(`${MAILPIT}/view/${invite.id}.html`)
  await p.screenshot({ path: `${OUT}/live-3-invitation.png` })
  await p.context().close()
}
await lena.context().close()

// Owen, whose access is off.
const owen = await signIn('owen@lanternlane.test', { width: 1000, height: 560 })
await owen.screenshot({ path: `${OUT}/live-4-no-access.png` })

await browser.close()
console.log('live screenshots written to', OUT, '(run `npm run db:reset` to put the demo back)')
