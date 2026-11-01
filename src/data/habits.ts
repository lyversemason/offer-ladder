// The demo history's second layer (usage tracking): how each rep uses the app,
// how they put an offer together, and how customers react to what's offered.
// Everything here is made up and PLANTED on purpose, so the Usage and Deal
// patterns screens have something to find. docs/usage-plan.md lists the plan.
//
// Tool habits:
//   Tasha   uses it with nearly every customer and records everything
//   Kevin   cuts the adjustable base first (up to half off); skips recording a
//           quarter of his walk-outs; tries prices the store refuses most often
//   Renee   quick to the first offer; often makes delivery free
//   Marcus  makes delivery free first (his premium line is price-locked)
//   Andre   middle of the pack on everything
//   Sofia   new hire: Look up and Inventory at first, typed SKUs by September;
//           uses the app more every month, and gets faster
//   Ben     scratchpad user: tries many prices, records few of them; uses the
//           app with the smallest share of his customers
//
// Customer patterns (the same for every rep):
//   - Free delivery on a ticket of $2,500 or more makes a sale more likely, and
//     makes the customer more likely to say yes to the offer that made it free.
//   - Financing helps; 6 months helps most.
//   - Taking 15% or more off the adjustable base helps, but going past 35% adds
//     nothing more: commission given up for no extra sales.
import { distribute, evaluate } from '../engine'
import type { Ctx, Deal, Evaluation } from '../engine'
import type { DiscountHow, DiscountScope } from '../db/database'
import type { Rand } from './random'
import { weighted } from './random'

export type Style = 'spread' | 'delivery' | 'base'
export type AddHow = 'sku' | 'search' | 'lookup' | 'inventory'
type Weights<K extends string> = Partial<Record<K, number>>
/** A number, or how it changes from the first month to the last. */
export type Ramp = number | [first: number, last: number]

export interface Habits {
  /** Chance the rep uses the app with a customer at all. */
  coverage: Ramp
  /** Chance a walk-out gets recorded (otherwise the ticket is just dropped). */
  recordWalk: number
  /** Chance each offer said out loud is recorded with "I offered this price". */
  recordOffer: number
  /** How items get on the ticket; two sets = first month and last month. */
  addHow: Weights<AddHow> | [Weights<AddHow>, Weights<AddHow>]
  /** How discounts are typed in. */
  discountHow: Weights<DiscountHow>
  /** How an offer's discount is put together. */
  styles: Weights<Style>
  /** In the "base" style: the most taken off the base, in basis points. */
  baseCutBp: number
  /** Prices tried but not offered, per offer (scratchpad use). */
  scratch: [min: number, max: number]
  /** Chance of trying a price the store refuses, per ticket. */
  floorHit: number
  /** Chance of opening the GM calculator, per ticket. */
  gm: number
  /** Minutes from the first item to the first offer. */
  firstOffer: Ramp
}

export const AVERAGE_HABITS: Habits = {
  coverage: 0.85,
  recordWalk: 0.92,
  recordOffer: 0.85,
  addHow: { sku: 50, search: 35, lookup: 12, inventory: 3 },
  discountHow: { new_price: 45, percent: 35, dollars: 20 },
  styles: { spread: 60, delivery: 25, base: 15 },
  baseCutBp: 3000,
  scratch: [0, 2],
  floorHit: 0.04,
  gm: 0.25,
  firstOffer: 7,
}

export const HABITS: Record<string, Habits> = {
  tasha: {
    ...AVERAGE_HABITS,
    coverage: 0.96,
    recordWalk: 0.98,
    recordOffer: 0.96,
    addHow: { sku: 70, search: 25, lookup: 5 },
    discountHow: { new_price: 50, percent: 40, dollars: 10 },
    scratch: [0, 1],
    floorHit: 0.01,
    gm: 0.35,
  },
  kevin: {
    ...AVERAGE_HABITS,
    coverage: 0.88,
    recordWalk: 0.75,
    recordOffer: 0.9,
    addHow: { sku: 35, search: 50, lookup: 15 },
    discountHow: { percent: 70, dollars: 20, new_price: 10 },
    styles: { base: 65, spread: 25, delivery: 10 },
    baseCutBp: 5000,
    scratch: [1, 3],
    floorHit: 0.3,
    gm: 0.1,
    firstOffer: 4,
  },
  renee: { ...AVERAGE_HABITS, coverage: 0.93, recordWalk: 0.96, styles: { spread: 50, delivery: 40, base: 10 }, firstOffer: 3 },
  marcus: {
    ...AVERAGE_HABITS,
    coverage: 0.82,
    recordOffer: 0.8,
    addHow: { sku: 80, search: 15, lookup: 5 },
    styles: { delivery: 75, spread: 25 },
    firstOffer: 9,
  },
  andre: { ...AVERAGE_HABITS, coverage: 0.76 },
  sofia: {
    ...AVERAGE_HABITS,
    coverage: [0.6, 0.93],
    addHow: [
      { lookup: 45, inventory: 25, search: 25, sku: 5 },
      { sku: 50, search: 30, lookup: 15, inventory: 5 },
    ],
    floorHit: 0.08,
    gm: 0.45,
    firstOffer: [13, 6],
  },
  ben: {
    ...AVERAGE_HABITS,
    coverage: 0.68,
    recordWalk: 0.88,
    recordOffer: 0.35,
    styles: { spread: 50, base: 30, delivery: 20 },
    scratch: [3, 6],
    gm: 0.6,
    firstOffer: 10,
  },
}

/** A ramped value at a point in the six months (0 = first day, 1 = last). */
export function rampAt(value: Ramp, t: number): number {
  return typeof value === 'number' ? value : value[0] + (value[1] - value[0]) * t
}

/** How items get added at a point in the six months. */
export function addHowAt(h: Habits, rand: Rand, t: number): AddHow {
  if (!Array.isArray(h.addHow)) return weighted(rand, h.addHow)
  const [a, b] = h.addHow
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as AddHow[]
  return weighted<AddHow>(rand, Object.fromEntries(keys.map((k) => [k, (a[k] ?? 0) * (1 - t) + (b[k] ?? 0) * t])) as Weights<AddHow>)
}

/* ---------------------------------------------------------------- customers */

/** A ticket this big (pre-tax, at its asking price) or more is a "big ticket". */
export const BIG_TICKET_CENTS = 250000
/** Free delivery on a big ticket: how much more likely a sale is. */
export const FREE_DELIVERY_LIFT = 1.3
/** The same, for saying yes to the offer that made delivery free. */
export const FREE_DELIVERY_ACCEPT_LIFT = 1.6
export const FINANCING_LIFT = 1.1
export const SIX_MONTH_LIFT = 1.45
/** Base discount of at least 15% helps; past 35% helps no more. */
export const BASE_DISCOUNT_LIFT = 1.15
export const BASE_HELPS_FROM_BP = 1500
export const BASE_STOPS_HELPING_BP = 3500
/** Keeps each rep's overall conversion near what their sales profile says. */
const LIFT_NORM = 1.08

export interface OfferFeatures {
  askingCents: number
  freeDelivery: boolean
  financingMonths: number | null
  /** The most taken off an adjustable base on any offer, in basis points (0 = no base, or none off). */
  baseCutBp: number
}

/** How much more (or less) likely a sale is because of what was offered. */
export function saleLift(f: OfferFeatures): number {
  let lift = 1
  if (f.freeDelivery && f.askingCents >= BIG_TICKET_CENTS) lift *= FREE_DELIVERY_LIFT
  if (f.financingMonths === 6) lift *= SIX_MONTH_LIFT
  else if (f.financingMonths) lift *= FINANCING_LIFT
  if (f.baseCutBp >= BASE_HELPS_FROM_BP) lift *= BASE_DISCOUNT_LIFT
  return lift / LIFT_NORM
}

/* ------------------------------------------------------------------- offers */

export type Via = { how: DiscountHow; scope: DiscountScope }

export interface BuiltOffer {
  deal: Deal
  ev: Evaluation
  /** How each discounted line's discount was entered, by line id. */
  via: Record<string, Via>
}

/** Whether delivery on this deal is free although its tier normally costs something. */
export function deliveryIsFree(deal: Deal, ctx: Ctx): boolean {
  if (!deal.delivery) return false
  const tier = ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId)
  return !!tier && tier.priceCents > 0 && deal.delivery.priceCents === 0
}

/** The adjustable base's line on a deal (the first one), if any. */
export function baseLine(ev: Evaluation): string | null {
  return ev.lines.find((l) => l.product.category === 'adjustable-base' && !l.locked)?.lineId ?? null
}

/** The share taken off the base on a deal, in basis points. */
export function baseCutBp(ev: Evaluation): number {
  const row = ev.lines.find((l) => l.product.category === 'adjustable-base')
  return row && row.listCents > 0 ? Math.floor((10000 * row.discountCents) / row.listCents) : 0
}

/**
 * Builds an offer at exactly the ladder's price (asking price − cut), put together
 * the rep's way. The total is the same whichever way it's built, so the margin,
 * tier and commission are too; only what's on each line differs. Falls back to
 * the ladder's own (spread) offer when the rep's way doesn't land on the price.
 */
export function buildOffer(
  base: Deal,
  rung: { deal: Deal; ev: Evaluation },
  style: Style,
  hows: { row: DiscountHow; ticket: DiscountHow },
  baseCut: number,
  ctx: Ctx,
): BuiltOffer {
  const asking = evaluate(base, ctx).toplineCents
  const cut = asking - rung.ev.toplineCents
  const marks = (deal: Deal, rowIds: string[]): Record<string, Via> => {
    const via: Record<string, Via> = {}
    for (const l of deal.lines) {
      if (l.discountCents === 0) continue
      via[l.id] = rowIds.includes(l.id) ? { how: hows.row, scope: 'row' } : { how: hows.ticket, scope: 'ticket' }
    }
    return via
  }
  const fallback = (): BuiltOffer => ({ deal: rung.deal, ev: rung.ev, via: marks(rung.deal, []) })
  if (cut <= 0) return { deal: base, ev: evaluate(base, ctx), via: {} }

  let deal = base
  let left = cut
  const rows: string[] = []
  if (style === 'delivery' && deal.delivery) {
    const off = Math.min(left, deal.delivery.priceCents)
    deal = { ...deal, delivery: { ...deal.delivery, priceCents: deal.delivery.priceCents - off } }
    left -= off
  } else if (style === 'base') {
    const ev0 = evaluate(deal, ctx)
    const id = baseLine(ev0)
    const row = ev0.lines.find((l) => l.lineId === id)
    if (row) {
      const off = Math.min(left, Math.floor((row.listCents * baseCut) / 10000))
      deal = { ...deal, lines: deal.lines.map((l) => (l.id === id ? { ...l, discountCents: off } : l)) }
      left -= off
      if (off > 0) rows.push(row.lineId)
    }
  }
  if (left > 0) {
    const spread = distribute(deal, left, 'spread', ctx)
    if (spread.appliedCents !== left) return fallback()
    deal = spread.deal
  }
  const ev = evaluate(deal, ctx)
  if (ev.toplineCents !== rung.ev.toplineCents || !ev.ok) return fallback()
  return { deal, ev, via: marks(deal, rows) }
}
