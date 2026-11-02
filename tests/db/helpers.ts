// Shared by the database tests: signing in (by password, or by the emailed code
// read from the local email catcher), waiting for sign-in to settle.
import { createDatabase, seedCatalog } from '../../src/db/database'
import { createLive } from '../../src/source/live'
import type { AuthState, Live } from '../../src/source/live'
import { LOCAL_PASSWORD, localApi } from '../../scripts/local-db'
import { loadSql } from '../sqljs'

export const api = localApi()
export const MAILPIT = api.url.replace(':55321', ':55324')

export const newLive = () =>
  createLive(api.url, api.anonKey, {
    browser: false,
    workspace: async (products) => {
      const ws = createDatabase(await loadSql())
      seedCatalog(ws, products)
      return ws
    },
  })

/** Waits until sign-in has settled (signed in, or refused). */
export function settled(live: Live): Promise<AuthState> {
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

export async function signInWithPassword(who: string) {
  const live = newLive()
  const { error } = await live.client.auth.signInWithPassword({ email: `${who}@lanternlane.test`, password: LOCAL_PASSWORD })
  if (error) throw new Error(`${who}: ${error.message}`)
  return { live, state: await settled(live) }
}

/** The newest email to someone (waiting for one that isn't `notId`). */
export async function latestMail(to: string, notId?: string): Promise<{ id: string; subject: string; html: string; code: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const m = messages.find((x) => x.ID !== notId)
    if (m && (!notId || m.ID !== notId)) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML: string }
      return { id: m.ID, subject: m.Subject, html: full.HTML, code: full.HTML.match(/<strong>(\d{6})<\/strong>/)?.[1] ?? '' }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email for ${to}`)
}

/** The id of the newest email to someone, if any. */
export async function lastMailId(to: string): Promise<string | undefined> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  return ((await res.json()) as { messages: { ID: string }[] }).messages[0]?.ID
}

/** Signs in the way a person does: email, then the code from the email that arrives. */
export async function signInByCode(email: string) {
  const before = await lastMailId(email)
  const live = newLive()
  await live.auth.sendCode(email)
  const mail = await latestMail(email, before)
  await live.auth.verifyCode(email, mail.code)
  return { live, state: await settled(live), mail }
}
