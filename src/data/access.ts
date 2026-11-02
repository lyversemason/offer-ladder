// Who may see what (docs/accounts-plan.md). Plain rules with tests, used by the
// screens; the live database applies the same rules to every query
// (supabase/migrations/*_accounts.sql), and tests/db/access.test.ts checks the two
// agree for every person.

export type Role = 'rep' | 'manager' | 'admin'
/** invited: hasn't signed in yet. off: access turned off (never deleted). */
export type Status = 'invited' | 'active' | 'off'

export interface Person {
  id: string
  name: string
  email: string
  role: Role
  /** The store a rep or store manager works at; null for an admin. */
  storeId: string | null
  /** For a rep: their id in the reps table. */
  repId: string | null
  status: Status
}

/** Anything that belongs to one rep at one store: a customer, a sale, an offer, a usage event. */
export interface Owned {
  repId: string
  storeId: string
}

/**
 * Whether someone may see a record: an admin sees everything, a store manager
 * their store, a rep their own. Nobody sees anything unless their access is on.
 */
export function canSee(viewer: Person | null, record: Owned): boolean {
  if (!viewer || viewer.status !== 'active') return false
  if (viewer.role === 'admin') return true
  if (viewer.role === 'manager') return viewer.storeId === record.storeId
  return viewer.repId === record.repId
}

/** Whether someone may see the company-wide things everyone prices with: the catalog, the rules, the store names. */
export function canSeeShared(viewer: Person | null): boolean {
  return !!viewer && viewer.status === 'active'
}

/**
 * Whether someone may see a person's account: their own (always, so someone whose
 * access is off can be told so), their store's (managers), everyone's (admins).
 */
export function canSeePerson(viewer: Person | null, person: Person): boolean {
  if (!viewer) return false
  if (viewer.id === person.id) return true
  if (viewer.status !== 'active') return false
  if (viewer.role === 'admin') return true
  return viewer.role === 'manager' && person.storeId === viewer.storeId
}

/** The roles someone may invite people as, and to which stores (null = no store: an admin). */
export function canInvite(actor: Person | null, role: Role, storeId: string | null): boolean {
  if (!actor || actor.status !== 'active') return false
  if (actor.role === 'admin') return role === 'admin' ? storeId === null : storeId !== null
  return actor.role === 'manager' && role === 'rep' && storeId === actor.storeId
}

/**
 * Whether someone may manage a person's access (resend or cancel an invitation,
 * turn access off or on): an admin anyone but themselves, a store manager the
 * reps at their store.
 */
export function canManage(actor: Person | null, target: Person): boolean {
  if (!actor || actor.status !== 'active' || actor.id === target.id) return false
  if (actor.role === 'admin') return true
  return actor.role === 'manager' && target.role === 'rep' && target.storeId === actor.storeId
}

/** Whether someone may change a person's role or store: admins only, never their own. */
export function canChangeAccess(actor: Person | null, target: Person): boolean {
  return !!actor && actor.status === 'active' && actor.role === 'admin' && actor.id !== target.id
}
