// Turning a frozen iteration (what the rep sees) into an offer as the database
// stores it. Kept out of the screen files so they only export components.
import type { OfferDetail, OfferRecord } from '../db/database'
import type { OfferMade } from './state'

/** An iteration as the offers table stores it, with every line, delivery, financing and reasons. */
export function toOfferRecord(o: OfferMade, accepted: boolean): OfferRecord {
  const detail: OfferDetail = {
    lines: o.lines.map((l) => ({
      sku: l.sku,
      condition: l.condition,
      qty: l.qty,
      listCents: l.listCents,
      discountCents: l.listCents - l.netCents,
      netCents: l.netCents,
      // Iterations saved before v0.14.0 didn't keep cost; 0 marks it unknown there.
      costCents: l.costCents ?? 0,
      locked: l.locked ?? false,
      discountHow: l.discountHow ?? null,
      discountScope: l.discountScope ?? null,
    })),
    delivery: o.delivery?.tierId ? { tierId: o.delivery.tierId, listCents: o.delivery.listCents, priceCents: o.delivery.priceCents } : null,
    financingMonths: o.financingMonths,
    reasons: o.reasons,
  }
  return { toplineCents: o.toplineCents, marginBp: o.marginBp, tierId: o.tierId, commissionCents: o.commissionCents, accepted, detail }
}
