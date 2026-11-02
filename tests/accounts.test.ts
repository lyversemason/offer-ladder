// Account changes (src/data/accounts.ts) and the rules behind them (access.ts):
// who may invite whom, managing access, the guard rails, invitations expiring,
// and the audit entry every change writes.
import { describe, expect, it } from 'vitest'
import { AccountError, applyAccountAction, changedRules, newPersonId, seedAudit, seedPeople } from '../src/data/accounts'
import type { AccountAction, PersonRecord } from '../src/data/accounts'
import { PEOPLE } from '../src/data/org'
import { DEFAULT_SETTINGS } from '../src/data/settings'

const NOW = '2026-11-01T18:00:00.000Z'
const people = () => seedPeople(PEOPLE)
const run = (actor: string, action: AccountAction, list: PersonRecord[] = people(), now = NOW) => applyAccountAction(list, actor, action, now)
const refused = (actor: string, action: AccountAction, list?: PersonRecord[]) => () => run(actor, action, list)
const invite = (role: 'rep' | 'manager' | 'admin', storeId: string | null, email = 'jordan@lanternlane.test'): AccountAction => ({ type: 'invite', name: 'Jordan Reyes', email, role, storeId })
/** The list after a change. */
const after = (list: PersonRecord[], c: ReturnType<typeof run>) => [...list.filter((p) => !c.people.some((x) => x.id === p.id)), ...c.people]

describe('inviting', () => {
  it('a store manager invites reps to their own store, nothing else', () => {
    const c = run('lena', invite('rep', 'riverside'))
    expect(c.people[0]).toMatchObject({ id: 'jordan', role: 'rep', storeId: 'riverside', repId: 'jordan', status: 'invited', invitedBy: 'lena', invitedAt: NOW })
    expect(c.newRep).toEqual({ id: 'jordan', name: 'Jordan Reyes', storeId: 'riverside', hiredOn: '2026-11-01' })
    expect(c.email).toEqual({ to: 'jordan@lanternlane.test', personId: 'jordan', inviterName: 'Lena Hart' })
    expect(c.audit).toEqual([{ at: NOW, actorId: 'lena', action: 'invited', targetId: 'jordan', detail: { role: 'rep', storeId: 'riverside' } }])
    expect(refused('lena', invite('rep', 'hillcrest'))).toThrow(/their own store/)
    expect(refused('lena', invite('manager', 'riverside'))).toThrow(/only invite reps/)
    expect(refused('tasha', invite('rep', 'riverside'))).toThrow(AccountError)
    expect(refused('owen', invite('rep', 'hillcrest'))).toThrow(AccountError)
  })

  it('an admin invites anyone; admins have no store, everyone else needs one', () => {
    expect(run('dana', invite('manager', 'hillcrest')).people[0]).toMatchObject({ role: 'manager', storeId: 'hillcrest', repId: null })
    expect(run('dana', invite('admin', 'riverside')).people[0]).toMatchObject({ role: 'admin', storeId: null })
    expect(run('dana', invite('manager', 'hillcrest')).newRep).toBeNull()
    expect(refused('dana', invite('rep', 'nowhere'))).toThrow(/Pick a store/)
  })

  it('needs a name and a new, valid email; ids are first names made unique', () => {
    expect(refused('dana', { ...invite('rep', 'riverside'), email: 'not-an-email' })).toThrow(/valid email/)
    expect(refused('dana', { ...invite('rep', 'riverside'), email: 'LENA@lanternlane.test' })).toThrow(/already has that email/)
    expect(refused('dana', { ...invite('rep', 'riverside'), name: '  ' })).toThrow(/name/)
    expect(newPersonId('Tasha Brown', new Set(['tasha']))).toBe('tasha-2')
    expect(newPersonId("Ana-María O'Neil", new Set())).toBe('anamara')
  })
})

describe('invitations: resend, cancel, accept', () => {
  const invited = () => {
    const list = people()
    return after(list, run('lena', invite('rep', 'riverside'), list))
  }

  it('the invited person accepts within 7 days; after that it has expired', () => {
    const list = invited()
    expect(run('jordan', { type: 'accept', id: 'jordan' }, list, '2026-11-07T18:00:00.000Z').people[0]).toMatchObject({ status: 'active', activatedAt: '2026-11-07T18:00:00.000Z' })
    expect(() => run('jordan', { type: 'accept', id: 'jordan' }, list, '2026-11-09T18:00:00.000Z')).toThrow(/expired/)
    expect(refused('lena', { type: 'accept', id: 'jordan' }, list)).toThrow(/Only the invited person/)
  })

  it('resending starts the 7 days again and sends the email; cancelling turns the account off', () => {
    const list = invited()
    const resent = run('lena', { type: 'resend', id: 'jordan' }, list, '2026-11-06T18:00:00.000Z')
    expect(resent.people[0].invitedAt).toBe('2026-11-06T18:00:00.000Z')
    expect(resent.email?.to).toBe('jordan@lanternlane.test')
    expect(run('lena', { type: 'cancel', id: 'jordan' }, list).people[0]).toMatchObject({ status: 'off', turnedOffBy: 'lena' })
    expect(refused('marisol', { type: 'cancel', id: 'jordan' }, list)).toThrow(/can’t manage/)
    expect(refused('lena', { type: 'resend', id: 'kevin' })).toThrow(/isn’t waiting/)
  })
})

describe('turning access off and on', () => {
  it('a store manager turns their own reps off and on; history stays', () => {
    const list = people()
    const off = run('lena', { type: 'turnOff', id: 'kevin' }, list)
    expect(off.people[0]).toMatchObject({ status: 'off', turnedOffBy: 'lena', repId: 'kevin' })
    expect(off.audit[0]).toMatchObject({ action: 'turned_off', actorId: 'lena', targetId: 'kevin' })
    expect(run('lena', { type: 'turnOn', id: 'kevin' }, after(list, off)).people[0]).toMatchObject({ status: 'active', turnedOffAt: null })
    expect(refused('lena', { type: 'turnOff', id: 'ben' })).toThrow(/can’t manage/)
    expect(refused('lena', { type: 'turnOff', id: 'marisol' })).toThrow(/can’t manage/)
  })

  it('guard rails: nobody turns themselves off, and the last admin stays on', () => {
    expect(refused('dana', { type: 'turnOff', id: 'dana' })).toThrow(/your own access/)
    const two = after(people(), run('dana', invite('admin', null, 'pat@lanternlane.test')))
    const pat = two.find((p) => p.id === 'jordan')!
    const active = two.map((p) => (p.id === pat.id ? { ...p, status: 'active' as const, activatedAt: NOW } : p))
    // With a second active admin, Dana can be turned off by them, but then that admin is the last one.
    const offDana = run('jordan', { type: 'turnOff', id: 'dana' }, active)
    expect(offDana.people[0].status).toBe('off')
    expect(() => run('dana', { type: 'turnOff', id: 'jordan' }, after(active, offDana))).toThrow(AccountError)
  })

  it('turning on someone who never finished their invitation invites them again', () => {
    const list = people()
    const withJordan = after(list, run('lena', invite('rep', 'riverside'), list))
    const cancelled = after(withJordan, run('lena', { type: 'cancel', id: 'jordan' }, withJordan))
    const back = run('lena', { type: 'turnOn', id: 'jordan' }, cancelled)
    expect(back.people[0].status).toBe('invited')
    expect(back.email?.to).toBe('jordan@lanternlane.test')
  })
})

describe('changing a role or store', () => {
  it('only an admin, never their own; managers move stores or become admins; reps stay reps', () => {
    const c = run('dana', { type: 'changeAccess', id: 'lena', role: 'admin', storeId: null })
    expect(c.people[0]).toMatchObject({ role: 'admin', storeId: null })
    expect(c.audit[0].detail).toEqual({ before: { role: 'manager', storeId: 'riverside' }, after: { role: 'admin', storeId: null } })
    expect(run('dana', { type: 'changeAccess', id: 'kevin', role: 'rep', storeId: 'hillcrest' }).people[0].storeId).toBe('hillcrest')
    expect(refused('lena', { type: 'changeAccess', id: 'kevin', role: 'rep', storeId: 'hillcrest' })).toThrow(/Only an admin/)
    expect(refused('dana', { type: 'changeAccess', id: 'dana', role: 'manager', storeId: 'riverside' })).toThrow(/your own role/)
    expect(refused('dana', { type: 'changeAccess', id: 'kevin', role: 'manager', storeId: 'riverside' })).toThrow(/A rep’s role can’t change/)
    expect(refused('dana', { type: 'changeAccess', id: 'lena', role: 'rep', storeId: 'riverside' })).toThrow(/can’t become one/)
    expect(refused('dana', { type: 'changeAccess', id: 'lena', role: 'manager', storeId: 'riverside' })).toThrow(/Nothing to change/)
  })
})

describe('the audit log', () => {
  it('names the rule parts that changed', () => {
    expect(changedRules(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, exceptionMarginBp: 2400, salesTaxBp: 700 })).toEqual(['exceptionMarginBp', 'salesTaxBp'])
    expect(changedRules(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual([])
    // The same rules with their parts in another order (as Postgres stores them) haven't changed.
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v
    expect(changedRules(DEFAULT_SETTINGS, reverseKeys(DEFAULT_SETTINGS) as object)).toEqual([])
  })
})

describe('the starting history', () => {
  it('has an invitation and an acceptance for everyone but the owner, and Owen turned off', () => {
    const audit = seedAudit(people())
    expect(audit.filter((e) => e.targetId === 'dana')).toEqual([])
    expect(audit.filter((e) => e.action === 'invited')).toHaveLength(PEOPLE.length - 1)
    expect(audit.filter((e) => e.action === 'invite_accepted')).toHaveLength(PEOPLE.length - 1)
    expect(audit.at(-1)).toMatchObject({ action: 'turned_off', actorId: 'dana', targetId: 'owen' })
  })
})
