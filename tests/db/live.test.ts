// Live mode (src/source/live.ts) against the local database: signing in by email
// code (read from the local email catcher), who you turn out to be, and reading
// through the access rules. Saving is in saving.test.ts.
// Needs `npm run db:start` and `npm run db:reset` first.
import { describe, expect, it } from 'vitest'
import { PEOPLE, REPS } from '../../src/data/org'
import { DEFAULT_SETTINGS } from '../../src/data/settings'
import { DEMO_ONLY_MESSAGE, createLive } from '../../src/source/live'
import type { AuthState, Live } from '../../src/source/live'
import { LOCAL_PASSWORD, localApi } from '../../scripts/local-db'

const api = localApi()
const MAILPIT = api.url.replace(':55321', ':55324')
const newLive = () => createLive(api.url, api.anonKey, { browser: false })

/** Waits until sign-in has settled (signed in, or refused). */
function settled(live: Live): Promise<AuthState> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const a = live.auth.get()
      if (a.status === 'ready' || a.status === 'no-access') {
        stop()
        resolve(a)
      }
    }
    const stop = live.auth.subscribe(check)
    setTimeout(() => reject(new Error(`Sign-in didn't settle: ${JSON.stringify(live.auth.get())}`)), 15_000)
    check()
  })
}

async function signInWithPassword(email: string) {
  const live = newLive()
  const { error } = await live.client.auth.signInWithPassword({ email, password: LOCAL_PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return { live, state: await settled(live) }
}

async function latestCode(to: string, notId?: string): Promise<{ id: string; code: string; subject: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const m = messages.find((x) => x.ID !== notId)
    if (m) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML: string }
      return { id: m.ID, code: full.HTML.match(/<strong>(\d{6})<\/strong>/)![1], subject: m.Subject }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email for ${to}`)
}

describe('signing in', () => {
  it('by the 6-digit code from the email', async () => {
    const before = await latestCode('kevin@lanternlane.test').catch(() => null)
    const live = newLive()
    await live.auth.sendCode('kevin@lanternlane.test')
    const mail = await latestCode('kevin@lanternlane.test', before?.id)
    expect(mail.subject).toBe('Your OfferLadder sign-in')
    await live.auth.verifyCode('kevin@lanternlane.test', mail.code)
    const state = await settled(live)
    expect(state).toMatchObject({ status: 'ready', person: { id: 'kevin', role: 'rep', storeId: 'riverside', repId: 'kevin' } })
  })

  it('a wrong code, or an email with no account, is refused in plain words', async () => {
    const live = newLive()
    await expect(live.auth.verifyCode('kevin@lanternlane.test', '000000')).rejects.toThrow(/wrong or has expired/)
    await expect(live.auth.sendCode('stranger@lanternlane.test')).rejects.toThrow(/doesn't have an OfferLadder account/)
  })

  it('someone whose access is off signs in but gets no access, and is told why', async () => {
    const { state } = await signInWithPassword('owen@lanternlane.test')
    expect(state).toEqual({ status: 'no-access', email: 'owen@lanternlane.test', reason: 'off' })
  })

  it('signing out goes back to the sign-in screen', async () => {
    const { live } = await signInWithPassword('tasha@lanternlane.test')
    await live.auth.signOut()
    await new Promise((r) => setTimeout(r, 300))
    expect(live.auth.get()).toEqual({ status: 'signed-out' })
  })
})

describe('reading as the signed-in person', () => {
  it('a store manager gets the catalog, the rules, and reports for their store only', async () => {
    const { live, state } = await signInWithPassword('lena@lanternlane.test')
    expect(state).toMatchObject({ status: 'ready', person: { id: 'lena', role: 'manager' } })
    expect((await live.source.catalog()).length).toBe(239)
    expect(await live.source.settings()).toEqual(DEFAULT_SETTINGS)
    const scorecard = await live.source.runReport('rep-scorecard')
    expect(scorecard.columns.slice(0, 3)).toEqual(['month', 'rep', 'ups'])
    const riverside = REPS.filter((r) => r.storeId === 'riverside').map((r) => r.name)
    expect(new Set(scorecard.rows.map((r) => r[1]))).toEqual(new Set(riverside))
  })

  it('the owner gets every store', async () => {
    const { live } = await signInWithPassword('dana@lanternlane.test')
    const scorecard = await live.source.runReport('rep-scorecard')
    expect(new Set(scorecard.rows.map((r) => r[1])).size).toBe(REPS.length)
  })

  it('the query lab and reset are demo-only, said plainly', async () => {
    const { live } = await signInWithPassword('dana@lanternlane.test')
    await expect(live.source.runQuery('SELECT 1')).rejects.toThrow(DEMO_ONLY_MESSAGE)
    await expect(live.source.reset()).rejects.toThrow(/demo/)
  })

  it('every active person can sign in and lands as themselves', async () => {
    for (const p of PEOPLE.filter((x) => x.status === 'active')) {
      const { state } = await signInWithPassword(p.email)
      expect(state, p.id).toMatchObject({ status: 'ready', person: { id: p.id, role: p.role } })
    }
  })
})
