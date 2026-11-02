// Account changes: inviting people, resending or cancelling an invitation,
// accepting it, turning access off and on, changing a role or store. Each one is
// checked against the rules in access.ts and the guard rails below, and returns
// the changed people plus the audit entries to write with them. Used by the demo
// source and the live server (server/save.ts), so the two follow the same rules.
// No database code here.
import { canChangeAccess, canInvite, canManage } from './access'
import type { Person, Role } from './access'
import { STORES } from './org'

/** A person with their account's history. */
export interface PersonRecord extends Person {
  invitedBy: string | null
  invitedAt: string | null
  activatedAt: string | null
  turnedOffAt: string | null
  turnedOffBy: string | null
}

/** One line of the audit log: who did what to whom, when. Nobody can change or delete these. */
export interface AuditEntry {
  /** ISO date and time. */
  at: string
  actorId: string
  action: AuditAction
  /** The person it was done to (null for rules and catalog changes). */
  targetId: string | null
  detail: Record<string, unknown>
}

export type AuditAction =
  | 'invited'
  | 'invite_resent'
  | 'invite_cancelled'
  | 'invite_accepted'
  | 'turned_off'
  | 'turned_on'
  | 'access_changed'
  | 'rules_changed'
  | 'catalog_imported'

export type AccountAction =
  | { type: 'invite'; name: string; email: string; role: Role; storeId: string | null }
  | { type: 'resend'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'accept'; id: string }
  | { type: 'turnOff'; id: string }
  | { type: 'turnOn'; id: string }
  | { type: 'changeAccess'; id: string; role: Role; storeId: string | null }

export interface AccountChange {
  /** People whose records changed, or the new person, as they are now. */
  people: PersonRecord[]
  /** A new rep's row in the reps table (an invited rep needs one for their customers and sales). */
  newRep: { id: string; name: string; storeId: string; hiredOn: string } | null
  audit: AuditEntry[]
  /** An email to send (an invitation), or null. */
  email: { to: string; personId: string; inviterName: string } | null
  /** What happened, in plain words, for the screen. */
  message: string
}

/** A refusal, with the reason in plain words. */
export class AccountError extends Error {}

/** How long an invitation can be accepted (days). */
export const INVITE_DAYS = 7

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A new person's id: their first name in lower case, made unique ('jordan', 'jordan-2', ...). */
export function newPersonId(name: string, taken: Set<string>): string {
  const base = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'person'
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

const activeAdmins = (people: PersonRecord[]) => people.filter((p) => p.role === 'admin' && p.status === 'active')

/**
 * Works out one account change made by `actorId` at time `now` (ISO). Throws
 * AccountError when it isn't allowed. `accept` is done by the invited person.
 */
export function applyAccountAction(people: PersonRecord[], actorId: string, action: AccountAction, now: string): AccountChange {
  const actor = people.find((p) => p.id === actorId)
  if (!actor) throw new AccountError('Unknown person.')
  const find = (id: string) => {
    const p = people.find((x) => x.id === id)
    if (!p) throw new AccountError('That person isn’t in the list.')
    return p
  }
  const entry = (a: AuditAction, targetId: string | null, detail: Record<string, unknown> = {}): AuditEntry => ({ at: now, actorId, action: a, targetId, detail })
  const change = (p: PersonRecord, a: AuditAction, message: string, detail: Record<string, unknown> = {}): AccountChange => ({
    people: [p],
    newRep: null,
    audit: [entry(a, p.id, detail)],
    email: null,
    message,
  })

  switch (action.type) {
    case 'invite': {
      const name = action.name.trim()
      const email = action.email.trim().toLowerCase()
      if (!name || name.length > 80) throw new AccountError('Enter their name.')
      if (!EMAIL.test(email)) throw new AccountError('Enter a valid email address.')
      if (people.some((p) => p.email.toLowerCase() === email)) throw new AccountError('Someone already has that email.')
      const storeId = action.role === 'admin' ? null : action.storeId
      if (storeId !== null && !STORES.some((s) => s.id === storeId)) throw new AccountError('Pick a store.')
      if (!canInvite(actor, action.role, storeId)) {
        throw new AccountError(actor.role === 'manager' ? 'A store manager can only invite reps to their own store.' : 'You can’t invite people.')
      }
      const id = newPersonId(name, new Set(people.map((p) => p.id)))
      const person: PersonRecord = {
        id,
        name,
        email,
        role: action.role,
        storeId,
        repId: action.role === 'rep' ? id : null,
        status: 'invited',
        invitedBy: actor.id,
        invitedAt: now,
        activatedAt: null,
        turnedOffAt: null,
        turnedOffBy: null,
      }
      return {
        people: [person],
        newRep: action.role === 'rep' ? { id, name, storeId: storeId!, hiredOn: now.slice(0, 10) } : null,
        audit: [entry('invited', id, { role: action.role, storeId })],
        email: { to: email, personId: id, inviterName: actor.name },
        message: `Invitation sent to ${name} (${email}).`,
      }
    }

    case 'resend': {
      const p = find(action.id)
      if (!canManage(actor, p)) throw new AccountError('You can’t manage this person’s access.')
      if (p.status !== 'invited') throw new AccountError(`${p.name} isn’t waiting on an invitation.`)
      const c = change({ ...p, invitedAt: now }, 'invite_resent', `Invitation sent to ${p.name} again.`)
      return { ...c, email: { to: p.email, personId: p.id, inviterName: actor.name } }
    }

    case 'cancel': {
      const p = find(action.id)
      if (!canManage(actor, p)) throw new AccountError('You can’t manage this person’s access.')
      if (p.status !== 'invited') throw new AccountError(`${p.name} isn’t waiting on an invitation.`)
      return change({ ...p, status: 'off', turnedOffAt: now, turnedOffBy: actor.id }, 'invite_cancelled', `${p.name}’s invitation is cancelled.`)
    }

    case 'accept': {
      const p = find(action.id)
      if (actor.id !== p.id) throw new AccountError('Only the invited person can accept their invitation.')
      if (p.status !== 'invited') throw new AccountError('There’s no invitation waiting.')
      const sent = Date.parse(p.invitedAt ?? '')
      if (!(Date.parse(now) - sent <= INVITE_DAYS * 86_400_000)) {
        throw new AccountError(`This invitation has expired (they last ${INVITE_DAYS} days). Ask your manager to send it again.`)
      }
      return change({ ...p, status: 'active', activatedAt: now }, 'invite_accepted', `Welcome, ${p.name}.`)
    }

    case 'turnOff': {
      const p = find(action.id)
      if (p.id === actor.id) throw new AccountError('You can’t turn off your own access.')
      if (!canManage(actor, p)) throw new AccountError('You can’t manage this person’s access.')
      if (p.status !== 'active') throw new AccountError(`${p.name}’s access isn’t on.`)
      if (p.role === 'admin' && activeAdmins(people).length <= 1) throw new AccountError('The last admin’s access can’t be turned off.')
      return change({ ...p, status: 'off', turnedOffAt: now, turnedOffBy: actor.id }, 'turned_off', `${p.name}’s access is off. Their history stays.`)
    }

    case 'turnOn': {
      const p = find(action.id)
      if (!canManage(actor, p)) throw new AccountError('You can’t manage this person’s access.')
      if (p.status !== 'off') throw new AccountError(`${p.name}’s access is already on.`)
      // Someone who never finished their invitation gets a fresh one.
      const next: PersonRecord = p.activatedAt
        ? { ...p, status: 'active', turnedOffAt: null, turnedOffBy: null }
        : { ...p, status: 'invited', invitedAt: now, turnedOffAt: null, turnedOffBy: null }
      const c = change(next, 'turned_on', p.activatedAt ? `${p.name}’s access is back on.` : `${p.name} is invited again.`)
      return p.activatedAt ? c : { ...c, email: { to: p.email, personId: p.id, inviterName: actor.name } }
    }

    case 'changeAccess': {
      const p = find(action.id)
      if (!canChangeAccess(actor, p)) throw new AccountError(p.id === actor.id ? 'You can’t change your own role.' : 'Only an admin can change roles and stores.')
      if (p.role === 'rep' && action.role !== 'rep') throw new AccountError('A rep’s role can’t change: invite them again as a manager.')
      if (p.role !== 'rep' && action.role === 'rep') throw new AccountError('Only reps are reps: a manager or admin can’t become one here.')
      const storeId = action.role === 'admin' ? null : action.storeId
      if (action.role !== 'admin' && !STORES.some((s) => s.id === storeId)) throw new AccountError('Pick a store.')
      if (p.role === 'admin' && action.role !== 'admin' && p.status === 'active' && activeAdmins(people).length <= 1) {
        throw new AccountError('The last admin can’t become a store manager.')
      }
      if (p.role === action.role && p.storeId === storeId) throw new AccountError('Nothing to change.')
      return change({ ...p, role: action.role, storeId }, 'access_changed', `${p.name} is now ${action.role === 'admin' ? 'an admin' : `${action.role === 'manager' ? 'store manager' : 'a rep'} at ${STORES.find((s) => s.id === storeId)!.name}`}.`, {
        before: { role: p.role, storeId: p.storeId },
        after: { role: action.role, storeId },
      })
    }
  }
}

/** JSON with every object's keys in alphabetical order, so the same content always reads the same (Postgres reorders keys). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The rule set's top-level parts that differ, for the audit log ("changed the tiers and the exceptions margin"). */
export function changedRules(before: object, after: object): string[] {
  const a = before as Record<string, unknown>
  const b = after as Record<string, unknown>
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stable(a[k]) !== stable(b[k])).sort()
}

/** The people at the start of the demo history, with their account history. */
export function seedPeople(people: Person[]): PersonRecord[] {
  const managerOf = (store: string | null) => people.find((p) => p.role === 'manager' && p.status === 'active' && p.storeId === store)?.id ?? null
  return people.map((p) => ({
    ...p,
    invitedBy: p.role === 'admin' ? null : p.role === 'manager' ? 'dana' : managerOf(p.storeId),
    invitedAt: '2026-03-02T14:00:00.000Z',
    activatedAt: '2026-03-02T15:00:00.000Z',
    turnedOffAt: p.status === 'off' ? '2026-03-30T21:00:00.000Z' : null,
    turnedOffBy: p.status === 'off' ? 'dana' : null,
  }))
}

/** The account history behind the starting people, as audit entries (oldest first). */
export function seedAudit(people: PersonRecord[]): AuditEntry[] {
  const out: AuditEntry[] = []
  for (const p of people) {
    if (p.invitedBy && p.invitedAt) out.push({ at: p.invitedAt, actorId: p.invitedBy, action: 'invited', targetId: p.id, detail: { role: p.role, storeId: p.storeId } })
    if (p.activatedAt) out.push({ at: p.activatedAt, actorId: p.id, action: 'invite_accepted', targetId: p.id, detail: {} })
  }
  for (const p of people) {
    if (p.turnedOffAt && p.turnedOffBy) out.push({ at: p.turnedOffAt, actorId: p.turnedOffBy, action: 'turned_off', targetId: p.id, detail: {} })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

/** The invitation email, as the demo shows it on screen (live mode sends the real one). */
export function invitationEmail(email: { to: string; inviterName: string }): { to: string; subject: string; body: string } {
  return {
    to: email.to,
    subject: 'You’re invited to OfferLadder',
    body: `${email.inviterName} invited you to OfferLadder, Lantern Lane Home’s offer and commission calculator. Open OfferLadder and sign in with this email address; there’s no password. The invitation is good for ${INVITE_DAYS} days.`,
  }
}
