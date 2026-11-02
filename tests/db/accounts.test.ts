// Accounts and the audit log in live mode: inviting by email (a real invitation
// read from the local email catcher), accepting on first sign-in, invitations
// expiring, turning access off and on, role changes, the guard rails, and who can
// read the audit log. Puts the database back as it was afterwards.
// Needs `npm run db:start` and `npm run db:reset` first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { connectLocal } from '../../scripts/local-db'
import { api, lastMailId, latestMail, newLive, settled, signInWithPassword } from './helpers'

/** Signs in with the code from an email that already arrived (an invitation carries one). */
async function signInWithCode(email: string, code: string) {
  const live = newLive()
  await live.auth.verifyCode(email, code)
  return { live, state: await settled(live) }
}

let db: pg.Client
let before: { audit: number; profiles: Record<string, unknown>[]; reps: string[] }

beforeAll(async () => {
  db = await connectLocal()
  before = {
    audit: Number((await db.query('SELECT COALESCE(MAX(id), 0) AS n FROM audit_log')).rows[0].n),
    profiles: (await db.query('SELECT * FROM profiles')).rows,
    reps: (await db.query('SELECT id FROM reps')).rows.map((r) => r.id),
  }
})

afterAll(async () => {
  // Back to the untouched demo. Only the database owner can do this, and only by
  // switching the "never deleted" and "add-only" guards off for this one transaction.
  const added = (await db.query('SELECT id, auth_user_id FROM profiles WHERE NOT (id = ANY($1))', [before.profiles.map((p) => p.id)])).rows
  await db.query('BEGIN')
  await db.query('ALTER TABLE profiles DISABLE TRIGGER profiles_no_delete')
  await db.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_add_only')
  await db.query('DELETE FROM audit_log WHERE id > $1', [before.audit])
  await db.query('DELETE FROM profiles WHERE NOT (id = ANY($1))', [before.profiles.map((p) => p.id)])
  await db.query('DELETE FROM reps WHERE NOT (id = ANY($1))', [before.reps])
  await db.query(
    `UPDATE profiles p SET role = b.role, store_id = b.store_id, status = b.status, invited_at = b.invited_at,
       activated_at = b.activated_at, turned_off_at = b.turned_off_at, turned_off_by = b.turned_off_by
     FROM json_populate_recordset(NULL::profiles, $1) b WHERE b.id = p.id`,
    [JSON.stringify(before.profiles)],
  )
  await db.query('ALTER TABLE profiles ENABLE TRIGGER profiles_no_delete')
  await db.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_add_only')
  await db.query('COMMIT')
  for (const p of added) {
    await fetch(`${api.url}/auth/v1/admin/users/${p.auth_user_id}`, { method: 'DELETE', headers: { apikey: api.serviceKey, Authorization: `Bearer ${api.serviceKey}` } })
  }
  await db.end()
})

const profile = async (id: string) => (await db.query('SELECT * FROM profiles WHERE id = $1', [id])).rows[0]
const lastAudit = async () => (await db.query('SELECT actor_id, action, target_id, detail FROM audit_log ORDER BY id DESC LIMIT 1')).rows[0]

describe('inviting someone', () => {
  it('a store manager invites a rep; the invitation email arrives; their first sign-in accepts it', async () => {
    const { live: lena } = await signInWithPassword('lena')
    const res = await lena.source.accountAction({ type: 'invite', name: 'Jordan Reyes', email: 'jordan@lanternlane.test', role: 'rep', storeId: 'riverside' })
    expect(res.message).toBe('Invitation sent to Jordan Reyes (jordan@lanternlane.test).')
    const mail = await latestMail('jordan@lanternlane.test')
    expect(mail.subject).toBe('You’re invited to OfferLadder')
    expect(mail.html).toContain('Lena Hart invited you')
    expect(await profile('jordan')).toMatchObject({ status: 'invited', invited_by: 'lena', role: 'rep', store_id: 'riverside', rep_id: 'jordan' })
    expect(await lastAudit()).toMatchObject({ actor_id: 'lena', action: 'invited', target_id: 'jordan' })

    // They sign in with the code in the invitation itself.
    const { live: jordan, state } = await signInWithCode('jordan@lanternlane.test', mail.code)
    expect(state).toMatchObject({ status: 'ready', person: { id: 'jordan', role: 'rep', storeId: 'riverside' } })
    expect(await profile('jordan')).toMatchObject({ status: 'active' })
    expect(await lastAudit()).toMatchObject({ actor_id: 'jordan', action: 'invite_accepted', target_id: 'jordan' })
    expect((await jordan.source.runReport('rep-scorecard')).rows).toEqual([]) // a new rep has no history yet
    expect((await lena.source.people()).find((p) => p.id === 'jordan')?.status).toBe('active')
  })

  it('a store manager can only invite reps to their own store', async () => {
    const { live: lena } = await signInWithPassword('lena')
    await expect(lena.source.accountAction({ type: 'invite', name: 'Sam Ito', email: 'sam@lanternlane.test', role: 'rep', storeId: 'hillcrest' })).rejects.toThrow(/their own store/)
    await expect(lena.source.accountAction({ type: 'invite', name: 'Sam Ito', email: 'sam@lanternlane.test', role: 'manager', storeId: 'riverside' })).rejects.toThrow(/only invite reps/)
    const { live: tasha } = await signInWithPassword('tasha')
    await expect(tasha.source.accountAction({ type: 'invite', name: 'Sam Ito', email: 'sam@lanternlane.test', role: 'rep', storeId: 'riverside' })).rejects.toThrow(/can’t invite/)
  })

  it('an invitation expires after 7 days; sending it again lets them in', async () => {
    const { live: dana } = await signInWithPassword('dana')
    await dana.source.accountAction({ type: 'invite', name: 'Pat Morgan', email: 'pat@lanternlane.test', role: 'manager', storeId: 'hillcrest' })
    const invitation = await latestMail('pat@lanternlane.test')
    await db.query("UPDATE profiles SET invited_at = now() - interval '8 days' WHERE id = 'pat'")
    const first = await signInWithCode('pat@lanternlane.test', invitation.code)
    expect(first.state).toEqual({ status: 'no-access', email: 'pat@lanternlane.test', reason: 'expired' })
    await new Promise((r) => setTimeout(r, 1100)) // Supabase sends one email per person per second
    await dana.source.accountAction({ type: 'resend', id: 'pat' })
    const resent = await latestMail('pat@lanternlane.test', invitation.id)
    expect(resent.subject).toBe('You’re invited to OfferLadder')
    const again = await signInWithCode('pat@lanternlane.test', resent.code)
    expect(again.state).toMatchObject({ status: 'ready', person: { id: 'pat', role: 'manager' } })
  })

  it('a cancelled invitation turns the account off', async () => {
    const { live: dana } = await signInWithPassword('dana')
    await dana.source.accountAction({ type: 'invite', name: 'Lee Park', email: 'lee@lanternlane.test', role: 'rep', storeId: 'hillcrest' })
    await dana.source.accountAction({ type: 'cancel', id: 'lee' })
    expect(await profile('lee')).toMatchObject({ status: 'off', turned_off_by: 'dana' })
  })
})

describe('turning access off and on', () => {
  it('works at once: a rep turned off reads nothing, even while signed in; turned back on, everything is there', async () => {
    const { live: kevin } = await signInWithPassword('kevin')
    expect((await kevin.source.runReport('rep-scorecard')).rows.length).toBeGreaterThan(0)
    const { live: lena } = await signInWithPassword('lena')
    expect((await lena.source.accountAction({ type: 'turnOff', id: 'kevin' })).message).toMatch(/access is off/)
    expect((await kevin.source.runReport('rep-scorecard')).rows).toEqual([])
    expect((await signInWithPassword('kevin')).state).toEqual({ status: 'no-access', email: 'kevin@lanternlane.test', reason: 'off' })
    await lena.source.accountAction({ type: 'turnOn', id: 'kevin' })
    expect((await kevin.source.runReport('rep-scorecard')).rows.length).toBeGreaterThan(0)
  })

  it('two changes to the same person at the same moment: one is saved, the other refused, one audit entry', async () => {
    const { live: lena } = await signInWithPassword('lena')
    const { live: dana } = await signInWithPassword('dana')
    const auditBefore = Number((await db.query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'turned_off' AND target_id = 'renee'")).rows[0].n)
    const results = await Promise.allSettled([lena.source.accountAction({ type: 'turnOff', id: 'renee' }), dana.source.accountAction({ type: 'turnOff', id: 'renee' })])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refusal = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(String(refusal.reason)).toMatch(/a moment ago|isn’t on/)
    expect(Number((await db.query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'turned_off' AND target_id = 'renee'")).rows[0].n)).toBe(auditBefore + 1)
    await dana.source.accountAction({ type: 'turnOn', id: 'renee' })
  })

  it('a store manager can’t touch another store’s people or other managers', async () => {
    const { live: lena } = await signInWithPassword('lena')
    await expect(lena.source.accountAction({ type: 'turnOff', id: 'ben' })).rejects.toThrow(/can’t manage/)
    await expect(lena.source.accountAction({ type: 'turnOff', id: 'marisol' })).rejects.toThrow(/can’t manage/)
  })

  it('guard rails: the owner can’t turn herself off or change her own role', async () => {
    const { live: dana } = await signInWithPassword('dana')
    await expect(dana.source.accountAction({ type: 'turnOff', id: 'dana' })).rejects.toThrow(/your own access/)
    await expect(dana.source.accountAction({ type: 'changeAccess', id: 'dana', role: 'manager', storeId: 'riverside' })).rejects.toThrow(/your own role/)
  })
})

describe('roles and the audit log', () => {
  it('an admin changes a role, which takes effect at once and is logged with before and after', async () => {
    const { live: dana } = await signInWithPassword('dana')
    await dana.source.accountAction({ type: 'changeAccess', id: 'marisol', role: 'admin', storeId: null })
    expect(await lastAudit()).toMatchObject({ actor_id: 'dana', action: 'access_changed', target_id: 'marisol', detail: { before: { role: 'manager', storeId: 'hillcrest' }, after: { role: 'admin', storeId: null } } })
    const { live: marisol } = await signInWithPassword('marisol')
    expect(new Set((await marisol.source.runReport('rep-scorecard')).rows.map((r) => r[1])).size).toBeGreaterThan(3) // both stores now
    await dana.source.accountAction({ type: 'changeAccess', id: 'marisol', role: 'manager', storeId: 'hillcrest' })
  })

  it('only admins read the audit log; nobody can change it', async () => {
    const { live: dana } = await signInWithPassword('dana')
    const entries = await dana.source.audit()
    expect(entries.length).toBeGreaterThan(10)
    expect(entries.some((e) => e.action === 'turned_off' && e.targetId === 'kevin' && e.actorId === 'lena')).toBe(true)
    const { live: lena } = await signInWithPassword('lena')
    expect(await lena.source.audit()).toEqual([])
    await db.query('BEGIN')
    await expect(db.query("UPDATE audit_log SET actor_id = 'tasha'")).rejects.toThrow(/add-only/)
    await db.query('ROLLBACK')
    const { error } = await dana.client.from('audit_log').insert({ actor_id: 'dana', action: 'turned_on' })
    expect(error?.message).toMatch(/permission denied/)
  })

  it('a browser can’t write account changes itself', async () => {
    const { live: dana } = await signInWithPassword('dana')
    const { error } = await dana.client.rpc('apply_account_change', { change: {} })
    expect(error?.message).toMatch(/permission denied/)
    expect(await lastMailId('nobody@lanternlane.test')).toBeUndefined()
  })
})
