// Words for the Accounts and Audit log screens (kept out of the screen files).
import type { AuditEntry, PersonRecord } from '../data/accounts'
import type { Role } from '../data/access'
import { STORES } from '../data/org'

export const ROLE_LABEL: Record<Role, string> = { rep: 'Rep', manager: 'Store manager', admin: 'Admin' }
export const storeName = (id: string | null) => (id ? (STORES.find((s) => s.id === id)?.name ?? id) : 'All stores')

/** A rule set's part, in words: 'exceptionMarginBp' → 'exceptions margin'. */
const RULE_WORDS: Record<string, string> = {
  tiers: 'tiers and rates',
  attach: 'base bonus',
  exceptionMarginBp: 'exceptions margin',
  salesTaxBp: 'sales tax',
  deliveryCostCents: 'delivery cost',
  deliveryTiers: 'delivery options',
  financing: 'financing chart',
  priceLock: 'price-locked models',
  pairing: 'pairing rule',
  roundToCents: 'rounding',
}

export function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** One audit entry as a sentence: "Lena Hart invited Jordan Reyes as a rep at Riverside." */
export function describe(e: AuditEntry, people: PersonRecord[]): string {
  const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? id) : '')
  const who = name(e.actorId)
  const whom = name(e.targetId)
  const d = e.detail as Record<string, unknown>
  switch (e.action) {
    case 'invited': {
      const role = d.role as Role
      return `${who} invited ${whom} as ${role === 'admin' ? 'an admin' : `${role === 'rep' ? 'a rep' : 'store manager'} at ${storeName(d.storeId as string)}`}.`
    }
    case 'invite_resent':
      return `${who} sent ${whom}’s invitation again.`
    case 'invite_cancelled':
      return `${who} cancelled ${whom}’s invitation.`
    case 'invite_accepted':
      return `${whom} accepted their invitation and signed in for the first time.`
    case 'turned_off':
      return `${who} turned off ${whom}’s access.`
    case 'turned_on':
      return `${who} turned ${whom}’s access back on.`
    case 'access_changed': {
      const a = d.after as { role: Role; storeId: string | null }
      return `${who} made ${whom} ${a.role === 'admin' ? 'an admin' : `${ROLE_LABEL[a.role].toLowerCase()} at ${storeName(a.storeId)}`}.`
    }
    case 'rules_changed': {
      const parts = ((d.changed as string[]) ?? []).map((k) => RULE_WORDS[k] ?? k)
      return parts.length ? `${who} changed the rules: ${parts.join(', ')}.` : `${who} saved the rules with no changes.`
    }
    case 'catalog_imported':
      return `${who} applied a catalog import: ${String(d.changed)} items updated, ${String(d.added)} added.`
  }
}
