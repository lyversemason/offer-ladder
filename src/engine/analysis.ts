// The GM calculator: the ticket's gross dollars and margin line by line, the
// way a point-of-sale margin screen shows them. Delivery is a line like any
// product (its price, and the store's delivery cost); financing only changes
// gross. The lines always add up to the ticket's totals.
import { marginBp } from './money'
import type { Bp, Cents } from './money'
import type { Evaluation, PriceCost } from './types'

/** An item's margin at its list price, for catalog listings. */
export function listMarginBp(pc: PriceCost): Bp {
  return marginBp(pc.listCents - pc.costCents, pc.listCents)
}

export interface GmRow {
  kind: 'item' | 'delivery' | 'financing'
  /** The deal line, for items. */
  lineId?: string
  sellingCents: Cents
  costCents: Cents
  grossCents: Cents
  /** null when the row has no selling price (free delivery, financing). */
  marginBp: Bp | null
}

export interface GmAnalysis {
  rows: GmRow[]
  totals: { sellingCents: Cents; costCents: Cents; grossCents: Cents; marginBp: Bp }
}

export function gmAnalysis(ev: Evaluation): GmAnalysis {
  const row = (r: Omit<GmRow, 'grossCents' | 'marginBp'>, adjCents = 0): GmRow => {
    const grossCents = r.sellingCents - r.costCents + adjCents
    return { ...r, grossCents, marginBp: r.sellingCents > 0 ? marginBp(grossCents, r.sellingCents) : null }
  }
  const rows: GmRow[] = ev.lines.map((l) =>
    row({ kind: 'item', lineId: l.lineId, sellingCents: l.netCents, costCents: l.costCents }),
  )
  if (ev.deliveryCostCents > 0 || ev.deliveryPriceCents > 0) {
    rows.push(row({ kind: 'delivery', sellingCents: ev.deliveryPriceCents, costCents: ev.deliveryCostCents }))
  }
  if (ev.financingAdjCents !== 0) {
    rows.push(row({ kind: 'financing', sellingCents: 0, costCents: 0 }, ev.financingAdjCents))
  }
  return {
    rows,
    totals: {
      sellingCents: ev.toplineCents,
      costCents: ev.productCostCents + ev.deliveryCostCents,
      grossCents: ev.grossCents,
      marginBp: ev.marginBp,
    },
  }
}
